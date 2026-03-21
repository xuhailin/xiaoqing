export type UiTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export function ideaStatusLabel(status: string): string {
  if (status === 'open') return '待整理';
  if (status === 'promoted') return '已转待办';
  if (status === 'archived') return '已归档';
  return status;
}

export function ideaStatusTone(status: string): UiTone {
  if (status === 'open') return 'info';
  if (status === 'promoted') return 'success';
  return 'neutral';
}

export function todoStatusLabel(status: string): string {
  if (status === 'open') return '进行中';
  if (status === 'blocked') return '待补充';
  if (status === 'done') return '已完成';
  if (status === 'dropped') return '已放弃';
  if (status === 'failed') return '执行失败';
  if (status === 'pending') return '执行中';
  return status;
}

export function todoStatusTone(status: string): UiTone {
  if (status === 'open') return 'info';
  if (status === 'blocked') return 'warning';
  if (status === 'done') return 'success';
  if (status === 'failed') return 'danger';
  return 'neutral';
}

export function executionStatusLabel(status: string): string {
  if (status === 'pending') return '执行中';
  if (status === 'success') return '已完成';
  if (status === 'failed') return '执行失败';
  if (status === 'done') return '已完成';
  if (status === 'archived') return '已归档';
  if (status === 'active') return '待执行';
  if (status === 'paused') return '已暂停';
  return status;
}

export function executionStatusTone(status: string): UiTone {
  if (status === 'pending' || status === 'active') return 'warning';
  if (status === 'success' || status === 'done') return 'success';
  if (status === 'failed') return 'danger';
  return 'neutral';
}
