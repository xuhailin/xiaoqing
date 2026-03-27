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

export interface CreativePackageInput {
  name: string;
  description?: string;
  coverImage?: string;
  source?: string;
  characters?: CharacterAsset[];
  worldStyle?: Partial<WorldStyle>;
  stylePreset?: Partial<StylePreset>;
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
  errorMessage?: string;
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

export interface PlannedShot {
  shotIndex: number;
  description: string;
  cameraMovement: string;
  duration: number;
}

export interface StoryboardSceneInput {
  prompt: string;
  duration?: number;
  description?: string;
  cameraMovement?: string;
}

export type VideoAgentEvent =
  | {
      type: 'project_state';
      projectId: string;
      status: 'planning' | 'generating' | 'done' | 'failed';
      progress: number;
      totalShots: number;
      completedShots: number;
      failedShots: number;
      updatedAt: string;
    }
  | { type: 'planning'; message: string }
  | { type: 'shot_queued'; shotIndex: number; total: number }
  | { type: 'shot_generating'; shotIndex: number }
  | { type: 'shot_done'; shotIndex: number; videoUrl: string }
  | { type: 'shot_failed'; shotIndex: number; error: string }
  | { type: 'project_done'; projectId: string }
  | { type: 'project_failed'; error: string };
