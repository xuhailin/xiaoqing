# VideoAgent 实现计划

> 生成日期：2026-03-27
> 基于代码实际状态（非规划文档假设）

---

## 一、可行性评估与调整说明

### 规划文档与实际代码的差距

| 规划文档假设 | 实际代码现状 | 处理方式 |
|---|---|---|
| 需要新建 SeedanceService | `SeedanceVideoProvider` 已存在（`backend/src/video/providers/`），`VideoService` 已封装完整的创建/查询/SSE | **直接复用 VideoService**，禁止重复封装 |
| VideoTask 需要新建 | `VideoTask` Prisma 模型已完整存在（schema.prisma:1126-1156） | **复用现有 VideoTask**，VideoShot 通过 `videoTaskId` 关联 |
| SSE 需要参考 chat 链路实现 | VideoModule 已有标准 SSE（`Observable<MessageEvent>` + 轮询） | **复用 VideoController SSE 模式** |
| VideoModule 需要注册 | `VideoModule` 已在 `app.module.ts:50` 注册 | **新建 VideoAgentModule**，import VideoModule |
| 前端无 video 路由 | `/video` 路由已存在，`video.service.ts` 已实现 SSE 消费 | 新增 `/studio` 路由组，**不修改现有 /video 路由** |

### 结论

整体可行。核心调整：VideoAgent 层只负责「创作资料包管理 + LLM 分镜规划 + 批量调度 VideoTask」，生成与追踪委托给已有 VideoService，避免重复实现 Seedance 调用层。

---

## 二、文件树（全量新增/修改清单）

```
backend/
├── prisma/
│   └── schema.prisma                          [修改] 新增 CreativePackage / VideoProject / VideoShot 模型
├── src/
│   ├── app.module.ts                          [修改] 注册 VideoAgentModule
│   └── video-agent/
│       ├── video-agent.module.ts              [新建]
│       ├── video-agent.controller.ts          [新建]
│       ├── video-agent.service.ts             [新建] 核心编排
│       ├── creative-package.service.ts        [新建]
│       ├── shot-planner.service.ts            [新建] LLM 分镜规划
│       ├── video-agent.types.ts               [新建]
│       ├── dto/
│       │   ├── create-creative-package.dto.ts [新建]
│       │   ├── update-creative-package.dto.ts [新建]
│       │   └── create-video-project.dto.ts    [新建]
│       ├── prompts/
│       │   └── shot-planner.prompt.ts         [新建]
│       └── seed/
│           └── default-packages.seed.ts       [新建]

frontend/
├── src/app/
│   ├── app.routes.ts                          [修改] 新增 /studio 路由
│   ├── core/services/
│   │   └── video-agent.service.ts             [新建]
│   └── studio/
│       ├── studio.routes.ts                   [新建]
│       ├── pages/
│       │   ├── studio-home/
│       │   │   └── studio-home.component.ts   [新建]
│       │   ├── package-list/
│       │   │   └── package-list.component.ts  [新建]
│       │   ├── package-editor/
│       │   │   └── package-editor.component.ts [新建]
│       │   ├── project-new/
│       │   │   └── project-new.component.ts   [新建]
│       │   ├── project-detail/
│       │   │   └── project-detail.component.ts [新建]
│       │   └── project-list/
│       │       └── project-list.component.ts  [新建]
│       └── components/
│           └── shot-card/
│               └── shot-card.component.ts     [新建]
```

---

## 三、Step 1：Prisma Schema 扩展

**文件**：`backend/prisma/schema.prisma`

在文件末尾（`VideoTask` 模型之后）追加以下内容：

```prisma
// ── 创作资料包 ─────────────────────────────────────────────
model CreativePackage {
  id          String   @id @default(uuid())
  name        String
  description String?  @db.Text
  coverImage  String?
  source      String   @default("static") // 'static' | 'user'

  // 角色资产（JSON 数组）
  // 结构：[{ name, appearancePrompt, referenceImageUrl? }]
  characters  Json     @default("[]")

  // 世界观资产（JSON 对象）
  // 结构：{ colorTone, era, atmosphere, sceneKeywords[] }
  worldStyle  Json     @default("{}")

  // 风格资产（JSON 对象）
  // 结构：{ shotStyle, aspectRatio, resolution, duration }
  stylePreset Json     @default("{}")

  projects    VideoProject[]

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([source, createdAt])
}

// ── 视频生成任务（一次完整的多分镜生成）──────────────────────
model VideoProject {
  id          String              @id @default(uuid())
  userId      String              @default("default-user")

  packageId   String
  package     CreativePackage     @relation(fields: [packageId], references: [id])

  storyBrief  String?             @db.Text
  status      VideoProjectStatus  @default(planning)
  errorMessage String?            @db.Text

  shots       VideoShot[]

  startedAt   DateTime?
  completedAt DateTime?
  failedAt    DateTime?
  createdAt   DateTime            @default(now())
  updatedAt   DateTime            @updatedAt

  @@index([userId, createdAt])
  @@index([userId, status, updatedAt])
}

// ── 单个分镜 ──────────────────────────────────────────────
model VideoShot {
  id          String          @id @default(uuid())
  projectId   String
  project     VideoProject    @relation(fields: [projectId], references: [id], onDelete: Cascade)

  // 关联到 VideoTask（复用现有生成+追踪层）
  videoTaskId String?         @unique

  shotIndex   Int
  description String          @db.Text
  cameraMovement String?
  finalPrompt String?         @db.Text
  duration    Int?
  aspectRatio String?
  resolution  String?
  status      VideoShotStatus @default(pending)
  errorMessage String?        @db.Text

  createdAt   DateTime        @default(now())
  updatedAt   DateTime        @updatedAt

  @@index([projectId, shotIndex])
}

enum VideoProjectStatus {
  planning
  generating
  done
  failed
}

enum VideoShotStatus {
  pending
  generating
  done
  failed
}
```

**执行后运行**：
```bash
cd backend && npx prisma migrate dev --name add_video_agent
```

---

## 四、Step 2：后端核心类型

**文件**：`backend/src/video-agent/video-agent.types.ts`

```typescript
import type { CreativePackage, VideoProject, VideoShot } from '@prisma/client';

export interface CharacterAsset {
  name: string;
  appearancePrompt: string;
  referenceImageUrl?: string;
}

export interface WorldStyle {
  colorTone: string;
  era: string;
  atmosphere: string;
  sceneKeywords: string[];
}

export interface StylePreset {
  shotStyle: string;
  aspectRatio: string;
  resolution: string;
  duration: number;
}

export interface CreativePackageDto {
  id: string;
  name: string;
  description?: string;
  coverImage?: string;
  source: string;
  characters: CharacterAsset[];
  worldStyle: WorldStyle;
  stylePreset: StylePreset;
  createdAt: string;
  updatedAt: string;
}

export interface VideoShotDto {
  id: string;
  shotIndex: number;
  description: string;
  cameraMovement?: string;
  finalPrompt?: string;
  duration?: number;
  aspectRatio?: string;
  resolution?: string;
  status: string;
  // 从关联的 VideoTask 聚合而来
  videoUrl?: string;
}

export interface VideoProjectDto {
  id: string;
  userId: string;
  packageId: string;
  packageName: string;
  storyBrief?: string;
  status: string;
  shots: VideoShotDto[];
  progress: number; // 0-100
  createdAt: string;
  updatedAt: string;
}

export interface PlannedShot {
  shotIndex: number;
  description: string;
  cameraMovement: string;
  duration: number;
}

// SSE 事件
export type VideoAgentEvent =
  | { type: 'planning'; message: string }
  | { type: 'shot_queued'; shotIndex: number; total: number }
  | { type: 'shot_generating'; shotIndex: number }
  | { type: 'shot_done'; shotIndex: number; videoUrl: string }
  | { type: 'shot_failed'; shotIndex: number; error: string }
  | { type: 'project_done'; projectId: string }
  | { type: 'project_failed'; error: string };
```

---

## 五、Step 3：DTO 文件

**文件**：`backend/src/video-agent/dto/create-creative-package.dto.ts`

```typescript
export class CreateCreativePackageDto {
  name!: string;
  description?: string;
  coverImage?: string;
  source?: string;
  characters?: Array<{
    name: string;
    appearancePrompt: string;
    referenceImageUrl?: string;
  }>;
  worldStyle?: {
    colorTone?: string;
    era?: string;
    atmosphere?: string;
    sceneKeywords?: string[];
  };
  stylePreset?: {
    shotStyle?: string;
    aspectRatio?: string;
    resolution?: string;
    duration?: number;
  };
}
```

**文件**：`backend/src/video-agent/dto/update-creative-package.dto.ts`

```typescript
import { CreateCreativePackageDto } from './create-creative-package.dto';

export class UpdateCreativePackageDto extends CreateCreativePackageDto {}
```

**文件**：`backend/src/video-agent/dto/create-video-project.dto.ts`

```typescript
export class CreateVideoProjectDto {
  packageId!: string;
  storyBrief?: string;
}
```

---

## 六、Step 4：分镜规划 Prompt

**文件**：`backend/src/video-agent/prompts/shot-planner.prompt.ts`

```typescript
export function buildShotPlannerPrompt(params: {
  packageName: string;
  colorTone: string;
  era: string;
  atmosphere: string;
  sceneKeywords: string[];
  characters: Array<{ name: string; appearancePrompt: string }>;
  shotStyle: string;
  aspectRatio: string;
  duration: number;
  storyBrief?: string;
}): string {
  const characterDesc = params.characters.length > 0
    ? params.characters.map((c) => `- ${c.name}：${c.appearancePrompt}`).join('\n')
    : '（无指定角色，自由发挥）';

  const storySection = params.storyBrief
    ? `\n## 故事概要\n${params.storyBrief}\n`
    : '\n（无故事概要，请基于世界观和角色自主设计场景）\n';

  return `你是一位专业的短视频分镜导演。请根据以下创作资料包，设计 3~5 个连贯的分镜脚本。

## 世界观设定
- 色调：${params.colorTone}
- 时代背景：${params.era}
- 氛围：${params.atmosphere}
- 场景关键词：${params.sceneKeywords.join('、')}

## 角色资产
${characterDesc}

## 拍摄风格
- 镜头风格：${params.shotStyle}
- 画面比例：${params.aspectRatio}
- 单镜时长：约 ${params.duration} 秒
${storySection}
## 输出要求

请严格输出 JSON 数组，不要有任何其他文字：

\`\`\`json
[
  {
    "shotIndex": 1,
    "description": "具体的画面描述（英文，适合直接作为 Seedance prompt）",
    "cameraMovement": "push in / pull back / pan left / static / hand-held",
    "duration": 5
  }
]
\`\`\`

规则：
- description 必须是英文，直接可用于 AI 视频生成
- 分镜数量 3~5 个，叙事连贯
- 每个 description 包含：主体、动作、环境、光线/氛围
- cameraMovement 从给定选项中选一个`;
}

export function buildFinalPrompt(params: {
  shotDescription: string;
  appearancePrompts: string[];
  colorTone: string;
  atmosphere: string;
  aspectRatio: string;
}): string {
  const styleTokens = [params.colorTone, params.atmosphere].filter(Boolean).join(', ');
  const characterTokens = params.appearancePrompts.join(', ');

  return [
    params.shotDescription,
    characterTokens,
    styleTokens,
    'cinematic quality, high detail',
  ]
    .filter(Boolean)
    .join(', ');
}
```

---

## 七、Step 5：默认资料包种子数据

**文件**：`backend/src/video-agent/seed/default-packages.seed.ts`

```typescript
import type { Prisma } from '@prisma/client';

export const DEFAULT_PACKAGES: Omit<Prisma.CreativePackageCreateInput, 'projects'>[] = [
  {
    id: 'pkg-cyberpunk-001',
    name: '赛博朋克都市',
    description: '霓虹灯、雨夜、高楼、2077年代感',
    source: 'static',
    characters: [
      {
        name: '都市猎人',
        appearancePrompt:
          'cyberpunk mercenary, neon-lit face, augmented eyes, dark trench coat, rain-soaked',
      },
    ] as Prisma.InputJsonValue,
    worldStyle: {
      colorTone: 'dark cyan-purple neon',
      era: '2077 dystopian future',
      atmosphere: 'rainy night, neon reflections, high-tech low-life',
      sceneKeywords: ['neon signs', 'rain', 'skyscrapers', 'holographic ads', 'crowded streets'],
    } as Prisma.InputJsonValue,
    stylePreset: {
      shotStyle: 'push in',
      aspectRatio: '16:9',
      resolution: '1080p',
      duration: 5,
    } as Prisma.InputJsonValue,
  },
  {
    id: 'pkg-xianxia-001',
    name: '古风仙侠',
    description: '竹林、云雾、古建筑、仙气飘飘',
    source: 'static',
    characters: [
      {
        name: '仙侠剑客',
        appearancePrompt:
          'ancient Chinese xianxia swordsman, white flowing robes, long black hair, jade hairpin, ethereal aura',
      },
    ] as Prisma.InputJsonValue,
    worldStyle: {
      colorTone: 'warm ink wash, misty jade green',
      era: 'ancient China, mythical era',
      atmosphere: 'ethereal, serene, mystical',
      sceneKeywords: ['bamboo forest', 'mountain mist', 'ancient pavilion', 'cherry blossoms', 'floating islands'],
    } as Prisma.InputJsonValue,
    stylePreset: {
      shotStyle: 'pull back',
      aspectRatio: '16:9',
      resolution: '1080p',
      duration: 6,
    } as Prisma.InputJsonValue,
  },
  {
    id: 'pkg-urban-daily-001',
    name: '现代都市日常',
    description: '咖啡馆、街道、阳光、现代都市氛围',
    source: 'static',
    characters: [] as Prisma.InputJsonValue,
    worldStyle: {
      colorTone: 'warm white, golden hour',
      era: 'contemporary urban',
      atmosphere: 'cozy, warm, slice-of-life',
      sceneKeywords: ['coffee shop', 'city street', 'sunlight', 'pedestrians', 'storefronts'],
    } as Prisma.InputJsonValue,
    stylePreset: {
      shotStyle: 'hand-held',
      aspectRatio: '16:9',
      resolution: '720p',
      duration: 5,
    } as Prisma.InputJsonValue,
  },
];
```

---

## 八、Step 6：CreativePackageService

**文件**：`backend/src/video-agent/creative-package.service.ts`

```typescript
import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../infra/prisma.service';
import type { CreativePackageDto } from './video-agent.types';
import type { CreateCreativePackageDto } from './dto/create-creative-package.dto';
import type { UpdateCreativePackageDto } from './dto/update-creative-package.dto';
import { DEFAULT_PACKAGES } from './seed/default-packages.seed';

@Injectable()
export class CreativePackageService implements OnModuleInit {
  private readonly logger = new Logger(CreativePackageService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await this.seedDefaultPackages();
  }

  private async seedDefaultPackages(): Promise<void> {
    for (const pkg of DEFAULT_PACKAGES) {
      await this.prisma.creativePackage.upsert({
        where: { id: pkg.id },
        update: {},
        create: pkg,
      });
    }
    this.logger.log('Default creative packages seeded');
  }

  async findAll(): Promise<CreativePackageDto[]> {
    const packages = await this.prisma.creativePackage.findMany({
      orderBy: { createdAt: 'asc' },
    });
    return packages.map(this.toDto);
  }

  async findOne(id: string): Promise<CreativePackageDto> {
    const pkg = await this.prisma.creativePackage.findUnique({ where: { id } });
    if (!pkg) throw new NotFoundException(`CreativePackage ${id} not found`);
    return this.toDto(pkg);
  }

  async create(dto: CreateCreativePackageDto): Promise<CreativePackageDto> {
    const pkg = await this.prisma.creativePackage.create({
      data: {
        name: dto.name,
        description: dto.description,
        coverImage: dto.coverImage,
        source: dto.source ?? 'user',
        characters: (dto.characters ?? []) as any,
        worldStyle: (dto.worldStyle ?? {}) as any,
        stylePreset: (dto.stylePreset ?? {}) as any,
      },
    });
    return this.toDto(pkg);
  }

  async update(id: string, dto: UpdateCreativePackageDto): Promise<CreativePackageDto> {
    await this.findOne(id);
    const pkg = await this.prisma.creativePackage.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.coverImage !== undefined && { coverImage: dto.coverImage }),
        ...(dto.characters !== undefined && { characters: dto.characters as any }),
        ...(dto.worldStyle !== undefined && { worldStyle: dto.worldStyle as any }),
        ...(dto.stylePreset !== undefined && { stylePreset: dto.stylePreset as any }),
      },
    });
    return this.toDto(pkg);
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.prisma.creativePackage.delete({ where: { id } });
  }

  private toDto(pkg: any): CreativePackageDto {
    return {
      id: pkg.id,
      name: pkg.name,
      description: pkg.description ?? undefined,
      coverImage: pkg.coverImage ?? undefined,
      source: pkg.source,
      characters: (pkg.characters as any) ?? [],
      worldStyle: (pkg.worldStyle as any) ?? {},
      stylePreset: (pkg.stylePreset as any) ?? {},
      createdAt: pkg.createdAt.toISOString(),
      updatedAt: pkg.updatedAt.toISOString(),
    };
  }
}
```

---

## 九、Step 7：ShotPlannerService（LLM 分镜规划）

**文件**：`backend/src/video-agent/shot-planner.service.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { ConfigService } from '@nestjs/config';
import type { CreativePackageDto, PlannedShot } from './video-agent.types';
import { buildShotPlannerPrompt } from './prompts/shot-planner.prompt';

// 降级模板：LLM 失败时使用
const FALLBACK_SHOTS: Omit<PlannedShot, 'shotIndex'>[] = [
  { description: 'Wide establishing shot of the scene environment', cameraMovement: 'static', duration: 5 },
  { description: 'Medium shot focusing on the main subject with ambient atmosphere', cameraMovement: 'push in', duration: 5 },
  { description: 'Close-up detail shot with cinematic depth of field', cameraMovement: 'static', duration: 4 },
];

@Injectable()
export class ShotPlannerService {
  private readonly logger = new Logger(ShotPlannerService.name);
  private readonly client: OpenAI;

  constructor(private readonly config: ConfigService) {
    this.client = new OpenAI({
      apiKey: config.get('LLM_API_KEY') ?? config.get('OPENAI_API_KEY') ?? '',
      baseURL: config.get('LLM_BASE_URL') ?? undefined,
    });
  }

  async planShots(pkg: CreativePackageDto, storyBrief?: string): Promise<PlannedShot[]> {
    const worldStyle = pkg.worldStyle as any;
    const stylePreset = pkg.stylePreset as any;
    const characters = pkg.characters as any[];

    const prompt = buildShotPlannerPrompt({
      packageName: pkg.name,
      colorTone: worldStyle.colorTone ?? '',
      era: worldStyle.era ?? '',
      atmosphere: worldStyle.atmosphere ?? '',
      sceneKeywords: worldStyle.sceneKeywords ?? [],
      characters: characters.map((c: any) => ({
        name: c.name,
        appearancePrompt: c.appearancePrompt,
      })),
      shotStyle: stylePreset.shotStyle ?? 'static',
      aspectRatio: stylePreset.aspectRatio ?? '16:9',
      duration: stylePreset.duration ?? 5,
      storyBrief,
    });

    try {
      const response = await this.client.chat.completions.create({
        model: this.config.get('LLM_MODEL') ?? 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: '你是专业的短视频分镜导演，只输出 JSON，不包含其他内容。',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
        max_tokens: 2000,
      });

      const content = response.choices[0]?.message?.content ?? '';
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error('No JSON array found in LLM response');

      const parsed: PlannedShot[] = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error('Empty shot list from LLM');
      }

      return parsed.slice(0, 5).map((shot, i) => ({
        ...shot,
        shotIndex: i + 1,
      }));
    } catch (err) {
      this.logger.warn(`Shot planning failed, using fallback: ${(err as Error).message}`);
      return FALLBACK_SHOTS.map((s, i) => ({ ...s, shotIndex: i + 1 }));
    }
  }
}
```

---

## 十、Step 8：VideoAgentService（核心编排）

**文件**：`backend/src/video-agent/video-agent.service.ts`

```typescript
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Subject, Observable } from 'rxjs';
import type { MessageEvent } from '@nestjs/common';
import { PrismaService } from '../infra/prisma.service';
import { VideoService } from '../video/video.service';
import { CreativePackageService } from './creative-package.service';
import { ShotPlannerService } from './shot-planner.service';
import { buildFinalPrompt } from './prompts/shot-planner.prompt';
import type { CreateVideoProjectDto } from './dto/create-video-project.dto';
import type { VideoProjectDto, VideoShotDto, VideoAgentEvent } from './video-agent.types';

@Injectable()
export class VideoAgentService {
  private readonly logger = new Logger(VideoAgentService.name);
  // projectId → Subject 用于 SSE 推送
  private readonly streams = new Map<string, Subject<VideoAgentEvent>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly videoService: VideoService,
    private readonly packageService: CreativePackageService,
    private readonly shotPlanner: ShotPlannerService,
  ) {}

  async createAndExecuteProject(
    dto: CreateVideoProjectDto,
    userId: string,
  ): Promise<VideoProjectDto> {
    const pkg = await this.packageService.findOne(dto.packageId);

    const project = await this.prisma.videoProject.create({
      data: {
        userId,
        packageId: dto.packageId,
        storyBrief: dto.storyBrief,
        status: 'planning',
      },
      include: { shots: true },
    });

    // 异步执行，不阻塞响应
    void this.executeProject(project.id, pkg, dto.storyBrief, userId).catch((err) => {
      this.logger.error(`Project ${project.id} failed: ${(err as Error).message}`);
    });

    return this.toProjectDto(project, pkg.name);
  }

  private async executeProject(
    projectId: string,
    pkg: any,
    storyBrief: string | undefined,
    userId: string,
  ): Promise<void> {
    const subject = new Subject<VideoAgentEvent>();
    this.streams.set(projectId, subject);

    try {
      // Step 1: 分镜规划
      subject.next({ type: 'planning', message: '正在规划分镜...' });
      const plannedShots = await this.shotPlanner.planShots(pkg, storyBrief);

      const stylePreset = pkg.stylePreset as any;
      const worldStyle = pkg.worldStyle as any;
      const characters = pkg.characters as any[];

      // Step 2: 创建 VideoShot 记录 + 合成 finalPrompt
      const shots = await Promise.all(
        plannedShots.map((ps) => {
          const finalPrompt = buildFinalPrompt({
            shotDescription: ps.description,
            appearancePrompts: characters.map((c: any) => c.appearancePrompt).filter(Boolean),
            colorTone: worldStyle.colorTone ?? '',
            atmosphere: worldStyle.atmosphere ?? '',
            aspectRatio: stylePreset.aspectRatio ?? '16:9',
          });

          return this.prisma.videoShot.create({
            data: {
              projectId,
              shotIndex: ps.shotIndex,
              description: ps.description,
              cameraMovement: ps.cameraMovement,
              finalPrompt,
              duration: ps.duration ?? stylePreset.duration ?? 5,
              aspectRatio: stylePreset.aspectRatio ?? '16:9',
              resolution: stylePreset.resolution ?? '720p',
              status: 'pending',
            },
          });
        }),
      );

      await this.prisma.videoProject.update({
        where: { id: projectId },
        data: { status: 'generating' },
      });

      subject.next({ type: 'planning', message: `已规划 ${shots.length} 个分镜，开始生成...` });

      // Step 3: 并行提交 VideoTask（复用 VideoService）
      await Promise.all(
        shots.map(async (shot, idx) => {
          subject.next({ type: 'shot_queued', shotIndex: shot.shotIndex, total: shots.length });

          try {
            const videoTask = await this.videoService.createTask(
              {
                prompt: shot.finalPrompt!,
                aspectRatio: shot.aspectRatio ?? '16:9',
                resolution: shot.resolution ?? '720p',
                duration: shot.duration ?? 5,
                durationUnit: 'seconds',
              },
              userId,
            );

            await this.prisma.videoShot.update({
              where: { id: shot.id },
              data: { videoTaskId: videoTask.id, status: 'generating' },
            });

            subject.next({ type: 'shot_generating', shotIndex: shot.shotIndex });

            // Step 4: 轮询该 shot 直到完成
            await this.waitForVideoTask(videoTask.id, userId, shot.shotIndex, projectId, subject);
          } catch (err) {
            const message = (err as Error).message;
            await this.prisma.videoShot.update({
              where: { id: shot.id },
              data: { status: 'failed', errorMessage: message },
            });
            subject.next({ type: 'shot_failed', shotIndex: shot.shotIndex, error: message });
          }
        }),
      );

      // Step 5: 最终状态
      const finalShots = await this.prisma.videoShot.findMany({ where: { projectId } });
      const allDone = finalShots.every((s) => s.status === 'done');

      const finalStatus = allDone ? 'done' : 'failed';
      await this.prisma.videoProject.update({
        where: { id: projectId },
        data: {
          status: finalStatus,
          completedAt: allDone ? new Date() : undefined,
          failedAt: !allDone ? new Date() : undefined,
        },
      });

      if (allDone) {
        subject.next({ type: 'project_done', projectId });
      } else {
        subject.next({ type: 'project_failed', error: '部分分镜生成失败' });
      }
    } catch (err) {
      const message = (err as Error).message;
      await this.prisma.videoProject.update({
        where: { id: projectId },
        data: { status: 'failed', errorMessage: message, failedAt: new Date() },
      });
      subject.next({ type: 'project_failed', error: message });
    } finally {
      subject.complete();
      this.streams.delete(projectId);
    }
  }

  private async waitForVideoTask(
    taskId: string,
    userId: string,
    shotIndex: number,
    projectId: string,
    subject: Subject<VideoAgentEvent>,
  ): Promise<void> {
    const POLL_MS = 5_000;
    const MAX_WAIT_MS = 10 * 60 * 1000; // 10 分钟超时
    const start = Date.now();

    while (Date.now() - start < MAX_WAIT_MS) {
      await new Promise((r) => setTimeout(r, POLL_MS));
      const task = await this.videoService.getTask(taskId, userId);

      if (task.status === 'completed') {
        const videoUrl = task.storedVideoPath
          ? `/assets/video-results/${taskId}.mp4`
          : task.providerVideoUrl;

        await this.prisma.videoShot.updateMany({
          where: { videoTaskId: taskId },
          data: { status: 'done' },
        });

        subject.next({
          type: 'shot_done',
          shotIndex,
          videoUrl: videoUrl ?? '',
        });
        return;
      }

      if (task.status === 'failed' || task.status === 'cancelled') {
        throw new Error(`VideoTask ${taskId} ended with status ${task.status}`);
      }
    }

    throw new Error(`VideoTask ${taskId} timed out after 10 minutes`);
  }

  streamProject(projectId: string): Observable<MessageEvent> {
    const subject = this.streams.get(projectId);

    if (!subject) {
      // 项目已完成或不存在，返回空流
      return new Observable<MessageEvent>((observer) => {
        observer.complete();
      });
    }

    return new Observable<MessageEvent>((observer) => {
      const sub = subject.subscribe({
        next: (event) => observer.next({ data: JSON.stringify(event) }),
        error: (err) => observer.error(err),
        complete: () => observer.complete(),
      });
      return () => sub.unsubscribe();
    });
  }

  async getProject(projectId: string, userId: string): Promise<VideoProjectDto> {
    const project = await this.prisma.videoProject.findFirst({
      where: { id: projectId, userId },
      include: { shots: { orderBy: { shotIndex: 'asc' } }, package: true },
    });
    if (!project) throw new NotFoundException(`VideoProject ${projectId} not found`);
    return this.toProjectDto(project, project.package.name);
  }

  async listProjects(userId: string): Promise<VideoProjectDto[]> {
    const projects = await this.prisma.videoProject.findMany({
      where: { userId },
      include: { shots: true, package: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return projects.map((p) => this.toProjectDto(p, p.package.name));
  }

  private toProjectDto(project: any, packageName: string): VideoProjectDto {
    const shots: VideoShotDto[] = (project.shots ?? []).map((s: any) => ({
      id: s.id,
      shotIndex: s.shotIndex,
      description: s.description,
      cameraMovement: s.cameraMovement ?? undefined,
      finalPrompt: s.finalPrompt ?? undefined,
      duration: s.duration ?? undefined,
      aspectRatio: s.aspectRatio ?? undefined,
      resolution: s.resolution ?? undefined,
      status: s.status,
    }));

    const doneShotCount = shots.filter((s) => s.status === 'done').length;
    const progress = shots.length > 0 ? Math.round((doneShotCount / shots.length) * 100) : 0;

    return {
      id: project.id,
      userId: project.userId,
      packageId: project.packageId,
      packageName,
      storyBrief: project.storyBrief ?? undefined,
      status: project.status,
      shots,
      progress,
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
    };
  }
}
```

**注意**：`VideoAgentService` 调用了 `this.videoService.getTask(taskId, userId)` 和 `this.videoService.createTask(...)` —— 需要确认 `VideoService` 的 `getTask` 方法签名是 `getTask(id, userId): Promise<VideoTaskDto>`。如果不符，根据实际签名调整。

---

## 十一、Step 9：VideoAgentController

**文件**：`backend/src/video-agent/video-agent.controller.ts`

```typescript
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Sse,
} from '@nestjs/common';
import type { Observable } from 'rxjs';
import type { MessageEvent } from '@nestjs/common';
import { VideoAgentService } from './video-agent.service';
import { CreativePackageService } from './creative-package.service';
import type { CreateCreativePackageDto } from './dto/create-creative-package.dto';
import type { UpdateCreativePackageDto } from './dto/update-creative-package.dto';
import type { CreateVideoProjectDto } from './dto/create-video-project.dto';
import { UserId } from '../infra/user-id.decorator';

@Controller('video-agent')
export class VideoAgentController {
  constructor(
    private readonly videoAgentService: VideoAgentService,
    private readonly packageService: CreativePackageService,
  ) {}

  // ── 创作资料包 ──────────────────────────────────

  @Get('packages')
  listPackages() {
    return this.packageService.findAll();
  }

  @Get('packages/:id')
  getPackage(@Param('id') id: string) {
    return this.packageService.findOne(id);
  }

  @Post('packages')
  createPackage(@Body() dto: CreateCreativePackageDto) {
    return this.packageService.create(dto);
  }

  @Put('packages/:id')
  updatePackage(@Param('id') id: string, @Body() dto: UpdateCreativePackageDto) {
    return this.packageService.update(id, dto);
  }

  @Delete('packages/:id')
  deletePackage(@Param('id') id: string) {
    return this.packageService.remove(id);
  }

  // ── 视频项目 ────────────────────────────────────

  @Post('projects')
  createProject(
    @Body() dto: CreateVideoProjectDto,
    @UserId() userId: string,
  ) {
    return this.videoAgentService.createAndExecuteProject(dto, userId);
  }

  @Get('projects')
  listProjects(@UserId() userId: string) {
    return this.videoAgentService.listProjects(userId);
  }

  @Get('projects/:id')
  getProject(@Param('id') id: string, @UserId() userId: string) {
    return this.videoAgentService.getProject(id, userId);
  }

  @Sse('projects/:id/stream')
  streamProject(@Param('id') id: string): Observable<MessageEvent> {
    return this.videoAgentService.streamProject(id);
  }
}
```

**注意**：`@UserId()` 是项目中已有的自定义装饰器（位于 `backend/src/infra/user-id.decorator.ts`）。如果路径不对，根据实际路径修改 import。

---

## 十二、Step 10：VideoAgentModule

**文件**：`backend/src/video-agent/video-agent.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { VideoAgentController } from './video-agent.controller';
import { VideoAgentService } from './video-agent.service';
import { CreativePackageService } from './creative-package.service';
import { ShotPlannerService } from './shot-planner.service';
import { VideoModule } from '../video/video.module';

@Module({
  imports: [VideoModule],
  controllers: [VideoAgentController],
  providers: [VideoAgentService, CreativePackageService, ShotPlannerService],
})
export class VideoAgentModule {}
```

---

## 十三、Step 11：修改 AppModule

**文件**：`backend/src/app.module.ts`

在 `VideoModule` import 下方添加：

```typescript
import { VideoAgentModule } from './video-agent/video-agent.module';
```

并在 `imports` 数组中加入 `VideoAgentModule`。

---

## 十四、Step 12：VideoModule 导出 VideoService

**文件**：`backend/src/video/video.module.ts`

确认 `VideoService` 在 `exports` 数组中。如果没有，添加：

```typescript
@Module({
  providers: [VideoService, SeedanceVideoProvider],
  controllers: [VideoController],
  exports: [VideoService],  // ← 确保这行存在
})
export class VideoModule {}
```

---

## 十五、Step 13：前端 VideoAgentService

**文件**：`frontend/src/app/core/services/video-agent.service.ts`

```typescript
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject } from 'rxjs';
import type {
  CreativePackageDto,
  VideoProjectDto,
  VideoAgentEvent,
} from '../models/video-agent.models';

export { CreativePackageDto, VideoProjectDto, VideoAgentEvent };

@Injectable({ providedIn: 'root' })
export class VideoAgentService {
  private readonly base = '/api/video-agent';

  constructor(private readonly http: HttpClient) {}

  // ── 创作资料包 ──────────────────────────────────

  listPackages(): Observable<CreativePackageDto[]> {
    return this.http.get<CreativePackageDto[]>(`${this.base}/packages`);
  }

  getPackage(id: string): Observable<CreativePackageDto> {
    return this.http.get<CreativePackageDto>(`${this.base}/packages/${id}`);
  }

  createPackage(dto: Partial<CreativePackageDto>): Observable<CreativePackageDto> {
    return this.http.post<CreativePackageDto>(`${this.base}/packages`, dto);
  }

  updatePackage(id: string, dto: Partial<CreativePackageDto>): Observable<CreativePackageDto> {
    return this.http.put<CreativePackageDto>(`${this.base}/packages/${id}`, dto);
  }

  deletePackage(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/packages/${id}`);
  }

  // ── 视频项目 ────────────────────────────────────

  createProject(packageId: string, storyBrief?: string): Observable<VideoProjectDto> {
    return this.http.post<VideoProjectDto>(`${this.base}/projects`, { packageId, storyBrief });
  }

  getProject(id: string): Observable<VideoProjectDto> {
    return this.http.get<VideoProjectDto>(`${this.base}/projects/${id}`);
  }

  listProjects(): Observable<VideoProjectDto[]> {
    return this.http.get<VideoProjectDto[]>(`${this.base}/projects`);
  }

  streamProject(projectId: string): Observable<VideoAgentEvent> {
    const subject = new Subject<VideoAgentEvent>();

    const es = new EventSource(`${this.base}/projects/${projectId}/stream`);

    es.onmessage = (e: MessageEvent) => {
      try {
        subject.next(JSON.parse(e.data as string) as VideoAgentEvent);
      } catch {
        // ignore parse errors
      }
    };

    es.onerror = () => {
      es.close();
      subject.complete();
    };

    return subject.asObservable();
  }
}
```

还需新建对应的 models 文件：

**文件**：`frontend/src/app/core/models/video-agent.models.ts`

```typescript
export interface CharacterAsset {
  name: string;
  appearancePrompt: string;
  referenceImageUrl?: string;
}

export interface WorldStyle {
  colorTone: string;
  era: string;
  atmosphere: string;
  sceneKeywords: string[];
}

export interface StylePreset {
  shotStyle: string;
  aspectRatio: string;
  resolution: string;
  duration: number;
}

export interface CreativePackageDto {
  id: string;
  name: string;
  description?: string;
  coverImage?: string;
  source: string;
  characters: CharacterAsset[];
  worldStyle: WorldStyle;
  stylePreset: StylePreset;
  createdAt: string;
  updatedAt: string;
}

export interface VideoShotDto {
  id: string;
  shotIndex: number;
  description: string;
  cameraMovement?: string;
  finalPrompt?: string;
  duration?: number;
  aspectRatio?: string;
  resolution?: string;
  status: 'pending' | 'generating' | 'done' | 'failed';
  videoUrl?: string;
}

export interface VideoProjectDto {
  id: string;
  userId: string;
  packageId: string;
  packageName: string;
  storyBrief?: string;
  status: 'planning' | 'generating' | 'done' | 'failed';
  shots: VideoShotDto[];
  progress: number;
  createdAt: string;
  updatedAt: string;
}

export type VideoAgentEvent =
  | { type: 'planning'; message: string }
  | { type: 'shot_queued'; shotIndex: number; total: number }
  | { type: 'shot_generating'; shotIndex: number }
  | { type: 'shot_done'; shotIndex: number; videoUrl: string }
  | { type: 'shot_failed'; shotIndex: number; error: string }
  | { type: 'project_done'; projectId: string }
  | { type: 'project_failed'; error: string };
```

---

## 十六、Step 14：前端 Studio 路由

**文件**：`frontend/src/app/studio/studio.routes.ts`

```typescript
import { Routes } from '@angular/router';

export const STUDIO_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/studio-home/studio-home.component').then((m) => m.StudioHomeComponent),
  },
  {
    path: 'packages',
    loadComponent: () =>
      import('./pages/package-list/package-list.component').then((m) => m.PackageListComponent),
  },
  {
    path: 'packages/new',
    loadComponent: () =>
      import('./pages/package-editor/package-editor.component').then((m) => m.PackageEditorComponent),
  },
  {
    path: 'packages/:id/edit',
    loadComponent: () =>
      import('./pages/package-editor/package-editor.component').then((m) => m.PackageEditorComponent),
  },
  {
    path: 'projects/new',
    loadComponent: () =>
      import('./pages/project-new/project-new.component').then((m) => m.ProjectNewComponent),
  },
  {
    path: 'projects',
    loadComponent: () =>
      import('./pages/project-list/project-list.component').then((m) => m.ProjectListComponent),
  },
  {
    path: 'projects/:id',
    loadComponent: () =>
      import('./pages/project-detail/project-detail.component').then((m) => m.ProjectDetailComponent),
  },
];
```

**修改 `frontend/src/app/app.routes.ts`**，在现有路由 children 数组中添加（在 `video` 路由之后）：

```typescript
{
  path: 'studio',
  loadChildren: () =>
    import('./studio/studio.routes').then((m) => m.STUDIO_ROUTES),
},
```

---

## 十七、Step 15：前端核心页面组件

### StudioHomeComponent

**文件**：`frontend/src/app/studio/pages/studio-home/studio-home.component.ts`

```typescript
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-studio-home',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="studio-home">
      <div class="studio-home__header">
        <h1 class="studio-home__title">创作工作台</h1>
        <p class="studio-home__subtitle">管理创作资料包，发起 AI 视频生成任务</p>
      </div>

      <div class="studio-home__cards">
        <a routerLink="packages" class="studio-card">
          <div class="studio-card__icon">📦</div>
          <div class="studio-card__content">
            <h3 class="studio-card__title">创作资料包</h3>
            <p class="studio-card__desc">管理角色、世界观与风格偏好</p>
          </div>
        </a>

        <a routerLink="projects/new" class="studio-card studio-card--primary">
          <div class="studio-card__icon">🎬</div>
          <div class="studio-card__content">
            <h3 class="studio-card__title">发起生成</h3>
            <p class="studio-card__desc">选择资料包，开始 AI 视频生成</p>
          </div>
        </a>

        <a routerLink="projects" class="studio-card">
          <div class="studio-card__icon">📋</div>
          <div class="studio-card__content">
            <h3 class="studio-card__title">历史任务</h3>
            <p class="studio-card__desc">查看已生成的视频项目</p>
          </div>
        </a>
      </div>
    </div>
  `,
  styles: [`
    .studio-home {
      padding: 24px;
      max-width: 800px;
      margin: 0 auto;
    }
    .studio-home__header {
      margin-bottom: 32px;
    }
    .studio-home__title {
      font-size: 24px;
      font-weight: 600;
      color: var(--text-primary);
      margin: 0 0 8px;
    }
    .studio-home__subtitle {
      color: var(--text-secondary);
      margin: 0;
    }
    .studio-home__cards {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: 16px;
    }
    .studio-card {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 20px;
      border-radius: 16px;
      background: var(--surface-card, #fff);
      border: 1px solid var(--border-subtle, #e8e4f8);
      text-decoration: none;
      transition: box-shadow 0.2s, transform 0.2s;
      cursor: pointer;
    }
    .studio-card:hover {
      box-shadow: 0 4px 16px rgba(123, 111, 232, 0.12);
      transform: translateY(-2px);
    }
    .studio-card--primary {
      background: linear-gradient(135deg, #7B6FE8 0%, #a89ff5 100%);
      border-color: transparent;
    }
    .studio-card--primary .studio-card__title,
    .studio-card--primary .studio-card__desc {
      color: #fff;
    }
    .studio-card__icon {
      font-size: 28px;
    }
    .studio-card__title {
      font-size: 15px;
      font-weight: 600;
      color: var(--text-primary);
      margin: 0 0 4px;
    }
    .studio-card__desc {
      font-size: 13px;
      color: var(--text-secondary);
      margin: 0;
    }
  `],
})
export class StudioHomeComponent {}
```

### ProjectNewComponent

**文件**：`frontend/src/app/studio/pages/project-new/project-new.component.ts`

```typescript
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { VideoAgentService } from '../../../core/services/video-agent.service';
import type { CreativePackageDto } from '../../../core/models/video-agent.models';

@Component({
  selector: 'app-project-new',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="project-new">
      <div class="project-new__header">
        <h2 class="project-new__title">发起视频生成</h2>
      </div>

      <div class="project-new__section">
        <label class="project-new__label">选择创作资料包</label>
        <div class="package-grid">
          @for (pkg of packages; track pkg.id) {
            <div
              class="package-card"
              [class.package-card--selected]="selectedPackageId === pkg.id"
              (click)="selectedPackageId = pkg.id"
            >
              <div class="package-card__name">{{ pkg.name }}</div>
              <div class="package-card__desc">{{ pkg.description }}</div>
            </div>
          }
        </div>
      </div>

      <div class="project-new__section">
        <label class="project-new__label">
          故事概要
          <span class="project-new__optional">（可选）</span>
        </label>
        <textarea
          class="project-new__textarea"
          [(ngModel)]="storyBrief"
          rows="4"
          placeholder="留空则根据资料包自动生成场景..."
        ></textarea>
      </div>

      <div class="project-new__actions">
        <button
          class="btn-primary"
          [disabled]="!selectedPackageId || isSubmitting"
          (click)="submit()"
        >
          {{ isSubmitting ? '启动中...' : '开始生成' }}
        </button>
      </div>
    </div>
  `,
  styles: [`
    .project-new {
      padding: 24px;
      max-width: 700px;
      margin: 0 auto;
    }
    .project-new__header { margin-bottom: 24px; }
    .project-new__title {
      font-size: 20px;
      font-weight: 600;
      color: var(--text-primary);
      margin: 0;
    }
    .project-new__section { margin-bottom: 24px; }
    .project-new__label {
      display: block;
      font-weight: 500;
      color: var(--text-primary);
      margin-bottom: 10px;
    }
    .project-new__optional {
      font-weight: 400;
      color: var(--text-secondary);
      font-size: 13px;
    }
    .package-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 12px;
    }
    .package-card {
      padding: 16px;
      border-radius: 12px;
      border: 2px solid var(--border-subtle, #e8e4f8);
      cursor: pointer;
      transition: border-color 0.15s;
    }
    .package-card:hover { border-color: var(--color-primary, #7B6FE8); }
    .package-card--selected {
      border-color: var(--color-primary, #7B6FE8);
      background: rgba(123, 111, 232, 0.06);
    }
    .package-card__name {
      font-weight: 600;
      font-size: 14px;
      color: var(--text-primary);
      margin-bottom: 4px;
    }
    .package-card__desc {
      font-size: 12px;
      color: var(--text-secondary);
    }
    .project-new__textarea {
      width: 100%;
      border: 1px solid var(--border-subtle, #e8e4f8);
      border-radius: 12px;
      padding: 12px;
      font-size: 14px;
      resize: vertical;
      box-sizing: border-box;
      color: var(--text-primary);
      background: var(--surface-input, #fafafa);
    }
    .project-new__actions { display: flex; justify-content: flex-end; }
    .btn-primary {
      padding: 10px 28px;
      border-radius: 24px;
      background: var(--color-primary, #7B6FE8);
      color: #fff;
      font-weight: 600;
      font-size: 14px;
      border: none;
      cursor: pointer;
      transition: opacity 0.15s;
    }
    .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
  `],
})
export class ProjectNewComponent implements OnInit {
  packages: CreativePackageDto[] = [];
  selectedPackageId = '';
  storyBrief = '';
  isSubmitting = false;

  constructor(
    private readonly videoAgent: VideoAgentService,
    private readonly router: Router,
  ) {}

  ngOnInit(): void {
    this.videoAgent.listPackages().subscribe((pkgs) => {
      this.packages = pkgs;
      if (pkgs.length > 0) this.selectedPackageId = pkgs[0].id;
    });
  }

  submit(): void {
    if (!this.selectedPackageId || this.isSubmitting) return;
    this.isSubmitting = true;
    this.videoAgent
      .createProject(this.selectedPackageId, this.storyBrief || undefined)
      .subscribe({
        next: (project) => {
          void this.router.navigate(['/studio/projects', project.id]);
        },
        error: () => {
          this.isSubmitting = false;
        },
      });
  }
}
```

### ProjectDetailComponent

**文件**：`frontend/src/app/studio/pages/project-detail/project-detail.component.ts`

```typescript
import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { VideoAgentService } from '../../../core/services/video-agent.service';
import type { VideoProjectDto, VideoShotDto, VideoAgentEvent } from '../../../core/models/video-agent.models';

@Component({
  selector: 'app-project-detail',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="project-detail" *ngIf="project">
      <div class="project-detail__header">
        <h2 class="project-detail__title">{{ project.packageName }}</h2>
        <span class="status-badge" [attr.data-status]="project.status">
          {{ statusLabel[project.status] ?? project.status }}
        </span>
      </div>

      <!-- 进度条 -->
      <div class="progress-bar-wrap">
        <div class="progress-bar" [style.width.%]="project.progress"></div>
      </div>
      <div class="progress-label">{{ project.progress }}% 完成</div>

      <!-- 分镜 + 预览 -->
      <div class="project-detail__body">
        <div class="shot-list">
          @for (shot of project.shots; track shot.id) {
            <div class="shot-item" [attr.data-status]="shot.status">
              <div class="shot-item__index">{{ shot.shotIndex }}</div>
              <div class="shot-item__content">
                <div class="shot-item__desc">{{ shot.description }}</div>
                <div class="shot-item__status">{{ shotStatusLabel[shot.status] ?? shot.status }}</div>
              </div>
            </div>
          }
        </div>

        <div class="video-preview-area">
          @for (shot of doneShotsWithVideo; track shot.id) {
            <div class="video-card">
              <div class="video-card__label">分镜 {{ shot.shotIndex }}</div>
              <video
                *ngIf="shot.videoUrl"
                [src]="shot.videoUrl"
                controls
                class="video-card__player"
              ></video>
            </div>
          }
          <div *ngIf="doneShotsWithVideo.length === 0" class="video-empty">
            生成完成后视频将在此显示
          </div>
        </div>
      </div>

      <!-- 完成操作 -->
      <div class="project-detail__footer" *ngIf="project.status === 'done'">
        <button class="btn-secondary">下载全部</button>
        <button class="btn-secondary btn-secondary--disabled" disabled>查看合集（即将推出）</button>
      </div>
    </div>

    <div *ngIf="!project" class="loading">加载中...</div>
  `,
  styles: [`
    .project-detail { padding: 24px; max-width: 1100px; margin: 0 auto; }
    .project-detail__header {
      display: flex; align-items: center; gap: 12px; margin-bottom: 16px;
    }
    .project-detail__title { font-size: 20px; font-weight: 600; margin: 0; }
    .status-badge {
      padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600;
    }
    .status-badge[data-status="planning"] { background: #f0eeff; color: #7B6FE8; }
    .status-badge[data-status="generating"] { background: #fff3e0; color: #f57c00; }
    .status-badge[data-status="done"] { background: #e8f5e9; color: #388e3c; }
    .status-badge[data-status="failed"] { background: #ffebee; color: #c62828; }
    .progress-bar-wrap {
      height: 6px; border-radius: 3px;
      background: var(--border-subtle, #e8e4f8); margin-bottom: 6px;
    }
    .progress-bar {
      height: 100%; border-radius: 3px;
      background: var(--color-primary, #7B6FE8);
      transition: width 0.4s ease;
    }
    .progress-label { font-size: 12px; color: var(--text-secondary); margin-bottom: 24px; }
    .project-detail__body {
      display: grid; grid-template-columns: 280px 1fr; gap: 20px;
    }
    .shot-list { display: flex; flex-direction: column; gap: 10px; }
    .shot-item {
      display: flex; align-items: flex-start; gap: 10px;
      padding: 12px; border-radius: 12px;
      border: 1px solid var(--border-subtle, #e8e4f8);
      background: var(--surface-card, #fff);
    }
    .shot-item__index {
      width: 24px; height: 24px; border-radius: 50%;
      background: var(--color-primary, #7B6FE8); color: #fff;
      font-size: 12px; font-weight: 600;
      display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    }
    .shot-item__desc { font-size: 13px; color: var(--text-primary); margin-bottom: 4px; }
    .shot-item__status { font-size: 11px; color: var(--text-secondary); }
    .shot-item[data-status="done"] { border-color: #a5d6a7; }
    .shot-item[data-status="generating"] { border-color: #ffcc80; }
    .shot-item[data-status="failed"] { border-color: #ef9a9a; }
    .video-preview-area {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px;
    }
    .video-card {
      border-radius: 12px; overflow: hidden;
      border: 1px solid var(--border-subtle, #e8e4f8);
    }
    .video-card__label {
      padding: 8px 12px; font-size: 12px; font-weight: 500;
      background: var(--surface-card, #fff); color: var(--text-secondary);
    }
    .video-card__player { width: 100%; display: block; }
    .video-empty {
      grid-column: 1 / -1; text-align: center;
      color: var(--text-secondary); padding: 40px 0;
    }
    .project-detail__footer {
      margin-top: 24px; display: flex; gap: 12px; justify-content: flex-end;
    }
    .btn-secondary {
      padding: 8px 20px; border-radius: 20px;
      border: 1px solid var(--color-primary, #7B6FE8);
      color: var(--color-primary, #7B6FE8);
      background: transparent; font-size: 13px; cursor: pointer;
    }
    .btn-secondary--disabled { opacity: 0.4; cursor: not-allowed; }
    .loading { text-align: center; padding: 60px; color: var(--text-secondary); }
  `],
})
export class ProjectDetailComponent implements OnInit, OnDestroy {
  project: VideoProjectDto | null = null;
  private sseSubscription?: Subscription;

  readonly statusLabel: Record<string, string> = {
    planning: '规划中',
    generating: '生成中',
    done: '已完成',
    failed: '失败',
  };

  readonly shotStatusLabel: Record<string, string> = {
    pending: '等待中',
    generating: '生成中',
    done: '完成',
    failed: '失败',
  };

  get doneShotsWithVideo(): VideoShotDto[] {
    return (this.project?.shots ?? []).filter((s) => s.status === 'done' && s.videoUrl);
  }

  constructor(
    private readonly route: ActivatedRoute,
    private readonly videoAgent: VideoAgentService,
  ) {}

  ngOnInit(): void {
    const projectId = this.route.snapshot.paramMap.get('id')!;
    this.videoAgent.getProject(projectId).subscribe((p) => {
      this.project = p;
    });

    this.sseSubscription = this.videoAgent
      .streamProject(projectId)
      .subscribe((event) => this.handleEvent(event));
  }

  ngOnDestroy(): void {
    this.sseSubscription?.unsubscribe();
  }

  private handleEvent(event: VideoAgentEvent): void {
    if (!this.project) return;

    switch (event.type) {
      case 'shot_done': {
        const shot = this.project.shots.find((s) => s.shotIndex === event.shotIndex);
        if (shot) {
          shot.status = 'done';
          shot.videoUrl = event.videoUrl;
        }
        this.recalculateProgress();
        break;
      }
      case 'shot_generating': {
        const shot = this.project.shots.find((s) => s.shotIndex === event.shotIndex);
        if (shot) shot.status = 'generating';
        break;
      }
      case 'shot_failed': {
        const shot = this.project.shots.find((s) => s.shotIndex === event.shotIndex);
        if (shot) shot.status = 'failed';
        break;
      }
      case 'project_done':
        this.project.status = 'done';
        this.project.progress = 100;
        break;
      case 'project_failed':
        this.project.status = 'failed';
        break;
    }
  }

  private recalculateProgress(): void {
    if (!this.project) return;
    const total = this.project.shots.length;
    const done = this.project.shots.filter((s) => s.status === 'done').length;
    this.project.progress = total > 0 ? Math.round((done / total) * 100) : 0;
  }
}
```

其余页面（PackageListComponent、PackageEditorComponent、ProjectListComponent）为标准 CRUD 展示页，结构简单，按类似模式实现即可，此处省略完整代码——Codex 执行时按以下规格生成：

- **PackageListComponent**：列表展示 `CreativePackage[]`，每项含名称、描述、编辑/删除按钮，顶部有「新建」按钮，路由到 `/studio/packages/new`。
- **PackageEditorComponent**：三 Tab（角色资产 / 世界观 / 风格偏好），角色列表支持增删，风格 aspectRatio/resolution 使用胶囊按钮组选择，底部「保存资料包」调用 create 或 update API。
- **ProjectListComponent**：列表展示 `VideoProject[]`，显示状态/进度/资料包名称，点击跳转详情。

---

## 十八、验证检查清单

完成实现后逐项验证：

```
□ prisma migrate dev 成功，无报错
□ GET /video-agent/packages 返回 3 个默认资料包
□ POST /video-agent/projects { packageId, storyBrief? } 返回 project（status=planning）
□ GET /video-agent/projects/:id/stream 建立 SSE 连接
□ SSE 能收到 planning → shot_queued → shot_generating 事件
□ VideoShot 关联到 VideoTask（videoTaskId 非空）
□ 前端 /studio 路由正常加载
□ 前端 /studio/projects/new 能选资料包并提交
□ 前端 /studio/projects/:id 能实时接收 SSE 并更新分镜状态
□ VideoModule exports VideoService（VideoAgentModule 能 inject）
```

---

## 十九、风险与注意事项

| 风险 | 说明 | 规避方式 |
|---|---|---|
| VideoService.getTask 签名 | 需要 `(taskId, userId)` 两个参数，确认现有签名匹配 | 实现前先读 `video.service.ts:getTask` 方法签名 |
| LLM JSON 解析失败 | LLM 偶尔输出格式不规范 | ShotPlannerService 已有降级到固定 3 镜头模板的逻辑 |
| SSE 流在 project 完成前页面刷新 | streams map 中已无 subject | streamProject 对空 subject 返回立即 complete 的 Observable，前端 fallback 到 getProject 轮询 |
| VideoTask storedVideoPath 为空 | 部分情况下视频未本地缓存 | 按优先级：storedVideoPath → providerVideoUrl，已在 waitForVideoTask 中处理 |
| UserId 装饰器路径 | `@UserId()` 装饰器在 `backend/src/infra/` 目录 | 执行前用 Grep 确认实际文件名 |
