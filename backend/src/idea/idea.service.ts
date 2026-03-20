import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { IdeaStatus, type Prisma } from '@prisma/client';
import { PrismaService } from '../infra/prisma.service';
import type { CreateIdeaInput, PromoteIdeaInput, UpdateIdeaInput } from './idea.types';

@Injectable()
export class IdeaService {
  constructor(private readonly prisma: PrismaService) {}

  async createIdea(input: CreateIdeaInput) {
    const title = input.title?.trim() || null;
    const content = input.content?.trim() || title;

    if (!content) {
      throw new BadRequestException('title or content is required');
    }

    return this.prisma.idea.create({
      data: {
        title,
        content,
      },
      include: {
        promotedTodo: {
          select: { id: true, title: true, status: true, dueAt: true },
        },
      },
    });
  }

  async listIdeas(status?: IdeaStatus) {
    return this.prisma.idea.findMany({
      where: { status },
      include: {
        promotedTodo: {
          select: { id: true, title: true, status: true, dueAt: true },
        },
      },
      orderBy: [{ updatedAt: 'desc' }],
    });
  }

  async getIdea(id: string) {
    const idea = await this.prisma.idea.findUnique({
      where: { id },
      include: {
        promotedTodo: {
          select: { id: true, title: true, status: true, dueAt: true },
        },
      },
    });
    if (!idea) {
      throw new NotFoundException('idea not found');
    }
    return idea;
  }

  async updateIdea(id: string, input: UpdateIdeaInput) {
    const idea = await this.getIdea(id);
    const nextContent =
      input.content !== undefined
        ? input.content.trim() || idea.content
        : undefined;

    return this.prisma.idea.update({
      where: { id },
      data: {
        title: input.title !== undefined ? input.title?.trim() || null : undefined,
        content: nextContent,
        status: input.status,
      },
      include: {
        promotedTodo: {
          select: { id: true, title: true, status: true, dueAt: true },
        },
      },
    });
  }

  async promoteToTodo(id: string, input: PromoteIdeaInput) {
    const idea = await this.getIdea(id);
    if (idea.promotedTodo) {
      return {
        idea,
        todo: idea.promotedTodo,
      };
    }

    const title = input.title?.trim() || idea.title?.trim() || this.deriveTitle(idea.content);
    const description = input.description?.trim() || idea.content;
    const dueAt = this.parseDate(input.dueAt);

    const todo = await this.prisma.todo.create({
      data: {
        title,
        description,
        dueAt,
        sourceIdeaId: idea.id,
      },
      select: {
        id: true,
        title: true,
        status: true,
        dueAt: true,
      },
    });

    const updatedIdea = await this.prisma.idea.update({
      where: { id: idea.id },
      data: {
        status: IdeaStatus.promoted,
        promotedTodoId: todo.id,
      },
      include: {
        promotedTodo: {
          select: { id: true, title: true, status: true, dueAt: true },
        },
      },
    });

    return {
      idea: updatedIdea,
      todo,
    };
  }

  private deriveTitle(content: string): string {
    return content.trim().split('\n')[0]?.slice(0, 48) || '未命名想法';
  }

  private parseDate(value?: string | Date): Date | null {
    if (!value) {
      return null;
    }
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('dueAt must be a valid date');
    }
    return date;
  }
}
