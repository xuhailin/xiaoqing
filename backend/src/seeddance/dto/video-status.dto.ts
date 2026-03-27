export class VideoStatusDto {
  taskId!: string;
  status!: 'pending' | 'running' | 'completed' | 'failed';
  videoUrl?: string;
  error?: string;
}
