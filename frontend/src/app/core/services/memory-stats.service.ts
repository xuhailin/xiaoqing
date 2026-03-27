import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

/** 记忆分类统计 */
export interface MemoryCategoryStats {
  /** 身份锚定数量 */
  identityAnchors: number;
  /** 用户偏好数量（有内容的字段数） */
  userPreferences: number;
  /** 软偏好记忆数量 */
  softPreferences: number;
  /** 长期认知数量 */
  cognitiveProfiles: number;
  /** 共识事实数量 */
  sharedFacts: number;
  /** 承诺感知数量 */
  commitments: number;
  /** 世界状态是否设置 */
  worldStateSet: boolean;
  /** 待确认提案数量 */
  pendingProposals: number;
  /** 生活轨迹点数量（近30天） */
  lifeTracePoints: number;
  /** 社会关系实体数量 */
  socialEntities: number;
  /** 低置信度内容数量（用于显示提示点） */
  lowConfidenceCount: number;
}

interface UserPreferenceStats {
  fieldCount: number;
  lineCount: number;
}

/** 导航分类项 */
export interface MemoryNavItem {
  key: string;
  label: string;
  hint: string;
  count: number;
  hasAlert?: boolean;
  icon?: string;
}

@Injectable({ providedIn: 'root' })
export class MemoryStatsService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}`;

  /** 获取所有分类的统计数据 */
  async getStats(): Promise<MemoryCategoryStats> {
    try {
      const results = await Promise.allSettled([
        this.fetchIdentityAnchorCount(),
        this.fetchUserProfileStats(),
        this.fetchMemoryCounts(),
        this.fetchPendingProposalCount(),
        this.fetchLifeTraceCount(),
        this.fetchSocialEntityCount(),
        this.fetchGrowthContextCount(),
        this.fetchCommitmentCount(),
      ]);

      const identityAnchors =
        results[0].status === 'fulfilled' ? (results[0].value as number) : 0;
      const userProfileStats =
        results[1].status === 'fulfilled'
          ? (results[1].value as UserPreferenceStats)
          : { fieldCount: 0, lineCount: 0 };
      const memoryCounts: Record<string, number> =
        results[2].status === 'fulfilled'
          ? (results[2].value as Record<string, number>)
          : {};
      const pendingProposals =
        results[3].status === 'fulfilled' ? (results[3].value as number) : 0;
      const lifeTracePoints =
        results[4].status === 'fulfilled' ? (results[4].value as number) : 0;
      const socialEntities =
        results[5].status === 'fulfilled' ? (results[5].value as number) : 0;
      const growthContextCount =
        results[6].status === 'fulfilled' ? (results[6].value as number) : 0;
      const commitmentCount =
        results[7].status === 'fulfilled' ? (results[7].value as number) : 0;

      return {
        identityAnchors,
        userPreferences: userProfileStats.fieldCount,
        softPreferences: Math.max(memoryCounts['soft_preference'] ?? 0, userProfileStats.lineCount),
        cognitiveProfiles: Math.max(
          (memoryCounts['judgment_pattern'] ?? 0) +
          (memoryCounts['value_priority'] ?? 0) +
          (memoryCounts['rhythm_pattern'] ?? 0),
          growthContextCount,
        ),
        sharedFacts: memoryCounts['shared_fact'] ?? 0,
        commitments: commitmentCount,
        worldStateSet: false, // 需要单独检查
        pendingProposals,
        lifeTracePoints,
        socialEntities,
        lowConfidenceCount: memoryCounts['low_confidence'] ?? 0,
      };
    } catch {
      return this.getEmptyStats();
    }
  }

  /** 获取导航项列表 */
  async getNavItems(): Promise<MemoryNavItem[]> {
    const stats = await this.getStats();

    return [
      {
        key: 'identity',
        label: '身份锚定',
        hint: '你告诉我的身份信息',
        count: stats.identityAnchors,
        icon: 'user',
      },
      {
        key: 'preference',
        label: '用户偏好',
        hint: '你偏好的回应方式',
        count: stats.userPreferences,
        icon: 'settings',
      },
      {
        key: 'soft-preference',
        label: '软偏好',
        hint: '从对话里提取的偏好',
        count: stats.softPreferences,
        icon: 'heart',
      },
      {
        key: 'cognitive',
        label: '长期认知',
        hint: '判断模式、价值排序',
        count: stats.cognitiveProfiles,
        icon: 'brain',
      },
      {
        key: 'shared-fact',
        label: '共识事实',
        hint: '我们确认过的事实',
        count: stats.sharedFacts,
        icon: 'checkCircle',
      },
      {
        key: 'commitment',
        label: '承诺感知',
        hint: '你提到的计划和约定',
        count: stats.commitments,
        icon: 'calendarCheck',
      },
      {
        key: 'world-state',
        label: '世界状态',
        hint: '地点、时区等前提',
        count: stats.worldStateSet ? 1 : 0,
        icon: 'globe',
      },
      {
        key: 'pending',
        label: '待确认',
        hint: '等你审核的记忆提议',
        count: stats.pendingProposals,
        hasAlert: stats.pendingProposals > 0,
        icon: 'clock',
      },
      {
        key: 'people',
        label: '身边的人',
        hint: '你生活里反复出现的人',
        count: stats.socialEntities,
        icon: 'users',
      },
      {
        key: 'persona',
        label: '人格',
        hint: '多个人格切换与表达纪律编辑',
        count: 0,
        icon: 'sparkles',
      },
    ];
  }

  private getEmptyStats(): MemoryCategoryStats {
    return {
      identityAnchors: 0,
      userPreferences: 0,
      softPreferences: 0,
      cognitiveProfiles: 0,
      sharedFacts: 0,
      commitments: 0,
      worldStateSet: false,
      pendingProposals: 0,
      lifeTracePoints: 0,
      socialEntities: 0,
      lowConfidenceCount: 0,
    };
  }

  private async fetchIdentityAnchorCount(): Promise<number> {
    try {
      const list = await firstValueFrom(
        this.http.get<any[]>(`${this.base}/identity-anchors`)
      );
      return list?.filter((a) => a.isActive).length ?? 0;
    } catch {
      return 0;
    }
  }

  private async fetchUserProfileStats(): Promise<UserPreferenceStats> {
    try {
      const profile = await firstValueFrom(
        this.http.get<any>(`${this.base}/persona/profile`)
      );
      if (!profile) return { fieldCount: 0, lineCount: 0 };
      let fieldCount = 0;
      let lineCount = 0;
      [
        profile.preferredVoiceStyle,
        profile.praisePreference,
        profile.responseRhythm,
      ].forEach((value) => {
        if (!value?.trim()) return;
        fieldCount++;
        lineCount += value
          .split('\n')
          .map((line: string) => line.trim())
          .filter(Boolean).length;
      });
      return { fieldCount, lineCount };
    } catch {
      return { fieldCount: 0, lineCount: 0 };
    }
  }

  private async fetchMemoryCounts(): Promise<Record<string, number>> {
    const categories = [
      'soft_preference',
      'shared_fact',
      'commitment',
      'judgment_pattern',
      'value_priority',
      'rhythm_pattern',
    ];

    const counts: Record<string, number> = {};
    let lowConfidence = 0;

    await Promise.all(
      categories.map(async (cat) => {
        try {
          const list = await firstValueFrom(
            this.http.get<any[]>(`${this.base}/memories`, {
              params: { category: cat },
            })
          );
          counts[cat] = list?.length ?? 0;
          // 统计低置信度
          lowConfidence += list?.filter((m) => m.confidence < 0.7).length ?? 0;
        } catch {
          counts[cat] = 0;
        }
      })
    );

    counts['low_confidence'] = lowConfidence;
    return counts;
  }

  private async fetchPendingProposalCount(): Promise<number> {
    try {
      const list = await firstValueFrom(
        this.http.get<any[]>(`${this.base}/agent-bus/memory-proposals`, {
          params: { status: 'pending', limit: '100' },
        })
      );
      return list?.length ?? 0;
    } catch {
      return 0;
    }
  }

  private async fetchLifeTraceCount(): Promise<number> {
    try {
      const since = new Date();
      since.setDate(since.getDate() - 30);
      const result = await firstValueFrom(
        this.http.get<{ total?: number }>(`${this.base}/trace-points/count`, {
          params: { since: since.toISOString() },
        })
      );
      return result?.total ?? 0;
    } catch {
      return 0;
    }
  }

  private async fetchSocialEntityCount(): Promise<number> {
    try {
      const list = await firstValueFrom(
        this.http.get<any[]>(`${this.base}/social-entities`)
      );
      return list?.length ?? 0;
    } catch {
      return 0;
    }
  }

  private async fetchGrowthContextCount(): Promise<number> {
    try {
      const context = await firstValueFrom(
        this.http.get<any>(`${this.base}/growth/context`)
      );
      return (
        (context?.cognitiveProfiles?.length ?? 0) +
        (context?.judgmentPatterns?.length ?? 0) +
        (context?.valuePriorities?.length ?? 0) +
        (context?.rhythmPatterns?.length ?? 0)
      );
    } catch {
      return 0;
    }
  }

  private async fetchCommitmentCount(): Promise<number> {
    try {
      const plans = await firstValueFrom(
        this.http.get<any[]>(`${this.base}/plans`, {
          params: { status: 'active' },
        })
      );
      return (plans ?? []).filter((item) => item.scope !== 'dev').length;
    } catch {
      return 0;
    }
  }
}
