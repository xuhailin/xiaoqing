import { Injectable } from '@nestjs/common';
import type { EntryAgentId } from '../gateway/message-router.types';
import { PrismaService } from '../infra/prisma.service';

@Injectable()
export class AgentConversationLinkService {
  constructor(private readonly prisma: PrismaService) {}

  async getOrCreateInternalConversation(
    requesterAgentId: EntryAgentId,
    requesterConversationRef: string,
  ) {
    const existing = await this.prisma.agentConversationLink.findUnique({
      where: {
        requesterAgentId_requesterConversationRef: {
          requesterAgentId,
          requesterConversationRef,
        },
      },
      include: {
        localConversation: true,
      },
    });
    if (existing) {
      return existing.localConversation;
    }

    const conversationTitle = `协作·${this.getAgentLabel(requesterAgentId)}·${requesterConversationRef.slice(0, 24)}`;
    const created = await this.prisma.$transaction(async (tx) => {
      const conversation = await tx.conversation.create({
        data: {
          entryAgentId: 'xiaoqing',
          isInternal: true,
          title: conversationTitle,
        },
      });

      await tx.agentConversationLink.create({
        data: {
          requesterAgentId,
          requesterConversationRef,
          localConversationId: conversation.id,
        },
      });

      return conversation;
    });

    return created;
  }

  private getAgentLabel(agentId: EntryAgentId): string {
    return agentId === 'xiaoqin' ? '小勤' : '小晴';
  }
}

