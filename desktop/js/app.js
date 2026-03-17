/**
 * 桌面端 Live2D 主入口
 * 初始化 PixiJS + Live2D 模型 + SSE 状态桥接 + 交互事件
 */
(async function main() {
  const container = document.getElementById('canvas-container');
  const tauri = window.__TAURI__;

  // ── 坐标调试悬浮层 ─────────────────────────────────────
  const coordOverlay = document.createElement('div');
  coordOverlay.id = 'coord-overlay';
  Object.assign(coordOverlay.style, {
    position:      'fixed',
    left:          '8px',
    top:           '8px',
    zIndex:        '99999',
    background:    'rgba(0,0,0,.6)',
    color:         '#fff',
    padding:       '6px 8px',
    fontSize:      '12px',
    pointerEvents: 'none',
  });
  document.body.appendChild(coordOverlay);

  // ── 检查 Live2D Core 是否加载 ──────────────────────────
  if (typeof Live2DCubismCore === 'undefined') {
    console.error('[app] Live2DCubismCore not loaded. Please place live2dcubismcore.min.js in public/lib/');
    container.innerHTML = '<p style="color:#c00;font-size:12px;padding:8px;">Live2D Core 未加载<br>请参考 docs/live2d-maintenance.md</p>';
    return;
  }

  // ── 创建 PixiJS 应用 ───────────────────────────────────
  const dpr = window.devicePixelRatio || 1;
  const app = new PIXI.Application({
    width: CONFIG.CANVAS_WIDTH,
    height: CONFIG.CANVAS_HEIGHT,
    resolution: dpr,
    autoDensity: true,
    backgroundAlpha: 0,
    autoStart: true,
    preserveDrawingBuffer: true,
  });
  container.appendChild(app.view);
  app.ticker.maxFPS = CONFIG.IDLE_FPS;

  // 失焦 1 分钟无交互则切 mark，点击后还原时段模型
  const IDLE_MARK_MS = 60_000;
  let idleMarkTimer = null;
  let isIdleMarkMode = false;

  function clearIdleMarkTimer() {
    if (idleMarkTimer != null) {
      clearTimeout(idleMarkTimer);
      idleMarkTimer = null;
    }
  }

  // 窗口失焦：强制渲染一帧 + 描边样式；并启动 1 分钟定时器，到点切 mark
  window.addEventListener('blur', () => {
    document.body.classList.add('window-unfocused');
    requestAnimationFrame(() => {
      app.renderer.render(app.stage);
    });
    clearIdleMarkTimer();
    idleMarkTimer = setTimeout(() => {
      idleMarkTimer = null;
      modelManager.loadModel('mark');
      isIdleMarkMode = true;
    }, IDLE_MARK_MS);
  });
  window.addEventListener('focus', () => {
    document.body.classList.remove('window-unfocused');
    clearIdleMarkTimer();
  });

  // ── 加载 Live2D 模型（按时段默认：上午 hiyori，下午 epsilon）────────────────
  const modelManager = new ModelManager(app);
  try {
    await modelManager.loadModel(getDefaultModelByTime());
  } catch (e) {
    console.error('[app] failed to load model:', e);
    container.innerHTML = `<p style="color:#c00;font-size:12px;padding:8px;">模型加载失败: ${e.message}<br>请确认 models/${getDefaultModelByTime()}/ 目录存在</p>`;
    return;
  }

  // ── 连接 SSE 状态桥接 ──────────────────────────────────
  const stateBridge = new StateBridge(modelManager);
  stateBridge.connect();

  // ── 交互事件 ───────────────────────────────────────────
  const CLICK_THRESHOLD = 10;
  let pointerDown = false;
  let dragging = false;
  let pStartX = 0;
  let pStartY = 0;

  function resetPointerState() {
    pointerDown = false;
    dragging = false;
  }

  // 鼠标跟随（眼球追踪）；任意交互清除失焦 1 分钟定时器
  container.addEventListener('mousemove', (e) => {
    coordOverlay.textContent = `client: ${e.clientX},${e.clientY}  offset: ${e.offsetX},${e.offsetY}`;
    clearIdleMarkTimer();
    const rect = container.getBoundingClientRect();
    modelManager.focusAt(e.clientX - rect.left, e.clientY - rect.top);

    app.ticker.maxFPS = CONFIG.ACTIVE_FPS;
    clearTimeout(container._fpsTimer);
    container._fpsTimer = setTimeout(() => {
      app.ticker.maxFPS = CONFIG.IDLE_FPS;
    }, 2000);
  });

  // mousedown：记录起始位置
  container.addEventListener('mousedown', (e) => {
    console.debug('[app:click] mousedown', { button: e.button, x: e.clientX, y: e.clientY, target: e.target.tagName });
    if (e.button !== 0) return;
    clearIdleMarkTimer();
    pointerDown = true;
    dragging = false;
    pStartX = e.clientX;
    pStartY = e.clientY;
  });

  // mousemove：超过阈值则启动原生窗口拖拽
  container.addEventListener('mousemove', async (e) => {
    coordOverlay.textContent = `client: ${e.clientX},${e.clientY}  offset: ${e.offsetX},${e.offsetY}`;
    if (!pointerDown || dragging) return;
    const d = Math.hypot(e.clientX - pStartX, e.clientY - pStartY);
    if (d < CLICK_THRESHOLD) return;
    console.debug('[app:click] drag threshold exceeded, d=', d);
    dragging = true;

    if (tauri?.window?.getCurrentWindow) {
      try {
        await tauri.window.getCurrentWindow().startDragging();
      } catch (err) {
        console.warn('[app] startDragging failed:', err);
      }
    }
    resetPointerState();
  });

  const panelW = CONFIG.PANEL_WIDTH ?? 300;

  /**
   * 展开或收起对话面板。
   * 原先绑定在单击（mouseup）事件上，现在改为双击触发。
   */
  async function togglePanel() {
    const win = tauri?.window?.getCurrentWindow?.();
    const wasHidden = document.body.classList.contains('panel-hidden');

    if (wasHidden) {
      // 展开：先决定左右、设位置与尺寸，再显示面板
      const pos = win ? await win.outerPosition() : { x: 0, y: 0 };
      const canvasW = modelManager.getCanvasSize()?.width ?? CONFIG.CANVAS_WIDTH ?? 280;
      const side = await computePanelSideBySpaceOnRight(pos, canvasW);
      document.body.classList.remove('panel-left', 'panel-right');
      document.body.classList.add(side === 'left' ? 'panel-left' : 'panel-right');
      await applyWindowSizeAndPosition(true, side);
      document.body.classList.remove('panel-hidden');
      console.debug('[app:click] panel expanded', { side });
    } else {
      // 收起：先隐藏，再以 Live2D 为锚重置窗口尺寸与位置
      const currentSide = document.body.classList.contains('panel-left') ? 'left' : 'right';
      document.body.classList.add('panel-hidden');
      await applyWindowSizeAndPosition(false, currentSide);
      console.debug('[app:click] panel collapsed', { side: currentSide });
    }
  }

  /**
   * 根据 Live2D 右侧剩余空间决定面板放在右侧还是左侧（仅展开时调用）。
   * @param pos - 窗口 outerPosition { x, y }
   * @param canvasW - 画布宽度
   * @returns 'right' | 'left'
   */
  async function computePanelSideBySpaceOnRight(pos, canvasW) {
    const posX = pos?.x ?? 0;
    if (posX === 0 && (pos?.y ?? 0) === 0) {
      console.warn('[app] outerPosition (0,0), using panel-left as default');
      return 'left';
    }
    const live2dRight = posX + canvasW;
    let workAreaRight = live2dRight + panelW;
    try {
      const monitor = await (tauri.window.currentMonitor?.() ?? tauri.core?.invoke?.('plugin:window|current_monitor'));
      if (monitor?.workArea != null) {
        const wx = monitor.workArea.position?.x ?? 0;
        const ww = monitor.workArea.size?.width ?? 0;
        workAreaRight = wx + ww;
      } else if (monitor?.position != null && monitor?.size != null) {
        workAreaRight = (monitor.position.x ?? 0) + (monitor.size.width ?? 0);
      }
    } catch (_) {
      if (typeof window.screen !== 'undefined') {
        workAreaRight = (window.screen.availLeft ?? 0) + (window.screen.availWidth ?? 0);
      }
    }
    return (workAreaRight - live2dRight) >= panelW ? 'right' : 'left';
  }

  /**
   * 以 Live2D 在屏幕上的位置为锚点，设置窗口尺寸与位置（先 position 再 size）。
   * 先根据当前窗口状态算出 Live2D 的屏幕坐标，再按目标状态设置窗口，使 Live2D 位置不变。
   * @param panelVisible - 目标：面板是否展示
   * @param side - 'left' | 'right'，当前（收起时）或即将（展开时）的面板侧
   */
  async function applyWindowSizeAndPosition(panelVisible, side) {
    const size = modelManager.getCanvasSize();
    const canvasW = size?.width ?? CONFIG.CANVAS_WIDTH ?? 280;
    const canvasH = size?.height ?? CONFIG.CANVAS_HEIGHT ?? 300;
    const win = tauri?.window?.getCurrentWindow?.();
    if (!win || typeof win.setPosition !== 'function' || typeof win.setSize !== 'function') return;
    try {
      const pos = await win.outerPosition();
      const posX = pos?.x ?? 0;
      const posY = pos?.y ?? 0;
      // 当前窗口下 Live2D 在屏幕上的左上角（锚点）
      const live2dLeft = panelVisible ? posX : (side === 'left' ? posX + panelW : posX);
      const live2dTop = posY;

      if (panelVisible) {
        const width = canvasW + panelW;
        // 展开：窗口左缘 = live2dLeft（右侧放面板）或 live2dLeft - panelW（左侧放面板），使 Live2D 仍在 (live2dLeft, live2dTop)
        if (side === 'left') {
          await win.setPosition({ x: live2dLeft - panelW, y: live2dTop });
        }
        await win.setSize({ width, height: canvasH });
      } else {
        // 收起：窗口就是画布，左缘必须等于 live2dLeft，这样 Live2D 位置不变
        await win.setPosition({ x: live2dLeft, y: live2dTop });
        await win.setSize({ width: canvasW, height: canvasH });
      }
    } catch (err) {
      console.warn('[app] applyWindowSizeAndPosition failed:', err);
    }
  }

  // mouseup：未拖拽则视为「单击模型」 → 播放 Tap 动作（对话框改为双击触发）
  container.addEventListener('mouseup', async (e) => {
    console.debug('[app:click] mouseup on container', { pointerDown, dragging, target: e.target.tagName });
    if (!pointerDown) {
      console.debug('[app:click] ignored: pointerDown was false');
      return;
    }
    const wasDrag = dragging;
    resetPointerState();
    if (wasDrag) {
      console.debug('[app:click] ignored: was drag');
      return;
    }

    clearIdleMarkTimer();

    if (modelManager.currentModelName === 'mark' && isIdleMarkMode) {
      await modelManager.loadModel(getDefaultModelByTime());
      isIdleMarkMode = false;
    }

    // 单击：播放 Tap 动作（若当前模型不存在该分组，内部会给出 warning）
    try {
      modelManager.playMotion('Tap');
    } catch (err) {
      console.warn('[app:click] play Tap motion failed:', err);
    }
  });

  // 双击：切换对话面板展开/收起
  container.addEventListener('dblclick', async (e) => {
    console.debug('[app:click] dblclick on container', { button: e.button, target: e.target.tagName });
    if (e.button !== 0) return;
    clearIdleMarkTimer();
    await togglePanel();
  });

  // 兜底：鼠标在 container 外释放时清理状态
  document.addEventListener('mouseup', (e) => {
    if (pointerDown) {
      console.debug('[app:click] document mouseup fallback reset', { target: e.target.tagName });
    }
    resetPointerState();
  });

  // 首次根据模型画布与面板状态同步窗口尺寸（以「右侧空间」决定左右，再应用尺寸与位置）
  const panelHidden = document.body.classList.contains('panel-hidden');
  const win = tauri?.window?.getCurrentWindow?.();
  if (win) {
    try {
      const pos = await win.outerPosition();
      const canvasW = modelManager.getCanvasSize()?.width ?? CONFIG.CANVAS_WIDTH ?? 280;
      const side = await computePanelSideBySpaceOnRight(pos, canvasW);
      document.body.classList.remove('panel-left', 'panel-right');
      document.body.classList.add(side === 'left' ? 'panel-left' : 'panel-right');
      await applyWindowSizeAndPosition(!panelHidden, side);
    } catch (err) {
      console.warn('[app] initialSync failed:', err);
    }
  }

  console.log('[app] Live2D desktop pet initialized');
})();
