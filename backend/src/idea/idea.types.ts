import type { IdeaStatus } from '@prisma/client';

export interface CreateIdeaInput {
  title?: string;
  content?: string;
}

export interface UpdateIdeaInput {
  title?: string;
  content?: string;
  status?: IdeaStatus;
}

export interface PromoteIdeaInput {
  title?: string;
  description?: string;
  dueAt?: string | Date;
}
