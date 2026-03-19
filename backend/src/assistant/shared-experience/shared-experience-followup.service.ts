import { Injectable, Logger } from '@nestjs/common';
import { PlanDispatchType, ReminderScope, type Plan } from '@prisma/client';
import { PrismaService } from '../../infra/prisma.service';
import { PlanService } from '../../plan/plan.service';
import type {
  SharedExperienceFollowupDecision,
  SharedExperienceFollowupGenerateResult,
  SharedExperienceRecord,
} from './shared-experience.types';

const FOLLOWUP_PLAN_KIND = 'shared_experience_followup';
const DEFAULT_LIMIT = 2;
const PLAN_DELAY_MINUTES = 30;
const COOLDOWN_DAYS = 14;
const MIN_AGE_DAYS = 1;
const MAX_AGE_DAYS = 21;
const RECENT_MENTION_DAYS = 3;
const MIN_SIGNIFICANCE = 0.68;
const DEFAULT_TIMEZONE = 'Asia/Shanghai';
const FOLLOWUP_PATTERNS = [
  /面试/,
  /考试/,
  /答辩/,
  /汇报/,
  /结果/,
  /申请/,
  /手术/,
  /复查/,
  /搬家/,
  /出差/,
  /旅行/,
  /比赛/,
  /演出/,
  /发布/,
  /见面/,
  /约会/,
  /入职/,
  /离职/,
  /项目/,
  /ddl/i,
  /截止/,
];

@Injectable()
export class SharedExperienceFollowupService {
  private readonly logger = new Logger(SharedExperienceFollowupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly planService: PlanService,
  ) {}

  async generateFollowupPlans(options?: {
    dryRun?: boolean;
    limit?: number;
    now?: Date;
  }): Promise<SharedExperienceFollowupGenerateResult> {
    const now = options?.now ?? new Date();
    const limit = Math.max(1, options?.limit ?? DEFAULT_LIMIT);
    const decisions: SharedExperienceFollowupDecision[] = [];
    const recentPlans = await this.loadRecentPlans(now);
    const candidates = await this.loadCandidates(now);

    for (const experience of candidates) {
      if (decisions.filter((item) => item.outcome === 'created').length >= limit) break;

      const existing = this.findRecentPlan(recentPlans, experience.id);
      if (existing) {
        decisions.push({
          experienceId: experience.id,
          title: experience.title,
          outcome: 'skipped',
          reason: `最近 ${COOLDOWN_DAYS} 天内已经跟进过这段共同经历`,
          skipReason: 'existing_plan',
        });
        continue;
      }

      const cue = this.extractFollowupCue(experience);
      if (!cue) {
        decisions.push({
          experienceId: experience.id,
          title: experience.title,
          outcome: 'skipped',
          reason: '这段共同经历目前看不出明确的后续追问时机',
          skipReason: 'no_followup_cue',
        });
        continue;
      }

      const recentlyMentioned = await this.hasRecentUserMention(cue, now);
      if (recentlyMentioned) {
        decisions.push({
          experienceId: experience.id,
          title: experience.title,
          outcome: 'skipped',
          reason: `最近 ${RECENT_MENTION_DAYS} 天用户已经主动提到这件事了`,
          skipReason: 'recent_user_mention',
        });
        continue;
      }

      const scheduledFor = new Date(now.getTime() + PLAN_DELAY_MINUTES * 60_000);
      const reason = this.buildReason(experience);

      if (options?.dryRun) {
        decisions.push({
          experienceId: experience.id,
          title: experience.title,
          outcome: 'created',
          reason,
          scheduledFor,
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
        conversationId: experience.conversationIds[experience.conversationIds.length - 1] ?? undefined,
        actionPayload: {
          kind: FOLLOWUP_PLAN_KIND,
          experienceId: experience.id,
          title: experience.title,
        },
      });

      recentPlans.push(plan);
      decisions.push({
        experienceId: experience.id,
        title: experience.title,
        outcome: 'created',
        reason,
        planId: plan.id,
        scheduledFor: plan.nextRunAt ?? scheduledFor,
      });
    }

    const created = decisions.filter((item) => item.outcome === 'created').length;
    const skipped = decisions.length - created;
    this.logger.log(
      `SharedExperience followup planning: created=${created}, skipped=${skipped}, dryRun=${options?.dryRun ? 'true' : 'false'}`,
    );

    return {
      created,
      skipped,
      total: decisions.length,
      decisions,
    };
  }

  private async loadCandidates(now: Date): Promise<SharedExperienceRecord[]> {
    const minDate = new Date(now.getTime() - MAX_AGE_DAYS * 86_400_000);
    const maxDate = new Date(now.getTime() - MIN_AGE_DAYS * 86_400_000);

    const rows = await this.prisma.sharedExperience.findMany({
      where: {
        significance: { gte: MIN_SIGNIFICANCE },
        happenedAt: {
          gte: minDate,
          lte: maxDate,
        },
      },
      orderBy: [{ significance: 'desc' }, { happenedAt: 'desc' }],
      take: 30,
    });

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      summary: row.summary,
      category: row.category as SharedExperienceRecord['category'],
      emotionalTone: row.emotionalTone as SharedExperienceRecord['emotionalTone'],
      significance: row.significance,
      happenedAt: row.happenedAt,
      conversationIds: row.conversationIds,
      relatedEntityIds: row.relatedEntityIds,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  }

  private async loadRecentPlans(now: Date): Promise<Plan[]> {
    const threshold = new Date(now.getTime() - COOLDOWN_DAYS * 86_400_000);
    return this.prisma.plan.findMany({
      where: {
        scope: ReminderScope.chat,
        dispatchType: PlanDispatchType.notify,
        createdAt: { gte: threshold },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private findRecentPlan(plans: Plan[], experienceId: string): Plan | null {
    for (const plan of plans) {
      const payload = plan.actionPayload;
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) continue;
      const record = payload as Record<string, unknown>;
      if (record.kind === FOLLOWUP_PLAN_KIND && record.experienceId === experienceId) {
        return plan;
      }
    }
    return null;
  }

  private extractFollowupCue(experience: SharedExperienceRecord): string | null {
    const text = `${experience.title} ${experience.summary}`;
    const match = FOLLOWUP_PATTERNS.find((pattern) => pattern.test(text));
    return match ? match.source.replace(/\\|\(|\)|\|/g, '') : null;
  }

  private async hasRecentUserMention(cue: string, now: Date): Promise<boolean> {
    const since = new Date(now.getTime() - RECENT_MENTION_DAYS * 86_400_000);
    const recent = await this.prisma.message.findFirst({
      where: {
        role: 'user',
        createdAt: { gte: since },
        content: { contains: cue },
      },
      select: { id: true },
    });
    return Boolean(recent);
  }

  private buildReason(experience: SharedExperienceRecord): string {
    return `上次我们一起聊到的「${experience.title}」这件事，最近应该差不多有后续了。如果时机自然，也许可以轻轻问问最近怎么样。`;
  }
}
