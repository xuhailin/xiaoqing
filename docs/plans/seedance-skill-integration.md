# SeeDance 视频生成能力接入方案

> 日期：2026-03-27
> 目标：将 SeeDance (Doubao 图/文生视频) 接入小晴聊天能力，前后端完整联通

---

## 现状与核心挑战

### 现有 Skill 架构是同步的

```
用户发消息
 → IntentRouter 识别 taskIntent
 → CapabilityRegistry.execute(request)  ← 直接返回 CapabilityResult
 → content 写入 assistantMessage
 → 返回前端
```

`ICapability.execute()` 是 `Promise<CapabilityResult>`，假设执行在一次 HTTP 请求内完成。

### SeeDance API 是异步的

```
POST /tasks → { task_id }         (立即返回)
  ↓
轮询 GET /tasks/{id} ...          (1-2 分钟)
  ↓
{ status: "succeeded", video_url }
```

**解决策略**：在 skill 内部轮询，最长等待 120 秒。这不是最优架构但最小可落地。
超时则在消息中告知用户「生成中，请稍后询问进度」，后续可升级为异步 Job 模式。

---

## API 选型

| 方案 | 地址 | 特点 |
|---|---|---|
| **Volcengine 原生（推荐）** | `https://ark.cn-beijing.volces.com/api/v3` | ARK_API_KEY，官方，稳定 |
| AceData 代理 | `https://api.acedata.cloud/seedance/videos` | 同步风格，但有额外费用层 |

**选择 Volcengine 原生**，直接使用 `ARK_API_KEY`，避免引入第三方代理。

---

## Step 1：后端 — SeedanceSkillModule

### 目录结构

```
backend/src/action/skills/seedance/
  seedance-skill.module.ts
  seedance-skill.service.ts
  seedance-skill.types.ts
```

### 1a. `seedance-skill.types.ts`

```typescript
export interface SeedanceExecuteParams {
  /** 视频描述 prompt，支持 --resolution / --duration / --camerafixed 等参数 */
  prompt: string;
  /** 可选参考图（图生视频），URL 或 base64 */
  imageUrl?: string;
  /** 首帧图（role: first_frame） */
  firstFrameUrl?: string;
  /** 尾帧图（role: last_frame） */
  lastFrameUrl?: string;
  /** 分辨率：480p | 720p | 1080p，默认 720p */
  resolution?: string;
  /** 时长秒数：5 | 10，默认 5 */
  duration?: number;
}

export interface SeedanceTaskStatus {
  taskId: string;
  status: 'submitted' | 'running' | 'succeeded' | 'failed';
  videoUrl?: string;
  error?: string;
}
```

### 1b. `seedance-skill.service.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ICapability } from '../../capability.interface';
import type { CapabilityRequest, CapabilityResult } from '../../capability.types';
import type { MessageChannel } from '../../../gateway/message-router.types';
import type { SeedanceExecuteParams, SeedanceTaskStatus } from './seedance-skill.types';

const POLL_INTERVAL_MS = 4000;
const MAX_POLLS = 30; // 最多等 120 秒

@Injectable()
export class SeedanceSkillService implements ICapability {
  private readonly logger = new Logger(SeedanceSkillService.name);
  private readonly apiKey: string;
  private readonly baseUrl = 'https://ark.cn-beijing.volces.com/api/v3';
  private readonly model: string;

  readonly name = 'seedance';
  readonly taskIntent = 'video_generation';
  readonly channels: MessageChannel[] = ['chat'];
  readonly description = '生成视频（文生视频 / 图生视频），支持指定场景、分辨率、时长';
  readonly surface = 'assistant' as const;
  readonly scope = 'public' as const;
  readonly portability = 'config-bound' as const;
  readonly requiresAuth = false;
  readonly requiresUserContext = false;
  readonly visibility = 'default' as const;

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('ARK_API_KEY') ?? '';
    this.model = config.get<string>('SEEDANCE_MODEL') ?? 'doubao-seedance-1-0-pro-250528';
  }

  isAvailable(): boolean {
    return Boolean(this.apiKey);
  }

  async execute(request: CapabilityRequest): Promise<CapabilityResult> {
    const params = this.parseParams(request.params);
    if (!params) {
      return { success: false, content: null, error: 'seedance: prompt is required' };
    }

    try {
      const taskId = await this.submitTask(params);
      this.logger.log(`[SeeDance] task submitted: ${taskId}`);

      const result = await this.pollUntilDone(taskId);

      if (result.status === 'succeeded' && result.videoUrl) {
        const content = this.buildSuccessContent(params.prompt, result.videoUrl);
        return {
          success: true,
          content,
          error: null,
          meta: { taskId, videoUrl: result.videoUrl },
        };
      }

      if (result.status === 'failed') {
        return {
          success: false,
          content: `视频生成失败：${result.error ?? '未知错误'}`,
          error: result.error ?? 'task failed',
        };
      }

      // 超时
      return {
        success: false,
        content: `视频正在生成中，任务 ID：\`${taskId}\`。生成通常需要 1-2 分钟，请稍后问我进度。`,
        error: 'timeout',
        meta: { taskId, status: 'pending' },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`[SeeDance] execute failed: ${msg}`);
      return { success: false, content: null, error: msg };
    }
  }

  // ── 私有方法 ────────────────────────────────────────────

  private parseParams(raw: Record<string, unknown>): SeedanceExecuteParams | null {
    const prompt = typeof raw.prompt === 'string' ? raw.prompt.trim() : '';
    if (!prompt) return null;
    return {
      prompt,
      imageUrl: typeof raw.imageUrl === 'string' ? raw.imageUrl : undefined,
      firstFrameUrl: typeof raw.firstFrameUrl === 'string' ? raw.firstFrameUrl : undefined,
      lastFrameUrl: typeof raw.lastFrameUrl === 'string' ? raw.lastFrameUrl : undefined,
      resolution: typeof raw.resolution === 'string' ? raw.resolution : '720p',
      duration: typeof raw.duration === 'number' ? raw.duration : 5,
    };
  }

  /** 提交生成任务，返回 task_id */
  private async submitTask(params: SeedanceExecuteParams): Promise<string> {
    const content = this.buildRequestContent(params);

    const resp = await fetch(`${this.baseUrl}/contents/generations/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ model: this.model, content }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`SeeDance submit failed (${resp.status}): ${text}`);
    }

    const data = await resp.json() as { id: string };
    if (!data.id) throw new Error('SeeDance submit: no task id in response');
    return data.id;
  }

  /** 构建请求的 content 数组 */
  private buildRequestContent(params: SeedanceExecuteParams): unknown[] {
    const items: unknown[] = [];

    // text prompt（包含 --resolution 等参数）
    const promptWithFlags = [
      params.prompt,
      `--resolution ${params.resolution ?? '720p'}`,
      `--duration ${params.duration ?? 5}`,
    ].join(' ');
    items.push({ type: 'text', text: promptWithFlags });

    // 首帧图
    if (params.firstFrameUrl) {
      items.push({ type: 'image_url', image_url: { url: params.firstFrameUrl }, role: 'first_frame' });
    }
    // 尾帧图
    if (params.lastFrameUrl) {
      items.push({ type: 'image_url', image_url: { url: params.lastFrameUrl }, role: 'last_frame' });
    }
    // 单参考图（非首尾帧）
    if (params.imageUrl && !params.firstFrameUrl && !params.lastFrameUrl) {
      items.push({ type: 'image_url', image_url: { url: params.imageUrl } });
    }

    return items;
  }

  /** 轮询直到完成或超时 */
  private async pollUntilDone(taskId: string): Promise<SeedanceTaskStatus> {
    for (let i = 0; i < MAX_POLLS; i++) {
      await this.sleep(POLL_INTERVAL_MS);

      const status = await this.queryTask(taskId);
      this.logger.debug(`[SeeDance] poll #${i + 1} taskId=${taskId} status=${status.status}`);

      if (status.status === 'succeeded' || status.status === 'failed') {
        return status;
      }
    }
    return { taskId, status: 'running' }; // timeout
  }

  /** 查询单个任务状态 */
  private async queryTask(taskId: string): Promise<SeedanceTaskStatus> {
    const resp = await fetch(
      `${this.baseUrl}/contents/generations/tasks/${taskId}`,
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
      },
    );

    if (!resp.ok) {
      throw new Error(`SeeDance query failed (${resp.status})`);
    }

    const data = await resp.json() as {
      id: string;
      status: string;
      content?: Array<{ type: string; video_url?: { url: string } }>;
      error?: { message: string };
    };

    const videoContent = data.content?.find((c) => c.type === 'video_url');
    const videoUrl = videoContent?.video_url?.url;

    return {
      taskId: data.id,
      status: this.mapStatus(data.status),
      videoUrl,
      error: data.error?.message,
    };
  }

  private mapStatus(raw: string): SeedanceTaskStatus['status'] {
    if (raw === 'succeeded') return 'succeeded';
    if (raw === 'failed') return 'failed';
    if (raw === 'running') return 'running';
    return 'submitted';
  }

  /** 构建给用户看的成功消息 */
  private buildSuccessContent(prompt: string, videoUrl: string): string {
    return [
      `视频已生成完成 🎬`,
      ``,
      `**提示词：** ${prompt}`,
      ``,
      `[▶ 点击观看视频](${videoUrl})`,
      ``,
      `<video-result url="${videoUrl}" />`,
    ].join('\n');
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
```

> **注意**：Volcengine API 返回的 task 结构中视频 URL 在 `content[].video_url.url`，需在真实 API 调用后确认字段路径。

### 1c. `seedance-skill.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { SeedanceSkillService } from './seedance-skill.service';

@Module({
  providers: [SeedanceSkillService],
  exports: [SeedanceSkillService],
})
export class SeedanceSkillModule {}
```

### 1d. 注册到 `ActionModule`

**文件：`backend/src/action/action.module.ts`**

```typescript
// imports 加
import { SeedanceSkillModule } from './skills/seedance/seedance-skill.module';
import { SeedanceSkillService } from './skills/seedance/seedance-skill.service';

// @Module imports 加
SeedanceSkillModule,

// 构造函数加
private readonly seedance: SeedanceSkillService,

// onModuleInit 加
this.registry.register(this.seedance);
```

### 1e. `.env.example` 新增配置

```
# ── SeeDance 视频生成（Volcengine / 豆包）─────────────────────────────
# 火山引擎 API Key（在 https://ark.console.volcengine.com 获取）
ARK_API_KEY=
# SeeDance 模型名称（默认 doubao-seedance-1-0-pro-250528）
SEEDANCE_MODEL=doubao-seedance-1-0-pro-250528
```

---

## Step 2：意图识别 — 让 IntentRouter 识别视频生成意图

**文件：** 找到 intent 识别的 prompt 文件或 `intent.service.ts` 中的 taskIntent 枚举。

在 intent 分类 prompt 中加入 `video_generation` 意图描述：

```
- video_generation：用户想要生成视频、创作视频、制作短片，或请求将图片转为视频。
  示例：「帮我生成一段XX的视频」「把这张图做成视频」「用AI生成视频」
```

在 `intent.types.ts` 的 `taskIntent` 联合类型中加 `'video_generation'`。

---

## Step 3：LLM Param 提取 — 从对话中提取 prompt 等参数

**当前机制**：在 `CapabilityChainExecutor` 或 `ActionReasoner` 中，LLM 从用户输入中提取 capability 所需参数。

需要在参数提取 prompt 中加入 `seedance` 能力的参数描述：

```
capability: seedance
params:
  - prompt (string, required): 视频描述，可包含场景、动作、风格等
  - imageUrl (string, optional): 参考图 URL（图生视频时提供）
  - resolution (string, optional): 分辨率 480p/720p/1080p，默认 720p
  - duration (number, optional): 视频时长秒数，5 或 10，默认 5
```

---

## Step 4：前端 — 视频消息渲染

### 4a. 方案选择

视频生成成功后，后端 `CapabilityResult.content` 中包含：
```
<video-result url="https://xxx.mp4" />
```

需要在 `message-content.component.ts` 中识别并渲染这个自定义标签。

**两种方式：**

| 方式 | 说明 | 推荐 |
|---|---|---|
| A. 解析自定义标签 `<video-result />` | 在渲染前用正则提取 url，替换为 `<video>` HTML | ✅ 简单，不改 DOMPurify |
| B. 扩展 DOMPurify 白名单允许 `<video>` | 让 LLM/backend 直接输出 `<video>` 标签 | 可行但需白名单维护 |

**推荐方式 A**。

### 4b. `message-content.component.ts` 改造

在 `ngOnChanges` 中（或 `renderedHtml` getter 中），在 DOMPurify 渲染之前，把 `<video-result url="xxx" />` 替换为标准的 video embed HTML：

```typescript
// 在现有 marked 渲染管道之后、DOMPurify 之前添加：
private replaceVideoTags(html: string): string {
  return html.replace(
    /<video-result\s+url="([^"]+)"\s*\/?>/gi,
    (_, url) => `
      <div class="video-result-card">
        <video controls preload="metadata" style="max-width:100%;border-radius:8px">
          <source src="${url}" type="video/mp4">
        </video>
        <div class="video-actions">
          <a href="${url}" target="_blank" rel="noopener noreferrer">在新窗口打开</a>
        </div>
      </div>
    `,
  );
}
```

在 `renderedHtml` 计算中：

```typescript
// 原来：
const dirty = marked.parse(this.content ?? '') as string;
this.renderedHtml = DOMPurify.sanitize(dirty, { ... });

// 改为：
const dirty = marked.parse(this.content ?? '') as string;
const withVideo = this.replaceVideoTags(dirty);
this.renderedHtml = DOMPurify.sanitize(withVideo, {
  ...existingConfig,
  ADD_TAGS: ['video', 'source'],  // 允许 video 标签通过 purify
  ADD_ATTR: ['controls', 'preload', 'src', 'type'],
});
```

### 4c. 样式（可选）

在 `message-content.component.ts` 的 styles 数组中加：

```css
.video-result-card {
  margin: var(--space-3) 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  overflow: hidden;
  background: var(--color-surface-2);
}

.video-result-card video {
  display: block;
  width: 100%;
}

.video-actions {
  padding: var(--space-2) var(--space-3);
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.video-actions a {
  color: var(--color-accent);
  text-decoration: none;
}
```

---

## Step 5：前端 — 生成中状态提示（可选升级）

当 SeeDance 超时（120s 内未生成完）时，backend 会返回：
```
视频正在生成中，任务 ID：`xxx`。请稍后问我进度。
```

如果用户后续询问「视频好了吗」，可以用工具查询 task 状态。

**可选：** 新增 `GET /seedance/tasks/:id` 状态查询端点，前端可以轮询。

```typescript
// backend: seedance.controller.ts（可选）
@Get('seedance/tasks/:id')
async getTaskStatus(@Param('id') id: string) {
  return this.seedanceSkill.queryTaskPublic(id);
}
```

---

## Step 6：前端 — 发送带图片的消息（图生视频）

目前前端 `ConversationService.sendMessage(conversationId, content)` 只支持文本。

若要支持图生视频（上传图片 → 生成视频），需要：

1. 前端允许粘贴/上传图片 → 先上传到后端 `POST /assets/upload` 得到 URL
2. 在消息中带上 imageUrl 元数据：
   ```typescript
   sendMessage(conversationId, '把这张图做成视频', undefined, {
     attachments: [{ type: 'image', url: 'https://...' }]
   })
   ```
3. Backend 的 `SendMessageBody.metadata` 带附件信息，在 param 提取时注入 `imageUrl`

**Phase 1 先只做纯文生视频，图生视频作为后续迭代。**

---

## 完整数据流

```
用户: "帮我生成一段无人机穿越峡谷的视频"
  ↓
[IntentRouter]
  taskIntent = 'video_generation'
  ↓
[ActionReasoner / CapabilityChainExecutor]
  capability = 'seedance'
  params = { prompt: "无人机穿越峡谷", resolution: "1080p", duration: 5 }
  ↓
[SeedanceSkillService.execute()]
  1. POST /tasks → task_id
  2. 轮询 30 次 × 4s = 最多 120s
  3. 返回 CapabilityResult { content: "视频已生成\n<video-result url='...' />" }
  ↓
[AssistantOrchestrator]
  写入 assistantMessage.content
  ↓
[前端 message-content.component]
  marked 渲染 markdown
  replaceVideoTags() 替换 <video-result /> → <video> HTML
  DOMPurify sanitize（白名单加 video/source）
  ↓
用户看到内嵌视频播放器
```

---

## 缺口清单（仍需确认）

| # | 问题 | 说明 |
|---|---|---|
| 1 | Volcengine task 返回结构 | 文档示例中 task query 响应的 JSON 路径需用真实 API Key 验证（`content[].video_url.url` 可能不同） |
| 2 | ARK_API_KEY 是否已有 | 需确认 SeeDance 模型权限是否已开通 |
| 3 | 参数提取 prompt 位置 | 需找到现有的 capability param 提取 prompt 文件，确认在哪里加 seedance schema |
| 4 | 图生视频 | 本方案仅支持文生视频；图生视频需要前端支持图片附件上传 |
| 5 | 超时后续跟进 | 120s 超时后给 taskId，但目前没有后续查询 UI，用户需要文字询问 |

---

## 最快验证路径（建议顺序）

```
1. 先用 curl 验证 ARK_API_KEY + model 权限（docs/seeddance/curl.md 中的命令）
2. 实现 SeedanceSkillService + 注册到 ActionModule
3. curl 测试 POST /conversations/:id/messages 发「生成视频」看 intent 是否命中
4. 调通后端后，改 message-content.component 支持 <video-result> 渲染
5. 端到端测试
```
