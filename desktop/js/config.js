/**
 * 桌面端 Live2D 配置
 */
const CONFIG = {
  // 后端地址
  BACKEND_URL: 'http://localhost:3000',
  SSE_ENDPOINT: '/pet/state-stream',

  // 聊天前端地址（点击打开）
  CHAT_URL: 'http://localhost:4200',

  // 模型配置
  DEFAULT_MODEL: 'hiyori',
  MODELS_BASE_PATH: './models',

  // 时段默认模型：上午 hiyori，下午 epsilon（分界 12:00）
  TIME_MODEL_MAP: { morning: 'hiyori', afternoon: 'epsilon' },
  MORNING_END_HOUR: 12,

  // 模型名 → model3.json 相对路径（相对于 models/<name>/）
  MODEL_FILES: {
    epsilon: 'runtime/Epsilon_free.model3.json',
    hiyori:  'runtime/hiyori_free_t08.model3.json',
    mark:    'runtime/mark_free_t04.model3.json',
  },

  // 声明有 model-manifest.json 的模型（避免无谓的 404 请求）
  MODEL_MANIFESTS: [],

  // 画布尺寸（人物区域）；运行时实际尺寸由 model-manager 按模型计算，不超过以下最大值
  CANVAS_WIDTH: 280,
  CANVAS_HEIGHT: 300,
  MAX_CANVAS_WIDTH: 280,
  MAX_CANVAS_HEIGHT: 300,
  DRAG_HANDLE_HEIGHT: 20,
  // 对话框宽度（与人物同高或更小，由 main-row 高度约束）
  PANEL_WIDTH: 300,

  // 性能：空闲时降低帧率
  IDLE_FPS: 15,
  ACTIVE_FPS: 60,

  /**
   * 后端状态 → 模型表情/动作映射
   * expression: 对应 .model3.json 中 Expressions[].Name
   * motionGroup: 对应 .model3.json 中 Motions 的分组名
   *
   * 不同模型的表情名/动作组名可能不同，
   * 可通过 model-manifest.json 覆盖此默认映射。
   */
  STATE_MAP: {
    idle:     { expression: null,    motionGroup: 'Idle' },
    speaking: { expression: null,    motionGroup: 'Tap@Body' },
    thinking: { expression: null,    motionGroup: 'Idle' },
  },
};

/**
 * 按当前时段返回默认模型名（上午 hiyori，下午 epsilon）
 * @returns {string} 'hiyori' | 'epsilon'
 */
function getDefaultModelByTime() {
  const hour = new Date().getHours();
  const key = hour < CONFIG.MORNING_END_HOUR ? 'morning' : 'afternoon';
  return CONFIG.TIME_MODEL_MAP[key] || CONFIG.DEFAULT_MODEL;
}
