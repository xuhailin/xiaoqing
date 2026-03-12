/**
 * Live2D 模型管理器
 * 负责模型加载、切换、表情、动作、换装
 */
class ModelManager {
  constructor(pixiApp) {
    /** @type {PIXI.Application} */
    this.app = pixiApp;
    /** @type {PIXI.live2d.Live2DModel | null} */
    this.currentModel = null;
    /** @type {string | null} */
    this.currentModelName = null;
    /** @type {object | null} 当前模型的 manifest（可选） */
    this.manifest = null;
    /** @type {object | null} 模型特定的 STATE_MAP 覆盖 */
    this.stateMapOverride = null;
    /** @type {{ width: number, height: number } | null} 当前画布尺寸（由模型或 manifest 决定） */
    this._canvasSize = null;
  }

  /**
   * 根据模型尺寸与 CONFIG 上限计算画布宽高（保持比例、留边距）
   * @param {number} modelW - 模型原始宽度
   * @param {number} modelH - 模型原始高度
   * @returns {{ width: number, height: number }}
   */
  _computeCanvasSize(modelW, modelH) {
    const maxW = CONFIG.MAX_CANVAS_WIDTH ?? CONFIG.CANVAS_WIDTH ?? 280;
    const maxH = CONFIG.MAX_CANVAS_HEIGHT ?? CONFIG.CANVAS_HEIGHT ?? 300;
    if (this.manifest?.canvasWidth != null && this.manifest?.canvasHeight != null) {
      return {
        width: Math.min(maxW, Math.round(Number(this.manifest.canvasWidth))),
        height: Math.min(maxH, Math.round(Number(this.manifest.canvasHeight))),
      };
    }
    const scale = Math.min(maxW / modelW, maxH / modelH, 1) * 0.9;
    return {
      width: Math.round(modelW * scale),
      height: Math.round(modelH * scale),
    };
  }

  /**
   * 将当前画布尺寸同步到 CSS 变量（供 #canvas-container、.main-row 使用）
   */
  _syncCanvasSizeCSS() {
    if (!this._canvasSize) return;
    document.documentElement.style.setProperty('--canvas-width', `${this._canvasSize.width}px`);
    document.documentElement.style.setProperty('--canvas-height', `${this._canvasSize.height}px`);
  }

  /**
   * 获取当前画布尺寸（供 setSize 等使用）
   * @returns {{ width: number, height: number } | null}
   */
  getCanvasSize() {
    return this._canvasSize ? { ...this._canvasSize } : null;
  }

  /**
   * 加载指定名称的 Live2D 模型
   * @param {string} modelName - models/ 下的目录名
   */
  async loadModel(modelName) {
    // 移除旧模型
    if (this.currentModel) {
      this.app.stage.removeChild(this.currentModel);
      this.currentModel.destroy();
      this.currentModel = null;
    }

    const modelFile = CONFIG.MODEL_FILES?.[modelName] || `${modelName}.model3.json`;
    const modelPath = `${CONFIG.MODELS_BASE_PATH}/${modelName}/${modelFile}`;

    const model = await PIXI.live2d.Live2DModel.from(modelPath, {
      autoInteract: false,
      autoUpdate: true,
    });

    this.app.stage.addChild(model);
    this.currentModel = model;
    this.currentModelName = modelName;

    // 先加载 manifest（可选），以便 _computeCanvasSize 可使用 manifest 中的 canvasWidth/Height
    await this._loadManifest(modelName);

    // 按模型尺寸（及 manifest 覆盖）计算画布宽高，并限制在 CONFIG 上限内
    this._canvasSize = this._computeCanvasSize(model.width, model.height);
    const canvasW = this._canvasSize.width;
    const canvasH = this._canvasSize.height;

    this.app.renderer.resize(canvasW, canvasH);

    // 缩放与定位：在画布内适配，90% 留边距
    const scale = Math.min(canvasW / model.width, canvasH / model.height) * 0.9;
    model.scale.set(scale);
    model.x = canvasW / 2;
    model.y = canvasH;
    model.anchor.set(0.5, 1);

    this._syncCanvasSizeCSS();

    console.log(`[model-manager] loaded model: ${modelName}, canvas: ${canvasW}x${canvasH}`);
  }

  /**
   * 尝试加载模型的 manifest 文件（定义换装组合等）
   */
  async _loadManifest(modelName) {
    this.manifest = null;
    this.stateMapOverride = null;
    // 只有在 CONFIG.MODEL_MANIFESTS 中声明的模型才尝试加载 manifest
    if (!CONFIG.MODEL_MANIFESTS?.includes(modelName)) return;
    try {
      const resp = await fetch(`${CONFIG.MODELS_BASE_PATH}/${modelName}/model-manifest.json`);
      if (resp.ok) {
        this.manifest = await resp.json();
        if (this.manifest.stateMap) {
          this.stateMapOverride = this.manifest.stateMap;
        }
        console.log(`[model-manager] manifest loaded for ${modelName}`);
      }
    } catch {
      // manifest 是可选的，不存在不报错
    }
  }

  /**
   * 获取当前生效的状态映射
   */
  getStateMap() {
    return this.stateMapOverride || CONFIG.STATE_MAP;
  }

  /**
   * 切换表情
   * @param {string} name - 表情名称（对应 Expressions[].Name）
   */
  setExpression(name) {
    if (!this.currentModel || !name) return;
    try {
      this.currentModel.expression(name);
    } catch (e) {
      console.warn(`[model-manager] expression "${name}" not found:`, e.message);
    }
  }

  /**
   * 播放动作
   * @param {string} group - 动作组名
   * @param {number} [index] - 组内索引（不传则随机）
   * @param {number} [priority=2] - 优先级：IDLE=1, NORMAL=2, FORCE=3
   */
  playMotion(group, index = undefined, priority = 2) {
    if (!this.currentModel || !group) return;
    try {
      this.currentModel.motion(group, index, priority);
    } catch (e) {
      console.warn(`[model-manager] motion group "${group}" not found:`, e.message);
    }
  }

  /**
   * 眼球跟随鼠标
   * @param {number} x - 鼠标 x（相对画布）
   * @param {number} y - 鼠标 y（相对画布）
   */
  focusAt(x, y) {
    this.currentModel?.focus(x, y);
  }

  /**
   * 通过 Parts Visibility 切换服装/发型
   * @param {string} outfitName - manifest 中定义的 outfit 名称
   */
  setOutfit(outfitName) {
    if (!this.currentModel || !this.manifest?.outfits) return;

    const outfitConfig = this.manifest.outfits[outfitName];
    if (!outfitConfig) {
      console.warn(`[model-manager] outfit "${outfitName}" not found in manifest`);
      return;
    }

    const coreModel = this.currentModel.internalModel?.coreModel;
    if (!coreModel) return;

    // 先隐藏所有可切换的 parts
    const allParts = this.manifest.allSwitchableParts || [];
    for (const partId of allParts) {
      try {
        coreModel.setPartOpacityById(partId, 0);
      } catch { /* part 不存在则跳过 */ }
    }

    // 显示选中 outfit 的 parts
    for (const partId of outfitConfig.visibleParts || []) {
      try {
        coreModel.setPartOpacityById(partId, 1);
      } catch { /* part 不存在则跳过 */ }
    }

    console.log(`[model-manager] outfit switched to: ${outfitName}`);
  }

  /**
   * 获取当前模型可用的表情列表
   * @returns {string[]}
   */
  getAvailableExpressions() {
    if (!this.currentModel) return [];
    const defs = this.currentModel.internalModel?.settings?.expressions;
    if (!defs) return [];
    return defs.map((e) => e.Name || e.name || 'unknown');
  }

  /**
   * 获取当前模型可用的动作组列表
   * @returns {string[]}
   */
  getAvailableMotionGroups() {
    if (!this.currentModel) return [];
    const motions = this.currentModel.internalModel?.settings?.motions;
    if (!motions) return [];
    return Object.keys(motions);
  }
}
