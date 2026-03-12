import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infra/prisma.service';
import { PersonaService, EvolutionChange } from './persona.service';
import { COGNITIVE_CATEGORIES } from '../memory/memory-category';

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

  /** 待确认的进化建议（用户确认后清空） */
  private pendingSuggestion: PendingEvolutionSuggestion | null = null;

  constructor(
    private prisma: PrismaService,
    private persona: PersonaService,
    config: ConfigService,
  ) {
    this.enabled = config.get('FEATURE_EVOLUTION_SCHEDULER') !== 'false'; // default on
    this.densityThreshold = Number(config.get('EVOLUTION_DENSITY_THRESHOLD')) || 5;
  }

  /** 前端轮询：获取待确认的进化建议 */
  getPendingSuggestion(): PendingEvolutionSuggestion | null {
    return this.pendingSuggestion;
  }

  /** 设置待确认的进化建议（由自动总结触发） */
  setPendingSuggestion(suggestion: PendingEvolutionSuggestion): void {
    this.pendingSuggestion = suggestion;
  }

  /** 前端操作：清除待确认建议（用户已确认或拒绝） */
  clearPendingSuggestion(): void {
    this.pendingSuggestion = null;
  }

  // ── 每日凌晨 4 点检查记忆密度 → 触发进化建议 ─────────
  @Cron('0 0 4 * * *')
  async handleDensityCheck() {
    if (!this.enabled) return;

    this.logger.log('Daily evolution density check started');

    // 统计各认知分类的活跃记忆数
    const counts = await this.prisma.memory.groupBy({
      by: ['category'],
      where: {
        category: { in: COGNITIVE_CATEGORIES },
        decayScore: { gt: 0 },
        type: 'long',
      },
      _count: true,
    });

    const totalCognitive = counts.reduce((sum, c) => sum + c._count, 0);

    // 找出超过密度阈值的分类
    const denseCategories = counts
      .filter((c) => c._count >= this.densityThreshold)
      .map((c) => `${c.category}(${c._count}条)`);

    if (denseCategories.length === 0) {
      this.logger.log(
        `No category exceeds density threshold (${this.densityThreshold}). Total cognitive: ${totalCognitive}`,
      );
      return;
    }

    this.logger.log(
      `Dense categories found: ${denseCategories.join(', ')}. Generating evolution suggestion...`,
    );

    // 取最近活跃对话的最后 20 条消息
    const recentConv = await this.prisma.conversation.findFirst({
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

    if (result.changes.length > 0) {
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
          `Evolution suggestion auto-applied ${preferenceChanges.length} preference changes, no persona confirmation required`,
        );
        return;
      }

      this.pendingSuggestion = {
        changes: personaChanges,
        triggerReason: `认知记忆密度触发：${denseCategories.join(', ')}`,
        createdAt: new Date(),
      };
      this.logger.log(
        `Evolution suggestion generated: ${personaChanges.length} persona changes pending user confirmation (${preferenceChanges.length} preference changes auto-applied)`,
      );
    } else {
      this.logger.log('Evolution suggestion returned no changes');
    }
  }
}
