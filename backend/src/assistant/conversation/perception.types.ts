import type {
  CognitiveTurnState,
  EmotionTrendSummary,
} from '../cognitive-pipeline/cognitive-pipeline.types';
import type { DialogueIntentState } from '../intent/intent.types';
import type { QuickRouterOutput } from './quick-intent-router.types';

/**
 * 感知层产出的结构化中间态快照。
 *
 * `intentState` / `mergedIntentState` / `quickRoute` / `emotionTrend` 由
 * TurnContextAssembler 组装进 TurnContext.runtime；
 * `cognitiveState` 由 TurnCognitiveStateService 在 Orchestrator 内补齐。
 *
 * 当前字段与 TurnContext.runtime 中的感知相关字段保持一一对齐，
 * 供决策层在过渡阶段通过显式 schema 读取，而不是依赖 runtime 全量对象。
 * 在迁移完成前，两套结构会并存；PerceptionState 是主链路显式传递的结构化版本。
 */
export interface PerceptionState {
  /** 原始意图识别结果。 */
  intentState: DialogueIntentState | null;
  /** 融合 quick route / world state 等补全后的意图结果。 */
  mergedIntentState: DialogueIntentState | null;
  /** Quick Intent Router 的轻量分流结果。 */
  quickRoute: QuickRouterOutput | null;
  /** 本回合认知分析结果，由 TurnCognitiveStateService 产出并复用于决策/表达/后处理。 */
  cognitiveState: CognitiveTurnState;
  /** 最近情绪趋势摘要，供决策层和表达层参考。 */
  emotionTrend?: EmotionTrendSummary | null;
}
