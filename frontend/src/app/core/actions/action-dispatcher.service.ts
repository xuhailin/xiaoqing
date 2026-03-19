import { Injectable } from '@angular/core';
import type { AppIconName } from '../../shared/ui/app-icon.component';

export type QuickActionId = 'new-reminder' | 'new-plan' | 'search-memory' | 'run-task';

export interface QuickActionDefinition {
  id: QuickActionId;
  label: string;
  description: string;
  icon: AppIconName;
  enabled: boolean;
}

export interface QuickActionDispatchResult {
  status: 'coming_soon';
  message: string;
}

@Injectable({ providedIn: 'root' })
export class ActionDispatcherService {
  private readonly quickActions: readonly QuickActionDefinition[] = [
    {
      id: 'new-reminder',
      label: '新提醒',
      description: '后续直接调用提醒 handler，不经过自然语言解析。',
      icon: 'bell',
      enabled: true,
    },
    {
      id: 'new-plan',
      label: '新计划',
      description: '后续直接创建计划，不经过 LLM。',
      icon: 'calendarCheck',
      enabled: true,
    },
    {
      id: 'search-memory',
      label: '搜索记忆',
      description: '后续直接检索 memory，不进入对话链。',
      icon: 'brain',
      enabled: true,
    },
    {
      id: 'run-task',
      label: '执行任务',
      description: '后续直接派发任务到执行层。',
      icon: 'tool',
      enabled: true,
    },
  ];

  listQuickActions(): readonly QuickActionDefinition[] {
    return this.quickActions;
  }

  dispatch(_id: QuickActionId): QuickActionDispatchResult {
    return {
      status: 'coming_soon',
      message: '快捷操作直达链路将在下一阶段接入。',
    };
  }
}
