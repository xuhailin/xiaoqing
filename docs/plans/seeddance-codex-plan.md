# SeedDance 视频生成模块集成 — Codex 可执行计划

> **版本**：2026-03-27（基于代码审查生成，替代 seeddance-integration-plan.md）
> **目标**：在前端新增 `/quick/video` 页面，后端新增独立 `/seeddance/**` HTTP 接口，与现有聊天链路完全隔离。
> **执行前提**：已完成以下审查，以下所有路径、命名、模式均以实际代码为准。

---

## 审查结论（执行依据）

| 项目 | 结论 |
|------|------|
| **Seedance Skill** | `action/skills/seedance/` 已被删除，`action.module.ts` 引用已清理干净。本次**从零实现** Volcengine API 调用，无任何可复用的现有 seedance 代码 |
| **API 格式** | 官方 Volcengine API（见 `docs/seeddance/curl.md`）：`POST /contents/generations/tasks` 返回 `{ id: string }`；`GET /contents/generations/tasks/:id` 返回 `{ id, status, content?: [{type,video_url?}], error? }` |
| **状态映射** | `submitted/queued` → `pending`，`running` → `running`，`succeeded` → `completed`，`failed` → `failed` |
| **NestJS 模块注册** | `AppModule` 直接在 `imports[]` 中列出（见 app.module.ts），无需 forFeature，参照 `PlanModule`/`IdeaModule` 写法 |
| **SSE** | 项目中无现有 SSE 案例，使用 NestJS `@Sse()` 装饰器 + RxJS `Observable<MessageEvent>` |
| **配置变量** | `.env.example` 中无任何 seedance/ARK 相关变量（已随 skill 删除），需要全新补充：`ARK_API_KEY`、`SEEDDANCE_BASE_URL`、`SEEDDANCE_MODEL`、`SEEDDANCE_TIMEOUT` |
| **前端路由** | `app.routes.ts` 中无 `quick` 路由；新增时放在 `MainLayoutComponent` 的 `children[]` 内，与 `design-agent` 并列，使用 `loadComponent` 懒加载 |
| **前端表单** | 项目使用 Angular Signals（`signal()`/`computed()`）+ `FormsModule`，**不使用 Reactive Forms** |
| **图片上传** | 参照 `design-agent-page.component.ts`：`FileReader.readAsDataURL()` → base64 data URL，限制 10MB |
| **前端 HTTP service** | 放在 `frontend/src/app/core/services/` 目录（与 design-agent.service.ts 同级），SSE 用原生 `EventSource` 封装为 `Observable` |
| **UI 组件库** | 自定义设计系统，使用 `var(--color-*)`, `var(--space-*)`, `var(--radius-*)` CSS 变量，**禁止写死颜色/尺寸** |
| **测试** | 遵守 `no-new-tests-by-default.mdc`，**不新增任何测试文件** |

---

## Phase 1：后端独立 HTTP 模块

### 1.1 目录结构

在 `backend/src/seeddance/` 创建（注意：不是 `action/skills/`，那是 chat 驱动的能力，这里是独立 HTTP 入口）：

```
backend/src/seeddance/
├── seeddance.module.ts
├── seeddance.service.ts
├── seeddance.controller.ts
└── dto/
    ├── create-video.dto.ts
    └── video-status.dto.ts
```

> 不需要单独的 `config.ts`（项目中各模块直接 `inject(ConfigService)`）。
> 不需要单独的 `types/`（类型直接写在 dto 或 service 顶部）。

### 1.2 `dto/create-video.dto.ts`

```typescript
export class CreateVideoDto {
  prompt!: string;

  /** '21:9' | '16:9' | '4:3' | '1:1' | '3:4' | '9:16'，默认 '16:9' */
  aspectRatio?: string;

  /** '480p' | '720p' | '1080p'，默认 '720p' */
  resolution?: string;

  /** 时长数值，默认 5 */
  duration?: number;

  /** 'seconds'（默认）| 'frames'；frames 时后端除以 24 换算为秒再拼入 prompt */
  durationUnit?: 'seconds' | 'frames';

  /** 首帧图片：base64 data URL（data:image/png;base64,...）或 HTTP URL */
  firstFrameImage?: string;

  /** 尾帧图片：同首帧 */
  lastFrameImage?: string;
}
```

### 1.3 `dto/video-status.dto.ts`

```typescript
export class VideoStatusDto {
  taskId!: string;
  status!: 'pending' | 'running' | 'completed' | 'failed';
  videoUrl?: string;
  error?: string;
}
```

### 1.4 `seeddance.service.ts`

**关键设计判断**：
- Seedance Skill 已删除，本 service 直接实现 Volcengine API 调用，无任何可复用依赖
- 配置读取：`ARK_API_KEY`（主 key），可选 `SEEDDANCE_API_KEY` 作为专用 key（优先级更高）
- `baseUrl` 默认 `https://ark.cn-beijing.volces.com/api/v3`（与 `docs/seeddance/curl.md` 一致）

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Observable, interval, from, switchMap, map, startWith, takeWhile } from 'rxjs';
import type { MessageEvent } from '@nestjs/common';
import type { CreateVideoDto } from './dto/create-video.dto';
import type { VideoStatusDto } from './dto/video-status.dto';

const POLL_INTERVAL_MS = 4000;

// Volcengine 任务查询响应（与 seedance-skill.service.ts 保持一致）
interface VTask {
  id: string;
  status: string;
  content?: Array<{ type: string; video_url?: { url: string } }>;
  error?: { message: string };
}

@Injectable()
export class SeedanceService {
  private readonly logger = new Logger(SeedanceService.name);
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(config: ConfigService) {
    this.apiKey =
      config.get<string>('SEEDDANCE_API_KEY') ??
      config.get<string>('ARK_API_KEY') ??
      '';
    this.baseUrl =
      config.get<string>('SEEDDANCE_BASE_URL') ??
      'https://ark.cn-beijing.volces.com/api/v3';
    this.model =
      config.get<string>('SEEDANCE_MODEL') ??
      'doubao-seedance-1-0-pro-250528';
  }

  async createVideoTask(dto: CreateVideoDto): Promise<{ taskId: string }> {
    // 将参数拼入 prompt flags（与官方 curl 示例格式一致）
    const flags: string[] = [];
    if (dto.resolution) flags.push(`--resolution ${dto.resolution}`);
    if (dto.aspectRatio) flags.push(`--ratio ${dto.aspectRatio}`);
    if (dto.duration != null) {
      const seconds =
        dto.durationUnit === 'frames' ? Math.round(dto.duration / 24) : dto.duration;
      flags.push(`--duration ${seconds}`);
    }
    const promptText = [dto.prompt.trim(), ...flags].join('  ');

    const content: unknown[] = [{ type: 'text', text: promptText }];
    if (dto.firstFrameImage) {
      content.push({
        type: 'image_url',
        image_url: { url: dto.firstFrameImage },
        role: 'first_frame',
      });
    }
    if (dto.lastFrameImage) {
      content.push({
        type: 'image_url',
        image_url: { url: dto.lastFrameImage },
        role: 'last_frame',
      });
    }

    const resp = await fetch(`${this.baseUrl}/contents/generations/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ model: this.model, content }),
    });
    if (!resp.ok) throw new Error(`SeeDance submit failed (${resp.status}): ${await resp.text()}`);
    const data = (await resp.json()) as { id: string };
    if (!data.id) throw new Error('SeeDance submit: missing task id');
    this.logger.log(`[SeeDance] task created: ${data.id}`);
    return { taskId: data.id };
  }

  async getTaskStatus(taskId: string): Promise<VideoStatusDto> {
    const resp = await fetch(`${this.baseUrl}/contents/generations/tasks/${taskId}`, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
    });
    if (!resp.ok) throw new Error(`SeeDance query failed (${resp.status})`);
    const data = (await resp.json()) as VTask;
    const videoUrl = data.content?.find((c) => c.type === 'video_url')?.video_url?.url;
    return {
      taskId: data.id,
      status: this.mapStatus(data.status),
      videoUrl,
      error: data.error?.message,
    };
  }

  /** SSE：每 4s 轮询一次，直到 completed/failed（含最后终态事件）*/
  streamTaskStatus(taskId: string): Observable<MessageEvent> {
    return interval(POLL_INTERVAL_MS).pipe(
      startWith(0),
      switchMap(() => from(this.getTaskStatus(taskId))),
      map((s) => ({ data: JSON.stringify(s) }) as MessageEvent),
      takeWhile(
        (e) => {
          const d = JSON.parse(e.data as string) as VideoStatusDto;
          return d.status !== 'completed' && d.status !== 'failed';
        },
        true,
      ),
    );
  }

  private mapStatus(raw: string): VideoStatusDto['status'] {
    if (raw === 'succeeded') return 'completed';
    if (raw === 'failed') return 'failed';
    if (raw === 'running') return 'running';
    return 'pending';
  }
}
```

### 1.5 `seeddance.controller.ts`

```typescript
import { Body, Controller, Get, Param, Post, Sse } from '@nestjs/common';
import type { Observable } from 'rxjs';
import type { MessageEvent } from '@nestjs/common';
import { SeedanceService } from './seeddance.service';
import { CreateVideoDto } from './dto/create-video.dto';
import type { VideoStatusDto } from './dto/video-status.dto';

@Controller('seeddance')
export class SeedanceController {
  constructor(private readonly seedance: SeedanceService) {}

  /** 创建视频生成任务 */
  @Post('video')
  createVideo(@Body() dto: CreateVideoDto): Promise<{ taskId: string }> {
    return this.seedance.createVideoTask(dto);
  }

  /** 查询任务状态（单次） */
  @Get('video/:taskId')
  getStatus(@Param('taskId') taskId: string): Promise<VideoStatusDto> {
    return this.seedance.getTaskStatus(taskId);
  }

  /** SSE：实时推送任务进度 */
  @Sse('video/:taskId/stream')
  streamStatus(@Param('taskId') taskId: string): Observable<MessageEvent> {
    return this.seedance.streamTaskStatus(taskId);
  }

  /** 前端初始化时拉取支持的参数枚举 */
  @Get('config')
  getConfig() {
    return {
      aspectRatios: ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'],
      resolutions: ['480p', '720p', '1080p'],
      durationUnits: ['seconds', 'frames'],
      maxCount: 4,
    };
  }
}
```

### 1.6 `seeddance.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { SeedanceService } from './seeddance.service';
import { SeedanceController } from './seeddance.controller';

@Module({
  providers: [SeedanceService],
  controllers: [SeedanceController],
})
export class SeedanceModule {}
```

### 1.7 注册到 `AppModule`

在 `backend/src/app.module.ts` 中：
1. 在文件顶部 import 列表加一行：`import { SeedanceModule } from './seeddance/seeddance.module';`
2. 在 `@Module({ imports: [...] })` 数组末尾加 `SeedanceModule`（与 `TodoModule` 并列）

> **不要**修改现有 imports 的顺序，直接追加到末尾。

### 1.8 更新 `backend/.env.example`

在文件末尾（`DESIGN_AGENT_WORKSPACE_ROOT` 注释之后）追加：

```
# ── SeedDance 视频生成（独立 HTTP 接口，/seeddance/**）──────────────────────
# Volcengine ARK API Key（必填，从 https://console.volcengine.com/ark 获取）
ARK_API_KEY=
# 可选：专用 API Key，填写后优先于 ARK_API_KEY
SEEDDANCE_API_KEY=
# API 基地址（默认 https://ark.cn-beijing.volces.com/api/v3）
SEEDDANCE_BASE_URL=
# 模型（默认 doubao-seedance-1-0-pro-250528）
SEEDDANCE_MODEL=
# 请求超时毫秒（默认 120000）
SEEDDANCE_TIMEOUT=120000
```

---

## Phase 2：前端 service 与类型

### 2.1 位置约定

- service 放在 `frontend/src/app/core/services/seeddance.service.ts`（与 `design-agent.service.ts` 同级）
- 类型定义直接写在 service 文件顶部（无需单独 `types.ts`，项目其他 service 也是此做法）

### 2.2 `frontend/src/app/core/services/seeddance.service.ts`

```typescript
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface CreateVideoParams {
  prompt: string;
  aspectRatio?: string;
  resolution?: string;
  duration?: number;
  durationUnit?: 'seconds' | 'frames';
  firstFrameImage?: string;
  lastFrameImage?: string;
}

export interface VideoStatus {
  taskId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  videoUrl?: string;
  error?: string;
}

export interface SeedanceConfig {
  aspectRatios: string[];
  resolutions: string[];
  durationUnits: string[];
  maxCount: number;
}

@Injectable({ providedIn: 'root' })
export class SeedanceService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/seeddance`;

  createVideo(params: CreateVideoParams): Observable<{ taskId: string }> {
    return this.http.post<{ taskId: string }>(`${this.base}/video`, params);
  }

  getVideoStatus(taskId: string): Observable<VideoStatus> {
    return this.http.get<VideoStatus>(`${this.base}/video/${taskId}`);
  }

  /** SSE 流：用原生 EventSource 封装为 Observable */
  streamVideoStatus(taskId: string): Observable<VideoStatus> {
    return new Observable((observer) => {
      const source = new EventSource(`${this.base}/video/${taskId}/stream`);
      source.onmessage = (event: MessageEvent) => {
        try {
          observer.next(JSON.parse(event.data) as VideoStatus);
        } catch {
          // 忽略解析失败
        }
      };
      source.onerror = () => {
        observer.error(new Error('SSE connection error'));
        source.close();
      };
      return () => source.close();
    });
  }

  getConfig(): Observable<SeedanceConfig> {
    return this.http.get<SeedanceConfig>(`${this.base}/config`);
  }
}
```

> **注意**：`environment.apiUrl` 已有定义（其他 service 如 `design-agent.service.ts` 均如此使用）。确认后直接沿用，不要新增 env 变量。

---

## Phase 3：前端页面组件

### 3.1 目录结构

```
frontend/src/app/seeddance/
└── seeddance-quick/
    └── seeddance-quick.component.ts   （单文件组件，inline template + styles）
```

> 与 `design-agent-page.component.ts` 结构一致：单文件，inline template，inline styles。

### 3.2 `seeddance-quick.component.ts` 骨架与要点

**组件声明**：
```typescript
@Component({
  selector: 'app-seeddance-quick',
  standalone: true,
  imports: [FormsModule, NgIf],  // 不引入 CommonModule，只引入实际用到的
  template: `...`,
  styles: [`...`],
})
export class SeedanceQuickComponent {
  private readonly seedance = inject(SeedanceService);
  // ...
}
```

**状态（全部用 signal）**：
```typescript
protected readonly prompt = signal('');
protected readonly aspectRatio = signal('16:9');
protected readonly resolution = signal('720p');
protected readonly duration = signal(5);
protected readonly durationUnit = signal<'seconds' | 'frames'>('seconds');
protected readonly firstFramePreview = signal<string | null>(null);
protected readonly lastFramePreview = signal<string | null>(null);
protected readonly firstFrameData = signal<string | null>(null);
protected readonly lastFrameData = signal<string | null>(null);
protected readonly submitting = signal(false);
protected readonly taskId = signal<string | null>(null);
protected readonly videoStatus = signal<VideoStatus | null>(null);
protected readonly streamError = signal<string | null>(null);

protected readonly canSubmit = computed(() =>
  this.prompt().trim().length > 0 && !this.submitting()
);
```

**提交逻辑**：
```typescript
protected submit(): void {
  if (!this.canSubmit()) return;
  this.submitting.set(true);
  this.videoStatus.set(null);
  this.streamError.set(null);

  this.seedance.createVideo({
    prompt: this.prompt(),
    aspectRatio: this.aspectRatio(),
    resolution: this.resolution(),
    duration: this.duration(),
    durationUnit: this.durationUnit(),
    firstFrameImage: this.firstFrameData() ?? undefined,
    lastFrameImage: this.lastFrameData() ?? undefined,
  }).subscribe({
    next: ({ taskId }) => {
      this.taskId.set(taskId);
      this.startStream(taskId);
    },
    error: (err: unknown) => {
      this.submitting.set(false);
      this.streamError.set((err as Error)?.message ?? '提交失败');
    },
  });
}

private startStream(taskId: string): void {
  this.seedance.streamVideoStatus(taskId).subscribe({
    next: (status) => {
      this.videoStatus.set(status);
      if (status.status === 'completed' || status.status === 'failed') {
        this.submitting.set(false);
      }
    },
    error: () => {
      this.submitting.set(false);
      this.streamError.set('进度推送连接断开，请手动刷新状态');
    },
  });
}
```

**图片上传（参照 design-agent-page.component.ts 的 handleImageUpload 写法）**：
```typescript
protected handleFirstFrame(event: Event): void {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) { this.streamError.set('图片不能超过 10MB'); return; }
  const reader = new FileReader();
  reader.onload = () => {
    this.firstFramePreview.set(reader.result as string);
    this.firstFrameData.set(reader.result as string);  // 整个 data URL 传给后端
  };
  reader.readAsDataURL(file);
  (event.target as HTMLInputElement).value = '';
}
// lastFrameImage 同理
```

**模板必须包含**：
- Prompt 多行文本输入（`<textarea>`）
- 视频比例选择（`<label>` radio group，选项：`['21:9','16:9','4:3','1:1','3:4','9:16']`）
- 分辨率选择（同上，选项：`['480p','720p','1080p']`）
- 时长输入（`<input type="number">`）+ 单位切换（seconds/frames）
- 首帧 / 尾帧图片上传（file input，accept="image/*"，含缩略图预览 + 清除按钮）
- 提交按钮（`[disabled]="!canSubmit()"`，submitting 时显示"生成中..."）
- 结果区域：
  - `@if (videoStatus())` 显示状态标签（排队中/生成中/已完成/失败）
  - `@if (videoStatus()?.status === 'completed')` 显示 `<video controls>` 标签
  - `@if (videoStatus()?.status === 'failed' || streamError())` 显示错误 + 重试按钮

**样式要求**（遵守 ui-design-system.mdc）：
- 所有颜色用 `var(--color-*)` 变量
- 间距用 `var(--space-*)` 变量
- 圆角用 `var(--radius-*)` 变量
- 整体布局：两栏（左侧参数面板 + 右侧结果区），小屏折叠为单栏
- 参照 `:host` padding 写法：`padding: var(--workbench-shell-padding)`

### 3.3 注册路由

在 `frontend/src/app/app.routes.ts` 的 `MainLayoutComponent` children 数组中，在 `design-agent` 路由之后追加：

```typescript
{
  path: 'quick',
  children: [
    {
      path: 'video',
      loadComponent: () =>
        import('./seeddance/seeddance-quick/seeddance-quick.component').then(
          (m) => m.SeedanceQuickComponent,
        ),
    },
  ],
},
```

---

## Phase 4：构建验证与收尾

### 4.1 构建验证

在 `backend/` 目录执行：
```bash
npm run build
```
确保无 TypeScript 编译错误后继续前端构建。

### 4.2 导航入口（可选）

如需在 UI 中加入入口，在 `WorkbenchPageComponent` 或侧边栏找到现有工具入口处，追加一个导向 `/quick/video` 的按钮或链接。

### 4.3 README

在 `backend/src/seeddance/README.md` 中写明：
- 所需 env 变量（`ARK_API_KEY` 或 `SEEDDANCE_API_KEY`）
- 如何移除本模块：删除 `backend/src/seeddance/` + 从 `AppModule` 移除 `SeedanceModule` import + 删除 `frontend/src/app/seeddance/` + 从 `app.routes.ts` 移除 `quick` 路由

---

## 执行注意事项

1. **不要修改** `backend/src/assistant/**`、`backend/src/gateway/**`、`backend/src/orchestrator/**`、`backend/src/action/**` 等核心链路
2. `action.module.ts` 已干净，**不要**往里加任何 seedance 相关注册（seeddance 是独立 HTTP 模块，不是 capability skill）
3. **SSE 跨域**：本地开发时前端 `localhost:4200` 调用后端 `localhost:3000`，`EventSource` 默认不带 credentials。如遇 CORS 问题，检查 `main.ts` 中的 `app.enableCors()` 配置，确保 `CORS_ORIGIN` 包含了前端地址（`.env.example` 中已有 `CORS_ORIGIN=http://localhost:4200,http://localhost:1420`，应已覆盖）
4. **`environment.apiUrl` 确认**：执行前先 `grep -r "apiUrl" frontend/src/environments/` 确认该字段存在且格式为 `http://localhost:3000`，若字段名不同则以实际为准调整 service 中的 `this.base` 赋值

---

*文档版本：2026-03-27（基于代码审查生成，可直接交 Codex 执行）*
