# Live2D 桌面端维护指南

## 目录结构

```
desktop/
├── index.html                # 主页面（PixiJS canvas + Live2D）
├── js/
│   ├── config.js             # 配置（后端地址、默认模型、状态映射）
│   ├── app.js                # 主入口
│   ├── model-manager.js      # 模型管理（加载/表情/动作/换装）
│   └── state-bridge.js       # SSE 状态桥接
├── models/                   # Live2D 模型（手动下载，不提交 git）
│   ├── hiyori/
│   └── mark/
├── public/lib/
│   └── live2dcubismcore.min.js  # Cubism 4 Core（手动下载）
└── docs/
    └── live2d-maintenance.md    # 本文件
```

---

## 首次设置

### 1. 下载 Cubism Core

1. 访问 https://www.live2d.com/sdk/download/web/
2. 下载 **Cubism SDK for Web**
3. 解压后找到 `Core/live2dcubismcore.min.js`
4. 复制到 `desktop/public/lib/live2dcubismcore.min.js`

### 2. 下载示例模型

1. 访问 https://www.live2d.com/zh-CHS/learn/sample/
2. 下载 **桃濑日和 (Hiyori)** 的 FREE 版本
3. 解压到 `desktop/models/hiyori/`，确保 `hiyori.model3.json` 在此目录
4. 下载 **马克君 (Mark)** 的 FREE 版本
5. 解压到 `desktop/models/mark/`，确保 `mark.model3.json` 在此目录

### 3. 启动

```bash
# 确保后端已启动
npm run backend

# 启动桌面端
npm run desktop
```

---

## 添加新模型

1. 获取 Cubism 4 模型文件（来源：live2d.com 示例、nizima.com 购买、或自己用 Cubism Editor 制作）
2. 在 `desktop/models/` 下创建目录，目录名即为模型名
3. 将所有模型文件放入该目录，确保 `.model3.json` 文件名与目录名一致

   ```
   desktop/models/mymodel/
   ├── mymodel.model3.json    # 入口文件（必须）
   ├── mymodel.moc3           # 编译模型（必须）
   ├── mymodel.physics3.json  # 物理模拟（可选）
   ├── textures/              # 贴图
   ├── expressions/           # 表情
   └── motions/               # 动作
   ```

4. 修改 `desktop/js/config.js` 中的 `DEFAULT_MODEL` 为新模型名

   ```javascript
   DEFAULT_MODEL: 'mymodel',
   ```

---

## 自定义状态→表情/动作映射

编辑 `desktop/js/config.js` 中的 `STATE_MAP`：

```javascript
STATE_MAP: {
  idle:     { expression: null,    motionGroup: 'idle' },
  speaking: { expression: 'f02',   motionGroup: 'tap_body' },
  thinking: { expression: null,    motionGroup: 'idle' },
},
```

- `expression`: 对应 `.model3.json` → `FileReferences.Expressions[].Name`
- `motionGroup`: 对应 `.model3.json` → `FileReferences.Motions` 的组名

### 查看可用表情和动作

打开桌面端后，在浏览器控制台或 Tauri 开发者工具中执行：

```javascript
// 当前模型的表情列表
modelManager.getAvailableExpressions()

// 当前模型的动作组列表
modelManager.getAvailableMotionGroups()
```

### 模型特定映射

如果某个模型的表情/动作名称与默认映射不同，可以在模型目录下创建 `model-manifest.json`：

```json
{
  "stateMap": {
    "idle":     { "expression": null,     "motionGroup": "Idle" },
    "speaking": { "expression": "Happy",  "motionGroup": "Talk" },
    "thinking": { "expression": "Sad",    "motionGroup": "Think" }
  }
}
```

---

## 换装（服装/发型切换）

### 前提条件

模型必须在 Cubism Editor 中制作时包含多套 Parts（如 `PartClothes_A`、`PartClothes_B`）。不是所有模型都支持换装。

### 配置

在模型目录下的 `model-manifest.json` 中定义：

```json
{
  "allSwitchableParts": [
    "PartClothes_A", "PartClothes_B",
    "PartHairFront_A", "PartHairFront_B"
  ],
  "outfits": {
    "default": {
      "visibleParts": ["PartClothes_A", "PartHairFront_A"]
    },
    "casual": {
      "visibleParts": ["PartClothes_B", "PartHairFront_B"]
    }
  }
}
```

### 调用

```javascript
// 在控制台切换服装
modelManager.setOutfit('casual')
```

---

## 手动测试状态切换

后端提供了调试接口：

```bash
# 查看当前状态
curl http://localhost:3000/pet/state

# 手动设置状态
curl -X POST http://localhost:3000/pet/state \
  -H 'Content-Type: application/json' \
  -d '{"state": "speaking"}'

# 可用状态：idle, speaking, thinking
```

---

## 更新依赖

| 库 | 当前版本 | 兼容要求 | 更新方式 |
|---|---|---|---|
| PixiJS | 6.5.10 | 必须 6.x（pixi-live2d-display 不兼容 7+） | 更新 CDN URL |
| pixi-live2d-display | 0.4.0 | 需要 PixiJS 6.x | 更新 CDN URL |
| live2dcubismcore.min.js | Cubism 4 | 从 Live2D SDK 下载 | 手动替换文件 |

---

## 常见问题

### 模型不显示

1. 检查浏览器控制台/Tauri 开发者工具是否有报错
2. 确认 `live2dcubismcore.min.js` 存在于 `public/lib/`
3. 确认模型目录结构正确，`.model3.json` 文件名与目录名一致

### 透明背景失效

确认 `tauri.conf.json` 中 `transparent: true` 和 `macOSPrivateApi: true`

### SSE 连接失败

1. 确认后端已启动（`npm run backend`）
2. 检查 CORS 配置是否允许 `http://localhost:1420`
3. 访问 `http://localhost:3000/pet/state` 测试接口是否正常

### 表情/动作不生效

1. 用 `modelManager.getAvailableExpressions()` 和 `modelManager.getAvailableMotionGroups()` 查看可用名称
2. 确认 `STATE_MAP` 或 `model-manifest.json` 中的名称匹配

---

## 清除应用缓存（打包版）

若桌面版出现**最新对话不加载**、界面异常或升级后表现异常，可清除应用缓存后重开：

```bash
# 在项目根目录或 desktop 目录下执行
cd desktop && npm run clear-cache
```

会删除 macOS 下与 Tauri 应用标识 `com.longmemory.desktop.pet` 对应的目录：

- `~/Library/Caches/com.longmemory.desktop.pet`
- `~/Library/Application Support/com.longmemory.desktop.pet`

**注意**：请先完全退出 LongMemory Pet 再执行清除，然后重新打开应用。若对话仍不加载，请确认后端已启动且前端请求的 API 地址正确（打包后需与后端可达，如同一台机用 `http://localhost:3000`）。
