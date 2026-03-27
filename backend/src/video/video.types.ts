export type VideoTaskMode = 'text' | 'image' | 'keyframe';
export type VideoTaskStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';
export type VideoDurationUnit = 'seconds' | 'frames';

export interface CreateVideoTaskInput {
  prompt: string;
  mode?: VideoTaskMode;
  aspectRatio?: string;
  resolution?: string;
  duration?: number;
  durationUnit?: VideoDurationUnit;
  firstFrameImage?: string;
  lastFrameImage?: string;
}

export interface VideoTaskDto {
  taskId: string;
  provider: 'seedance';
  prompt: string;
  mode: VideoTaskMode;
  status: VideoTaskStatus;
  aspectRatio?: string;
  resolution?: string;
  duration?: number;
  durationUnit?: VideoDurationUnit;
  videoUrl?: string;
  providerVideoUrl?: string;
  firstFrameAssetPath?: string;
  lastFrameAssetPath?: string;
  error?: string;
  canCancel: boolean;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  failedAt?: string;
  cancelledAt?: string;
}

export interface VideoTaskConfigDto {
  aspectRatios: string[];
  resolutions: string[];
  durationUnits: VideoDurationUnit[];
  maxCount: number;
  model: string;
}
