import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infra/prisma.service';
import { PersonaService, EvolutionChange } from './persona.service';
import { COGNITIVE_CATEGORIES } from '../memory/memory-category';
import { isFeatureEnabled } from '../../config/feature-flags';

/** 待确认的进化建议（存储在内存中，前端轮询获取） */
export interface PendingEvolutionSuggestion {
  changes: EvolutionChange[];
  triggerReason: string;
  createdAt: Date;
}

@Injectable()
export class EvolutionSchedulerService {
  private readonly enabled: boolean;
  /** 触发进化建议的认知记忆最少条数（默认 5） */
  private readonly densityThreshold: number;
  private readonly logger = new Logger(EvolutionSchedulerService.name);

  /** 待确认的进化建议（按用户隔离，前端轮询获取） */
  private pendingSuggestions = new Map<string, PendingEvolutionSuggestion>();

  constructor(
    private prisma: PrismaService,
    private persona: PersonaService,
    config: ConfigService,
  ) {
    this.enabled = isFeatureEnabled(config, 'evolutionScheduler');
    this.densityThreshold = Number(config.get('EVOLUTION_DENSITY_THRESHOLD')) || 5;
  }

  /** 前端轮询：获取待确认的进化建议 */
  getPendingSuggestion(userId: string): PendingEvolutionSuggestion | null {
    return this.pendingSuggestions.get(userId) ?? null;
  }

  /** 设置待确认的进化建议（由自动总结触发） */
  setPendingSuggestion(userId: string, suggestion: PendingEvolutionSuggestion): void {
    this.pendingSuggestions.set(userId, suggestion);
  }

  /** 前端操作：清除待确认建议（用户已确认或拒绝） */
  clearPendingSuggestion(userId: string): void {
    this.pendingSuggestions.delete(userId);
  }

  // ── 每日凌晨 4 点检查记忆密度 → 触发进化建议 ─────────
  @Cron('0 0 4 * * *')
  async handleDensityCheck() {
    if (!this.enabled) return;

    this.logger.log('Daily evolution density check started');

    const users = await this.prisma.memory.groupBy({
      by: ['userId'],
      where: {
        category: { in: COGNITIVE_CATEGORIES },
        decayScore: { gt: 0 },
        type: 'long',
      },
    });

    for (const { userId } of users) {
      await this.handleUserDensityCheck(userId);
    }
  }

  private async handleUserDensityCheck(userId: string): Promise<void> {
    const counts = await this.prisma.memory.groupBy({
      by: ['category'],
      where: {
        userId,
        category: { in: COGNITIVE_CATEGORIES },
        decayScore: { gt: 0 },
        type: 'long',
      },
      _count: true,
    });

    const totalCognitive = counts.reduce((sum, c) => sum + c._count, 0);
    const denseCategories = counts
      .filter((c) => c._count >= this.densityThreshold)
      .map((c) => `${c.category}(${c._count}条)`);

    if (denseCategories.length === 0) {
      this.logger.log(
        `No category exceeds density threshold (${this.densityThreshold}) for user=${userId}. Total cognitive: ${totalCognitive}`,
      );
      return;
    }

    const recentConv = await this.prisma.conversation.findFirst({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });
    if (!recentConv) return;

    const messages = await this.prisma.message.findMany({
      where: { conversationId: recentConv.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    if (messages.length === 0) return;

    const recentMessages = messages.reverse().map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const result = await this.persona.suggestEvolution(recentMessages);
    if (result.changes.length === 0) {
      this.logger.log(`Evolution suggestion returned no changes for user=${userId}`);
      return;
    }

    const isUserPref = (field: string) =>
      field === 'preferredVoiceStyle'
      || field === 'praisePreference'
      || field === 'responseRhythm';
    const preferenceChanges = result.changes.filter((c) => isUserPref(c.targetField ?? c.field));
    const personaChanges = result.changes.filter((c) => !isUserPref(c.targetField ?? c.field));

    if (preferenceChanges.length > 0) {
      await this.persona.confirmEvolution(preferenceChanges);
    }

    if (personaChanges.length === 0) {
      this.logger.log(
        `Evolution suggestion auto-applied ${preferenceChanges.length} preference changes for user=${userId}, no persona confirmation required`,
      );
      return;
    }

    this.pendingSuggestions.set(userId, {
      changes: personaChanges,
      triggerReason: `认知记忆密度触发：${denseCategories.join(', ')}`,
      createdAt: new Date(),
    });
    this.logger.log(
      `Evolution suggestion generated for user=${userId}: ${personaChanges.length} persona changes pending user confirmation (${preferenceChanges.length} preference changes auto-applied)`,
    );
  }
}
