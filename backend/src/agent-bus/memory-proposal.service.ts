import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, type MemoryProposalStatus } from '@prisma/client';
import type { EntryAgentId } from '../gateway/message-router.types';
import { PrismaService } from '../infra/prisma.service';
import type { AgentMemoryProposal } from './agent-bus.protocol';

export interface CreateMemoryProposalInput {
  delegationId?: string;
  proposerAgentId: EntryAgentId;
  ownerAgentId?: EntryAgentId;
  kind: string;
  content: string;
  reason?: string;
  confidence?: number;
  scope?: string;
}

@Injectable()
export class MemoryProposalService {
  private readonly logger = new Logger(MemoryProposalService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createFromDelegationResult(
    delegationId: string,
    proposals: AgentMemoryProposal[],
    proposerAgentId: EntryAgentId,
  ) {
    if (!proposals.length) return [];

    const created = await Promise.all(
      proposals
        .filter((p) => p.content?.trim())
        .slice(0, 10) // 单次最多 10 条
        .map((p) =>
          this.create({
            delegationId,
            proposerAgentId,
            ownerAgentId: (p.ownerAgentId as EntryAgentId) ?? 'xiaoqing',
            kind: p.kind || 'general',
            content: p.content.trim(),
            reason: p.reason?.trim(),
            confidence: typeof p.confidence === 'number' ? Math.max(0, Math.min(1, p.confidence)) : 0.5,
            scope: p.scope || 'long_term',
          }),
        ),
    );

    this.logger.log(
      `Created ${created.length} memory proposals from delegation ${delegationId}`,
    );
    return created;
  }

  async create(input: CreateMemoryProposalInput) {
    return this.prisma.memoryProposal.create({
      data: {
        delegationId: input.delegationId ?? null,
        proposerAgentId: input.proposerAgentId,
        ownerAgentId: input.ownerAgentId ?? 'xiaoqing',
        kind: input.kind,
        content: input.content,
        reason: input.reason ?? null,
        confidence: input.confidence ?? 0.5,
        scope: input.scope ?? 'long_term',
      },
    });
  }

  async list(filters?: {
    status?: MemoryProposalStatus;
    proposerAgentId?: EntryAgentId;
    delegationId?: string;
    limit?: number;
  }) {
    return this.prisma.memoryProposal.findMany({
      where: {
        ...(filters?.status ? { status: filters.status } : {}),
        ...(filters?.proposerAgentId ? { proposerAgentId: filters.proposerAgentId } : {}),
        ...(filters?.delegationId ? { delegationId: filters.delegationId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: filters?.limit ?? 50,
    });
  }

  async approve(id: string, reviewNote?: string) {
    const proposal = await this.findOrThrow(id);
    if (proposal.status !== 'pending') {
      throw new BadRequestException(`proposal "${id}" is already ${proposal.status}`);
    }

    // 写入主记忆
    const memory = await this.prisma.memory.create({
      data: {
        type: proposal.scope === 'session' ? 'mid' : 'long',
        category: this.mapKindToCategory(proposal.kind),
        content: proposal.content,
        confidence: proposal.confidence,
        sourceMessageIds: [],
      },
    });

    const updated = await this.prisma.memoryProposal.update({
      where: { id },
      data: {
        status: 'approved',
        reviewNote: reviewNote?.trim() || null,
        resultMemoryId: memory.id,
        reviewedAt: new Date(),
      },
    });

    this.logger.log(
      `Approved memory proposal ${id} → memory ${memory.id} (kind: ${proposal.kind})`,
    );
    return updated;
  }

  async reject(id: string, reviewNote?: string) {
    const proposal = await this.findOrThrow(id);
    if (proposal.status !== 'pending') {
      throw new BadRequestException(`proposal "${id}" is already ${proposal.status}`);
    }

    const updated = await this.prisma.memoryProposal.update({
      where: { id },
      data: {
        status: 'rejected',
        reviewNote: reviewNote?.trim() || null,
        reviewedAt: new Date(),
      },
    });

    this.logger.log(`Rejected memory proposal ${id}`);
    return updated;
  }

  async merge(id: string, mergedMemoryId: string, reviewNote?: string) {
    const proposal = await this.findOrThrow(id);
    if (proposal.status !== 'pending') {
      throw new BadRequestException(`proposal "${id}" is already ${proposal.status}`);
    }

    // 验证目标记忆存在
    const memory = await this.prisma.memory.findUnique({ where: { id: mergedMemoryId } });
    if (!memory) {
      throw new NotFoundException(`memory "${mergedMemoryId}" not found`);
    }

    const updated = await this.prisma.memoryProposal.update({
      where: { id },
      data: {
        status: 'merged',
        reviewNote: reviewNote?.trim() || `merged into existing memory ${mergedMemoryId}`,
        resultMemoryId: mergedMemoryId,
        reviewedAt: new Date(),
      },
    });

    this.logger.log(`Merged memory proposal ${id} → memory ${mergedMemoryId}`);
    return updated;
  }

  private async findOrThrow(id: string) {
    const proposal = await this.prisma.memoryProposal.findUnique({ where: { id } });
    if (!proposal) {
      throw new NotFoundException(`memory proposal "${id}" not found`);
    }
    return proposal;
  }

  private mapKindToCategory(kind: string): string {
    const map: Record<string, string> = {
      preference: 'soft_preference',
      fact: 'shared_fact',
      boundary: 'correction',
      correction: 'correction',
      identity: 'identity_anchor',
      commitment: 'commitment',
    };
    return map[kind] ?? 'general';
  }
}
