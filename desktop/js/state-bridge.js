/**
 * 状态桥接器
 * 通过 SSE 接收后端状态推送，驱动 Live2D 模型表情/动作切换
 */
class StateBridge {
  /**
   * @param {ModelManager} modelManager
   */
  constructor(modelManager) {
    this.modelManager = modelManager;
    /** @type {EventSource | null} */
    this.eventSource = null;
    /** @type {string} */
    this.currentState = 'idle';
    /** @type {boolean} */
    this.connected = false;
  }

  /**
   * 连接后端 SSE 端点
   */
  connect() {
    const url = `${CONFIG.BACKEND_URL}${CONFIG.SSE_ENDPOINT}`;
    console.log(`[state-bridge] connecting to ${url}`);

    this.eventSource = new EventSource(url);

    this.eventSource.addEventListener('state', (event) => {
      try {
        const data = JSON.parse(event.data);
        this.handleStateChange(data.state);
      } catch (e) {
        console.warn('[state-bridge] failed to parse state event:', e);
      }
    });

    this.eventSource.addEventListener('open', () => {
      this.connected = true;
      console.log('[state-bridge] SSE connected');
    });

    this.eventSource.addEventListener('error', () => {
      this.connected = false;
      // EventSource 会自动重连，无需手动处理
      console.warn('[state-bridge] SSE connection error, will auto-reconnect');
    });
  }

  /**
   * 处理状态变化
   * @param {string} newState
   */
  handleStateChange(newState) {
    if (newState === this.currentState) return;

    const prevState = this.currentState;
    this.currentState = newState;
    console.log(`[state-bridge] state: ${prevState} → ${newState}`);

    const stateMap = this.modelManager.getStateMap();
    const mapping = stateMap[newState] || stateMap.idle;

    if (mapping.expression) {
      this.modelManager.setExpression(mapping.expression);
    }
    if (mapping.motionGroup) {
      // speaking/thinking 用 FORCE 优先级覆盖当前动作
      const priority = newState === 'idle' ? 1 : 3;
      this.modelManager.playMotion(mapping.motionGroup, undefined, priority);
    }
  }

  /**
   * 断开 SSE 连接
   */
  disconnect() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
      this.connected = false;
      console.log('[state-bridge] disconnected');
    }
  }
}
