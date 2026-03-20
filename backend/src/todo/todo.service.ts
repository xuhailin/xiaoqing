import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PlanDispatchType, ReminderScope, TodoStatus } from '@prisma/client';
import { PrismaService } from '../infra/prisma.service';
import { PlanService } from '../plan/plan.service';
import { TaskOccurrenceService } from '../plan/task-occurrence.service';
import type { CreateTodoInput, CreateTodoTaskInput, UpdateTodoInput } from './todo.types';

@Injectable()
export class TodoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly planService: PlanService,
    private readonly occurrenceService: TaskOccurrenceService,
  ) {}

  async createTodo(input: CreateTodoInput) {
    const title = input.title?.trim() || null;
    const description = input.description?.trim() || null;
    if (!title && !description) {
      throw new BadRequestException('title or description is required');
    }

    const dueAt = this.parseDate(input.dueAt);
    const status = input.status ?? TodoStatus.open;
    const blockReason = input.blockReason?.trim() || null;

    const todo = await this.prisma.todo.create({
      data: {
        title,
        description,
        dueAt,
        status,
        blockReason,
        sourceIdeaId: input.sourceIdeaId?.trim() || null,
      },
    });

    if (input.sourceIdeaId) {
      await this.prisma.idea.update({
        where: { id: input.sourceIdeaId },
        data: {
          status: 'promoted',
          promotedTodoId: todo.id,
        },
      }).catch(() => {});
    }

    return this.getTodo(todo.id);
  }

  async listTodos(status?: TodoStatus) {
    const todos = await this.prisma.todo.findMany({
      where: { status },
      include: {
        sourceIdea: {
          select: { id: true, title: true, status: true },
        },
        executionPlans: {
          orderBy: [{ createdAt: 'desc' }],
          take: 1,
          include: {
            occurrences: {
              orderBy: [{ scheduledAt: 'desc' }],
              take: 1,
            },
          },
        },
      },
      orderBy: [
        { status: 'asc' },
        { dueAt: 'asc' },
        { createdAt: 'desc' },
      ],
    });

    return todos.map((todo) => this.mapTodoRecord(todo));
  }

  async getTodo(id: string) {
    const todo = await this.prisma.todo.findUnique({
      where: { id },
      include: {
        sourceIdea: {
          select: { id: true, title: true, status: true },
        },
        executionPlans: {
          orderBy: [{ createdAt: 'desc' }],
          take: 1,
          include: {
            occurrences: {
              orderBy: [{ scheduledAt: 'desc' }],
              take: 1,
            },
          },
        },
      },
    });

    if (!todo) {
      throw new NotFoundException('todo not found');
    }

    return this.mapTodoRecord(todo);
  }

  async updateTodo(id: string, input: UpdateTodoInput) {
    await this.getTodo(id);
    const status = input.status;

    await this.prisma.todo.update({
      where: { id },
      data: {
        title: input.title !== undefined ? input.title?.trim() || null : undefined,
        description: input.description !== undefined ? input.description?.trim() || null : undefined,
        dueAt: input.dueAt !== undefined ? this.parseDate(input.dueAt) : undefined,
        status,
        blockReason: input.blockReason !== undefined
          ? (input.blockReason?.trim() || null)
          : (status ? null : undefined),
        completedAt: status === TodoStatus.done ? new Date() : status ? null : undefined,
      },
    });

    return this.getTodo(id);
  }

  async createTaskFromTodo(id: string, input: CreateTodoTaskInput) {
    const todo = await this.prisma.todo.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        description: true,
      },
    });
    if (!todo) {
      throw new NotFoundException('todo not found');
    }

    const capability = input.capability?.trim();
    if (!capability) {
      throw new BadRequestException('capability is required');
    }

    await this.prisma.todo.update({
      where: { id },
      data: {
        status: TodoStatus.open,
        blockReason: null,
        completedAt: null,
      },
    });

    const runAt = new Date(Date.now() + 5_000);
    const plan = await this.planService.createPlan({
      title: todo.title ?? todo.description ?? capability,
      description: todo.description ?? todo.title ?? capability,
      scope: ReminderScope.system,
      dispatchType: PlanDispatchType.action,
      recurrence: 'once',
      runAt,
      timezone: 'Asia/Shanghai',
      sourceTodoId: todo.id,
      actionPayload: {
        capability,
        params: input.params ?? {},
      },
      taskTemplates: [
        {
          action: capability,
          params: input.params ?? {},
          mode: 'execute',
        },
      ],
    });

    await this.occurrenceService.createOccurrence(plan.id, runAt, {
      action: capability,
      params: input.params ?? {},
      mode: 'execute',
    });

    return {
      todo: await this.getTodo(id),
      plan: {
        id: plan.id,
        dispatchType: plan.dispatchType,
        nextRunAt: plan.nextRunAt,
        status: plan.status,
      },
    };
  }

  private parseDate(value?: string | Date | null): Date | null {
    if (value === undefined || value === null || value === '') {
      return null;
    }
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('dueAt must be a valid date');
    }
    return date;
  }

  private mapTodoRecord(
    todo: {
      executionPlans?: Array<{
        id: string;
        title: string | null;
        dispatchType: PlanDispatchType;
        status: string;
        nextRunAt: Date | null;
        occurrences?: Array<{
          id: string;
          status: string;
          action: string | null;
          params: unknown;
          scheduledAt: Date;
          resultRef: string | null;
          resultPayload: unknown;
        }>;
      }>;
      [key: string]: any;
    },
  ) {
    const latestPlan = todo.executionPlans?.[0] ?? null;
    const latestOccurrence = latestPlan?.occurrences?.[0] ?? null;
    const latestOccurrencePayload = this.asRecord(latestOccurrence?.resultPayload);
    const latestOccurrenceFailed = latestOccurrencePayload?.success === false;
    return {
      ...todo,
      latestExecutionPlan: latestPlan
        ? {
            id: latestPlan.id,
            title: latestPlan.title,
            dispatchType: latestPlan.dispatchType,
            status: latestPlan.status,
            nextRunAt: latestPlan.nextRunAt,
          }
        : null,
      latestTask: latestOccurrence
        ? {
            id: latestOccurrence.id,
            status: latestOccurrenceFailed ? 'failed' : latestOccurrence.status,
            action: latestOccurrence.action ?? null,
            params: this.asRecord(latestOccurrence.params),
            scheduledAt: latestOccurrence.scheduledAt,
            resultRef: latestOccurrence.resultRef,
            resultPayload: latestOccurrence.resultPayload,
            errorSummary: latestOccurrenceFailed ? this.readString(latestOccurrencePayload?.error) : null,
          }
        : null,
      executionPlans: undefined,
    };
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || Array.isArray(value) || typeof value !== 'object') {
      return null;
    }
    return value as Record<string, unknown>;
  }

  private readString(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }
}
