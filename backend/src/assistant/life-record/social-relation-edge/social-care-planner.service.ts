import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlanDispatchType, ReminderScope, type Plan } from '@prisma/client';
import { PlanService } from '../../../plan/plan.service';
import { PrismaService } from '../../../infra/prisma.service';
import type { SocialCarePlanDecision, SocialCarePlanGenerateResult } from './social-relation-edge.types';
import { isFeatureEnabled } from '../../../config/feature-flags';

const USER_ENTITY_ID = 'default-user';
const DEFAULT_LIMIT = 2;
const PLAN_DELAY_MINUTES = 30;
const PLAN_COOLDOWN_DAYS = 14;
const MIN_EVENT_AGE_HOURS = 48;
const MAX_EVENT_AGE_DAYS = 21;
const RECENT_MENTION_DAYS = 3;
const QUALITY_THRESHOLD = 0.55;
const CARE_PLAN_KIND = 'social_care';
const DEFAULT_TIMEZONE = 'Asia/Shanghai';

@Injectable()
export class SocialCarePlannerService {
  private readonly logger = new Logger(SocialCarePlannerService.name);
  private readonly enabled: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly planService: PlanService,
    config: ConfigService,
  ) {
    this.enabled = isFeatureEnabled(config, 'socialCareScheduler');
  }

  async generateCarePlans(options?: {
    dryRun?: boolean;
    limit?: number;
    now?: Date;
  }): Promise<SocialCarePlanGenerateResult> {
    if (!this.enabled) {
      throw new ForbiddenException('Social care planning is disabled');
    }

    const now = options?.now ?? new Date();
    const limit = Math.max(1, options?.limit ?? DEFAULT_LIMIT);
    const decisions: SocialCarePlanDecision[] = [];
    const recentPlans = await this.loadRecentCarePlans(now);
    const candidates = await this.loadCandidateEdges(now, limit * 4);

    for (const edge of candidates) {
      if (decisions.filter((item) => item.outcome === 'created').length >= limit) {
        break;
      }

      const entity = edge.toEntity;
      const existingPlan = this.findRecentCarePlan(recentPlans, entity.id);
      if (existingPlan) {
        decisions.push({
          entityId: entity.id,
          entityName: entity.name,
          outcome: 'skipped',
          reason: `最近 ${PLAN_COOLDOWN_DAYS} 天内已经生成过一次主动关怀计划`,
          skipReason: 'existing_plan',
        });
        continue;
      }

      const enoughHistory = await this.hasEnoughRelationHistory(entity, now);
      if (!enoughHistory) {
        decisions.push({
          entityId: entity.id,
          entityName: entity.name,
          outcome: 'skipped',
          reason: `和 ${entity.name} 的关系事件样本还不够，暂时不主动提醒`,
          skipReason: 'insufficient_relation_history',
        });
        continue;
      }

      const recentlyMentioned = await this.hasRecentUserMention(entity, now);
      if (recentlyMentioned) {
        decisions.push({
          entityId: entity.id,
          entityName: entity.name,
          outcome: 'skipped',
          reason: `最近 ${RECENT_MENTION_DAYS} 天用户还在主动提到 ${entity.name}`,
          skipReason: 'recent_user_mention',
        });
        continue;
      }

      const reason = this.buildCareReason({
        entityName: entity.name,
        relation: entity.relation,
        trend: edge.trend,
        quality: edge.quality,
      });
      const scheduledFor = new Date(now.getTime() + PLAN_DELAY_MINUTES * 60_000);

      if (options?.dryRun) {
        decisions.push({
          entityId: entity.id,
          entityName: entity.name,
          outcome: 'created',
          reason,
          scheduledFor,
        });
        continue;
      }

      const conversation = await this.prisma.conversation.findFirst({
        where: { userId: 'default-user', isInternal: false, entryAgentId: 'xiaoqing' },
        orderBy: { updatedAt: 'desc' },
        select: { id: true },
      });
      if (!conversation) {
        decisions.push({
          entityId: entity.id,
          entityName: entity.name,
          outcome: 'skipped',
          reason: '当前没有可投递提醒的对话会话，暂不生成主动关怀计划',
          skipReason: 'missing_conversation',
        });
        continue;
      }

      const plan = await this.planService.createPlan({
        description: reason,
        scope: ReminderScope.chat,
        dispatchType: PlanDispatchType.notify,
        recurrence: 'once',
        runAt: scheduledFor,
        timezone: DEFAULT_TIMEZONE,
        conversationId: conversation.id,
        actionPayload: {
          kind: CARE_PLAN_KIND,
          entityId: entity.id,
          entityName: entity.name,
          edgeId: edge.id,
          trend: edge.trend,
          quality: edge.quality,
        },
      }, 'default-user');

      recentPlans.push(plan);
      decisions.push({
        entityId: entity.id,
        entityName: entity.name,
        outcome: 'created',
        reason,
        planId: plan.id,
        scheduledFor: plan.nextRunAt ?? scheduledFor,
      });
    }

    const created = decisions.filter((item) => item.outcome === 'created').length;
    const skipped = decisions.length - created;

    this.logger.log(
      `Social care planning complete: created=${created}, skipped=${skipped}, dryRun=${options?.dryRun ? 'true' : 'false'}`,
    );

    return {
      created,
      skipped,
      total: decisions.length,
      decisions,
    };
  }

  private async loadCandidateEdges(now: Date, take: number) {
    const minEventAt = new Date(now.getTime() - MAX_EVENT_AGE_DAYS * 86_400_000);
    const maxEventAt = new Date(now.getTime() - MIN_EVENT_AGE_HOURS * 3_600_000);

    return this.prisma.socialRelationEdge.findMany({
      where: {
        userId: 'default-user',
        fromEntityId: USER_ENTITY_ID,
        trend: 'declining',
        quality: { lte: QUALITY_THRESHOLD },
        lastEventAt: {
          gte: minEventAt,
          lte: maxEventAt,
        },
      },
      include: {
        toEntity: {
          select: {
            id: true,
            name: true,
            aliases: true,
            relation: true,
            mentionCount: true,
          },
        },
      },
      orderBy: [
        { updatedAt: 'desc' },
        { quality: 'asc' },
      ],
      take,
    });
  }

  private async loadRecentCarePlans(now: Date): Promise<Plan[]> {
    const threshold = new Date(now.getTime() - PLAN_COOLDOWN_DAYS * 86_400_000);
    return this.prisma.plan.findMany({
      where: {
        userId: 'default-user',
        scope: ReminderScope.chat,
        dispatchType: PlanDispatchType.notify,
        createdAt: { gte: threshold },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private findRecentCarePlan(plans: Plan[], entityId: string): Plan | null {
    for (const plan of plans) {
      const payload = this.readPayload(plan.actionPayload);
      if (payload.kind === CARE_PLAN_KIND && payload.entityId === entityId) {
        return plan;
      }
    }
    return null;
  }

  private readPayload(payload: unknown): { kind?: string; entityId?: string } {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return {};
    }

    const record = payload as Record<string, unknown>;
    return {
      kind: typeof record.kind === 'string' ? record.kind : undefined,
      entityId: typeof record.entityId === 'string' ? record.entityId : undefined,
    };
  }

  private async hasRecentUserMention(
    entity: { name: string; aliases: string[] },
    now: Date,
  ): Promise<boolean> {
    const since = new Date(now.getTime() - RECENT_MENTION_DAYS * 86_400_000);
    const names = [entity.name, ...entity.aliases].filter(Boolean);
    if (names.length === 0) return false;

    const recent = await this.prisma.message.findFirst({
      where: {
        role: 'user',
        createdAt: { gte: since },
        OR: names.map((name) => ({
          content: { contains: name },
        })),
      },
      select: { id: true },
    });

    return Boolean(recent);
  }

  private async hasEnoughRelationHistory(
    entity: { name: string; aliases: string[] },
    now: Date,
  ): Promise<boolean> {
    const since = new Date(now.getTime() - MAX_EVENT_AGE_DAYS * 86_400_000);
    const names = [entity.name, ...entity.aliases].filter(Boolean);
    if (names.length === 0) return false;

    const count = await this.prisma.tracePoint.count({
      where: {
        kind: 'relation_event',
        createdAt: { gte: since, lte: now },
        OR: names.map((name) => ({ people: { has: name } })),
      },
    });

    return count >= 2;
  }

  private buildCareReason(input: {
    entityName: string;
    relation: string;
    trend: string;
    quality: number;
  }): string {
    const relationLabel = this.describeRelation(input.relation, input.entityName);
    if (input.quality <= 0.35) {
      return `最近 ${relationLabel} 这段关系看起来有点紧绷，如果时机自然，也许可以轻轻关心一下近况。`;
    }
    if (input.trend === 'declining') {
      return `最近好像没怎么提到 ${input.entityName} 了，如果你愿意，也许可以轻轻问一句近况。`;
    }
    return `如果现在合适，也许可以顺手关心一下 ${relationLabel} 的近况。`;
  }

  private describeRelation(relation: string, entityName: string): string {
    switch (relation) {
      case 'family':
        return `和${entityName}`;
      case 'friend':
        return `和朋友${entityName}`;
      case 'colleague':
        return `和同事${entityName}`;
      case 'romantic':
        return `和${entityName}`;
      case 'pet':
        return `${entityName}`;
      default:
        return `和${entityName}`;
    }
  }
}
