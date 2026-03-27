import type { VideoDurationUnit, VideoTaskMode } from '../video.types';

export class CreateVideoTaskDto {
  prompt!: string;
  mode?: VideoTaskMode;
  aspectRatio?: string;
  resolution?: string;
  duration?: number;
  durationUnit?: VideoDurationUnit;
  firstFrameImage?: string;
  lastFrameImage?: string;
}
