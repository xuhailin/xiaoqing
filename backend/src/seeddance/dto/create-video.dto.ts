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
