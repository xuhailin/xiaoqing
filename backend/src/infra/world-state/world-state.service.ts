import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import type { WorldState, WorldStateUpdate } from './world-state.types';
import type { DialogueIntentState } from '../../assistant/intent/intent.types';

@Injectable()
export class WorldStateService {
  constructor(private prisma: PrismaService) {}

  /**
   * 获取会话的默认世界状态；无则返回 null。
   */
  async get(conversationId: string): Promise<WorldState | null> {
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { worldState: true },
    });
    const raw = conv?.worldState;
    if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
      return null;
    }
    return this.normalizeRecord(raw as Record<string, unknown>);
  }

  /**
   * 用部分更新覆盖世界状态；仅非空字符串字段会覆盖旧值。
   */
  async update(conversationId: string, update: WorldStateUpdate): Promise<void> {
    const current = await this.get(conversationId);
    const next: WorldState = { ...current ?? {} };

    if (typeof update.city === 'string' && update.city.trim()) {
      next.city = update.city.trim();
    }
    if (typeof update.timezone === 'string' && update.timezone.trim()) {
      next.timezone = update.timezone.trim();
    }
    if (typeof update.language === 'string' && update.language.trim()) {
      next.language = update.language.trim();
    }
    if (typeof update.device === 'string' && update.device.trim()) {
      next.device = update.device.trim();
    }
    if (typeof update.conversationMode === 'string' && update.conversationMode.trim()) {
      const mode = update.conversationMode.trim();
      const allowed: WorldState['conversationMode'][] = ['chat', 'thinking', 'decision', 'task'];
      if (allowed.includes(mode as WorldState['conversationMode'])) {
        next.conversationMode = mode as WorldState['conversationMode'];
      }
    }

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { worldState: next as object },
    });
  }

  /**
   * 用世界状态补全意图槽位，并移除已被补全的缺失参数。
   * 仅当 World State 也无法补全时才保留 missingParams，从而允许反问用户。
   */
  async mergeSlots(
    conversationId: string,
    intent: DialogueIntentState,
    fallbackWorldState?: Partial<WorldState> | null,
  ): Promise<{ merged: DialogueIntentState; filledFromWorldState: string[] }> {
    const world = await this.get(conversationId);
    const effectiveWorld: Partial<WorldState> = {
      ...(fallbackWorldState ?? {}),
      ...(world ?? {}),
    };
    const slots = { ...intent.slots };
    let missingParams = [...intent.missingParams];
    const filledFromWorldState: string[] = [];

    if (!intent.requiresTool) {
      return {
        merged: { ...intent, slots, missingParams },
        filledFromWorldState,
      };
    }

    // 天气查询：缺 city 时用 worldState.city 补全
    if (intent.taskIntent === 'weather_query') {
      const hasCoordinate = typeof slots.location === 'string' && slots.location.trim();
      const hasCity = typeof slots.city === 'string' && slots.city.trim();
      if (!hasCoordinate && !hasCity && effectiveWorld.city?.trim()) {
        slots.city = effectiveWorld.city.trim();
        missingParams = missingParams.filter((p) => p.toLowerCase() !== 'city');
        filledFromWorldState.push('city');
      }
    }

    return {
      merged: { ...intent, slots, missingParams },
      filledFromWorldState,
    };
  }

  private normalizeRecord(raw: Record<string, unknown>): WorldState {
    const out: WorldState = {};
    if (typeof raw.city === 'string' && raw.city.trim()) out.city = raw.city.trim();
    if (typeof raw.timezone === 'string' && raw.timezone.trim()) out.timezone = raw.timezone.trim();
    if (typeof raw.language === 'string' && raw.language.trim()) out.language = raw.language.trim();
    if (typeof raw.device === 'string' && raw.device.trim()) out.device = raw.device.trim();
    if (typeof raw.conversationMode === 'string' && raw.conversationMode.trim()) {
      const m = raw.conversationMode.trim();
      if (['chat', 'thinking', 'decision', 'task'].includes(m)) {
        out.conversationMode = m as WorldState['conversationMode'];
      }
    }
    return out;
  }
}
