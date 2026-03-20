import type { TodoStatus } from '@prisma/client';

export interface CreateTodoInput {
  title?: string;
  description?: string;
  dueAt?: string | Date;
  sourceIdeaId?: string;
  status?: TodoStatus;
  blockReason?: string;
}

export interface UpdateTodoInput {
  title?: string;
  description?: string;
  dueAt?: string | Date | null;
  status?: TodoStatus;
  blockReason?: string | null;
}

export interface CreateTodoTaskInput {
  capability: string;
  params?: Record<string, unknown>;
}
