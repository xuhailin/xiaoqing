import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma.service';
import { SharedExperienceService } from '../shared-experience/shared-experience.service';
import type { RelationshipOverviewDto, RhythmPreferenceDto, MilestoneDto } from './relationship-overview.types';

/** rr.* claim key → human-readable label */
const RR_KEY_LABELS: Record<string, string> = {
  'rr.prefer_gentle_direct': '偏好温和直接的方式',
  'rr.prefer_short_reply': '偏好简短回复',
  'rr.dislike_too_pushy': '不喜欢被追问太紧',
  'rr.prefer_companion_mode_when_tired': '疲惫时偏好陪伴模式',
  'rr.allow_playful_tease_low': '接受程度较低的轻松调侃',
};

@Injectable()
export class RelationshipOverviewService {
  private readonly logger = new Logger(RelationshipOverviewService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sharedExperience: SharedExperienceService,
  ) {}

  async getOverview(): Promise<RelationshipOverviewDto> {
    const [relationshipState, rhythmClaims, milestones] = await Promise.all([
      this.getActiveRelationshipState(),
      this.getRhythmClaims(),
      this.getMilestones(),
    ]);

    const stage = (relationshipState?.stage ?? 'early') as RelationshipOverviewDto['stage'];
    const trustScore = relationshipState?.trustScore ?? 0.5;
    const closenessScore = relationshipState?.closenessScore ?? 0.5;

    return {
      stage,
      trustScore,
      closenessScore,
      rhythmPreferences: rhythmClaims,
      milestones,
      summary: this.buildSummary(stage, trustScore, closenessScore, rhythmClaims),
    };
  }

  private async getActiveRelationshipState(): Promise<{
    stage: string;
    trustScore: number;
    closenessScore: number;
    summary: string;
    updatedAt: Date;
  } | null> {
    const rows = await this.prisma.$queryRaw<Array<{
      stage: string;
      trustScore: number;
      closenessScore: number;
      summary: string;
      updatedAt: Date;
    }>>`
      SELECT "stage", "trustScore", "closenessScore", "summary", "updatedAt"
      FROM "RelationshipState"
      WHERE "isActive" = true AND "status" = 'confirmed'
      ORDER BY "updatedAt" DESC
      LIMIT 1
    `;

    return rows[0] ?? null;
  }

  private async getRhythmClaims(): Promise<RhythmPreferenceDto[]> {
    const rows = await this.prisma.$queryRaw<Array<{
      key: string;
      valueJson: unknown;
      confidence: number;
    }>>`
      SELECT "key", "valueJson", "confidence"
      FROM "UserClaim"
      WHERE "userKey" = 'default-user'
        AND "type" = 'RELATION_RHYTHM'
        AND "status" IN ('STABLE', 'CORE')
        AND "key" NOT LIKE 'draft.%'
      ORDER BY "confidence" DESC
    `;

    return rows.map((row) => {
      const value = row.valueJson as Record<string, unknown> | null;
      const level = typeof value?.level === 'string' ? value.level : 'medium';
      return {
        key: RR_KEY_LABELS[row.key] ?? row.key,
        level,
        confidence: row.confidence,
      };
    });
  }

  private async getMilestones(): Promise<MilestoneDto[]> {
    const [stageChanges, sharedExperiences] = await Promise.all([
      this.prisma.$queryRaw<Array<{
        stage: string;
        createdAt: Date;
      }>>`
        SELECT "stage", "createdAt"
        FROM "RelationshipState"
        WHERE "status" = 'confirmed'
        ORDER BY "createdAt" ASC
      `,
      this.sharedExperience.list({ limit: 20 }),
    ]);

    const milestones: MilestoneDto[] = [];
    let prevStage: string | null = null;

    for (const row of stageChanges) {
      if (row.stage !== prevStage) {
        const label = prevStage === null
          ? `关系开始：${this.stageLabel(row.stage)}`
          : `关系进展：${this.stageLabel(prevStage)} → ${this.stageLabel(row.stage)}`;

        milestones.push({
          label,
          date: row.createdAt.toISOString(),
          type: 'stage_change',
        });
        prevStage = row.stage;
      }
    }

    for (const experience of sharedExperiences) {
      milestones.push({
        label: experience.title,
        date: experience.happenedAt.toISOString(),
        type: 'shared_experience',
      });
    }

    return milestones.sort((a, b) => a.date.localeCompare(b.date));
  }

  private stageLabel(stage: string): string {
    const labels: Record<string, string> = {
      early: '初识阶段',
      familiar: '熟悉阶段',
      steady: '稳定阶段',
    };
    return labels[stage] ?? stage;
  }

  private buildSummary(
    stage: RelationshipOverviewDto['stage'],
    trust: number,
    closeness: number,
    rhythmPrefs: RhythmPreferenceDto[],
  ): string {
    const stageDesc = this.stageLabel(stage);
    const trustDesc = trust >= 0.7 ? '信任度较高' : trust >= 0.5 ? '信任度适中' : '还在建立信任';
    const closenessDesc = closeness >= 0.7 ? '亲密度较高' : closeness >= 0.5 ? '亲密度适中' : '还在拉近距离';

    let summary = `我们的关系处于${stageDesc}，${trustDesc}，${closenessDesc}。`;

    if (rhythmPrefs.length > 0) {
      const topPref = rhythmPrefs[0];
      summary += `互动节奏上，你${topPref.key}。`;
    }

    return summary;
  }
}
