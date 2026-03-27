# SeedDance 视频生成模块集成计划

> **执行对象**：本文档供 Claude Code / Codex 独立执行，请在执行前先完成审查阶段。  
> **目标**：将 SeedDance 大模型视频生成能力以独立模块接入小晴，保持与 OpenClaw 同级的隔离结构，方便未来整体移除。  
> **约束**：
> - 后端使用 NestJS 11 + Prisma + PostgreSQL，前端使用 Angular 21，桌面端使用 Tauri 2
> - SeedDance 模块以独立文件夹隔离，不侵入现有核心链路
> - 所有配置（base URL、API key、模型名）必须可配置化，不硬编码

---

## 审查阶段（执行前必读）

在开始任何编码工作前，请先完成以下代码审查，输出审查报告后再继续执行：

### 审查项目 1：前端路由结构
- 找到 Angular 前端的路由配置文件（通常在 `app.routes.ts` 或 `app-routing.module.ts`）
- 确认当前已有哪些 routes（尤其是 `quick`、`video`、`dev`、`openclaw` 等相关路由）
- 确认 lazy loading 的写法惯例（是否用 `loadComponent`，是否用 standalone component）
- 确认前端项目的组件文件夹命名惯例（kebab-case？按功能分？）

### 审查项目 2：OpenClaw 模块结构（作为参照）
- 找到 OpenClaw 相关文件夹，列出其目录结构
- 确认它是如何被注册到 NestJS module 里的
- 确认它的 service 如何被其他模块调用（直接 import？通过 interface？）
- 确认是否有独立的 OpenClaw config（环境变量、配置类）

### 审查项目 3：后端 Video/Chat 接口现状
- 找到现有的 chat 相关 controller 和 service
- 确认 LLM 调用的基础封装在哪里（OpenAI 兼容 client 的封装）
- 确认是否已有 video 相关的接口或 dto
- 确认 SSE（流式输出）的实现方式

### 审查项目 4：前端参数组件惯例
- 找到一个带多参数表单的现有组件（如对话配置、DevAgent 参数面板等）
- 确认表单的实现方式（Reactive Forms？Template Forms？Signal-based？）
- 确认图片上传的现有实现方式（如果有）
- 确认 UI 组件库（是否用 Angular Material、PrimeNG、还是自定义）

### 审查项目 5：环境配置体系
- 找到 `.env` 或配置文件的管理方式
- 确认 NestJS ConfigModule 的使用方式
- 确认前端环境变量的管理（`environment.ts`？）

**审查完成后输出格式：**
```
## 审查报告
- 前端路由文件位置：
- 路由惯例（lazy loading 写法）：
- OpenClaw 目录结构：
- OpenClaw NestJS module 注册方式：
- LLM client 封装位置：
- SSE 实现方式：
- 表单实现方式：
- 图片上传现有实现：
- UI 组件库：
- 配置管理方式：
```

---

## Phase 1：后端 SeedDance 模块骨架

**目标**：创建独立的 `seeddance` 文件夹，完成配置、类型定义、基础 service。

### 1.1 目录结构

参照 OpenClaw 模块结构，在 `src/seeddance/`（或审查确认的对应位置）创建：

```
src/seeddance/
├── seeddance.module.ts
├── seeddance.config.ts         # 配置类，读取环境变量
├── seeddance.controller.ts     # HTTP 接口
├── seeddance.service.ts        # 核心业务逻辑
├── dto/
│   ├── create-video.dto.ts     # 生成视频请求参数
│   └── video-status.dto.ts     # 任务状态响应
└── types/
    └── seeddance.types.ts      # 内部类型定义
```

### 1.2 配置类

`seeddance.config.ts` 中定义可配置项：

```typescript
// 以下字段全部从环境变量读取，不硬编码
export interface SeedDanceConfig {
  baseUrl: string;       // SEEDDANCE_BASE_URL
  apiKey: string;        // SEEDDANCE_API_KEY
  model: string;         // SEEDDANCE_MODEL，默认 'seeddance-v1'（从实际文档确认）
  timeout: number;       // SEEDDANCE_TIMEOUT，默认 120000
}
```

在 `.env.example` 中追加以下条目（不修改现有条目）：
```
SEEDDANCE_BASE_URL=
SEEDDANCE_API_KEY=
SEEDDANCE_MODEL=
SEEDDANCE_TIMEOUT=120000
```

### 1.3 DTO 定义

`create-video.dto.ts` 参数（以下参数名待 Phase 0 审查后根据实际 SeedDance API 文档调整）：

```typescript
export class CreateVideoDto {
  prompt: string;

  // 视频比例：'21:9' | '16:9' | '4:3' | '1:1' | '3:4' | '9:16'
  aspectRatio: string;

  // 分辨率：'480p' | '720p' | '1080p'
  resolution: string;

  // 时长（二选一，由 durationUnit 决定用哪个）
  duration: number;
  durationUnit: 'seconds' | 'frames';

  // 生成数量
  count: number;

  // 首帧图片（base64 或 URL，根据实际 API 文档决定格式）
  firstFrameImage?: string;

  // 尾帧图片
  lastFrameImage?: string;
}
```

### 1.4 Service 核心

`seeddance.service.ts` 实现以下方法：

- `createVideoTask(dto: CreateVideoDto): Promise<{ taskId: string }>`  
  调用 SeedDance API 创建生成任务，返回 taskId

- `getTaskStatus(taskId: string): Promise<VideoStatusDto>`  
  轮询任务状态，返回 `{ status: 'pending'|'running'|'completed'|'failed', videoUrl?: string, progress?: number }`

- `streamTaskStatus(taskId: string, res: Response): void`  
  通过 SSE 推送任务进度（参照项目现有 SSE 实现方式，从审查报告中确认）

### 1.5 Controller

`seeddance.controller.ts` 暴露以下端点：

```
POST   /seeddance/video          # 创建视频生成任务
GET    /seeddance/video/:taskId  # 查询任务状态
GET    /seeddance/video/:taskId/stream  # SSE 流式进度
GET    /seeddance/config         # 返回前端需要的配置（如支持的参数枚举）
```

### 1.6 Module 注册

`seeddance.module.ts` 按照 OpenClaw 的注册方式创建，并在 `AppModule` 中 import（参照审查报告中 OpenClaw 的注册方式）。

**Phase 1 完成标准：**
- [ ] `src/seeddance/` 目录结构完整
- [ ] `npm run build` 无报错
- [ ] `POST /seeddance/video` 可以接收请求（即使 SeedDance API 还没调通）

---

## Phase 2：SeedDance API 对接

**目标**：真正调通 SeedDance 的视频生成 API。

> ⚠️ **注意**：SeedDance 的实际 API 文档地址在需求中标注为 `xxx`（待补充）。  
> 执行前请确认以下信息（向用户询问或从项目 docs/ 找）：
> - SeedDance API 的实际端点路径
> - 是否 OpenAI 兼容格式？还是独立格式？
> - 视频生成是同步返回还是异步轮询？
> - 首帧/尾帧图片的传递方式（multipart？base64？URL？）
> - 参数名与枚举值的确切拼写

### 2.1 HTTP Client 封装

在 `seeddance.service.ts` 中使用 NestJS HttpModule 或 axios，参照项目中现有 LLM client 封装（从审查报告中确认位置），实现：

```typescript
// 发送请求时带上 Authorization header
headers: {
  'Authorization': `Bearer ${config.apiKey}`,
  'Content-Type': 'application/json'
}
```

### 2.2 参数映射

将前端传入的参数映射为 SeedDance API 实际要求的格式，例如：
- `aspectRatio: '16:9'` → API 实际字段（待文档确认）
- `resolution: '1080p'` → API 实际字段（待文档确认）
- `durationUnit: 'frames'` 时的换算逻辑（待文档确认）

### 2.3 任务轮询 / Webhook

根据 SeedDance API 的实际机制选择：
- 若为轮询：实现带退避的轮询（最多 120 次，每次间隔递增）
- 若为 Webhook：在 controller 中增加 `POST /seeddance/webhook` 端点

### 2.4 错误处理

- API 超时：返回 `{ status: 'failed', error: 'timeout' }`
- API 返回错误码：映射为标准错误结构
- 网络异常：重试 3 次后返回失败

**Phase 2 完成标准：**
- [ ] 使用真实 API key 可以成功发起视频生成请求
- [ ] 可以拿到 taskId 并查询到任务状态
- [ ] SSE 端点可以实时推送进度

---

## Phase 3：前端 Quick 路由与交互界面

**目标**：在前端创建 `/quick/video`（或审查确认的路由路径）页面，提供完整的参数输入界面。

### 3.1 路由注册

参照审查报告中的路由惯例，在前端路由中添加：

```typescript
// 参照现有 lazy loading 写法
{
  path: 'quick',
  children: [
    {
      path: 'video',
      loadComponent: () => import('./seeddance/seeddance-quick/seeddance-quick.component')
        .then(m => m.SeedDanceQuickComponent)
    }
  ]
}
```

> 如果 `quick` 路由已存在，追加 `video` 子路由；如果不存在，创建 `quick` 路由。

### 3.2 文件夹结构

```
src/app/seeddance/
├── seeddance-quick/
│   ├── seeddance-quick.component.ts
│   ├── seeddance-quick.component.html
│   └── seeddance-quick.component.scss（如项目使用 scss）
├── seeddance.service.ts              # 前端 HTTP service
└── seeddance.types.ts                # 前端类型定义
```

### 3.3 界面参数

界面必须包含以下输入（使用审查报告中确认的表单方式）：

**文本输入**
- Prompt 文本框（多行，必填）

**视频比例**（单选，默认 `16:9`）
- 21:9 / 16:9 / 4:3 / 1:1 / 3:4 / 9:16

**分辨率**（单选，默认 `720p`）
- 480p / 720p / 1080p

**视频时长**
- 数值输入框
- 单位切换：秒 / 帧（toggle 或 radio）

**生成数量**
- 数字选择，范围 1-4，默认 1

**首帧图片**（可选）
- 图片上传，支持拖拽
- 预览缩略图
- 清除按钮

**尾帧图片**（可选）
- 同首帧

**提交按钮**
- 提交中状态：禁用 + loading indicator

### 3.4 生成结果展示

提交后在同页面展示：
- 进度条（从 SSE 读取 progress）
- 状态文字（排队中 / 生成中 / 已完成 / 失败）
- 完成后展示视频播放器（`<video>` 标签，src 为返回的 videoUrl）
- 失败时展示错误信息 + 重试按钮

### 3.5 前端 Service

`seeddance.service.ts` 封装以下方法：
```typescript
createVideo(params: CreateVideoParams): Observable<{ taskId: string }>
getVideoStatus(taskId: string): Observable<VideoStatus>
streamVideoStatus(taskId: string): Observable<VideoProgress>  // 使用 EventSource
```

**Phase 3 完成标准：**
- [ ] `/quick/video` 路由可访问
- [ ] 所有参数可输入，图片可上传预览
- [ ] 提交后有 loading 状态
- [ ] 可以展示生成结果或错误信息

---

## Phase 4：联调与收尾

**目标**：前后端联调，完善体验，补充文档。

### 4.1 联调检查项
- [ ] 前端参数正确传递到后端
- [ ] 图片上传（首帧/尾帧）base64 编码正确
- [ ] SSE 进度推送前端正确接收
- [ ] 生成完成后视频可正常播放

### 4.2 配置文档

在 `src/seeddance/README.md` 中写明：
- 模块功能说明
- 所需环境变量（复制自 `.env.example`）
- 如何移除本模块（删除哪些文件 + 从 AppModule 中移除哪些 import）

### 4.3 路由入口

确认 `/quick/video` 在导航或某个入口处可以访问到（根据现有 UI 结构添加入口按钮或菜单项）。

**Phase 4 完成标准：**
- [ ] 端到端可以完整走通（输入 prompt → 生成视频 → 播放）
- [ ] `src/seeddance/README.md` 存在
- [ ] 模块可以独立移除而不影响其他功能

---

## 执行注意事项

1. **不要修改现有核心链路代码**（`chat`、`intent`、`orchestrator` 等模块）
2. **遇到 SeedDance API 文档缺失时停下来**，向用户确认，不要猜测 API 格式
3. **每个 Phase 完成后输出完成度报告**，格式：`Phase X 完成：[X] 任务A [X] 任务B [ ] 任务C（原因：xxx）`
4. **图片上传大小限制**：前端限制单张不超过 10MB，后端不转存（直接透传给 SeedDance API）
5. **参照 OpenClaw 结构**：任何不确定的架构决策，以 OpenClaw 模块的现有实现为准

---

*文档版本：2026-03-27*  
*待补充：SeedDance 实际 API 文档地址（当前为 xxx）*
