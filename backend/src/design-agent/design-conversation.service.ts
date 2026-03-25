import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../infra/prisma.service';
import type {
  DesignConversationMessage,
  DesignConversationStatus,
  CreateDesignConversationRequest,
  SendDesignMessageRequest,
  DesignConversationResponse,
  ApplyChangesRequest,
  ApplyChangesResult,
  DesignImageInput,
  DesignAuditResult,
  ProposedChange,
} from './design-agent.types';

@Injectable()
export class DesignConversationService {
  private readonly logger = new Logger(DesignConversationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 创建新的设计审查对话
   */
  async createConversation(
    userId: string,
    request: CreateDesignConversationRequest,
  ): Promise<DesignConversationResponse> {
    const conversation = await this.prisma.designConversation.create({
      data: {
        title: request.title,
        pageName: request.pageName,
        pageType: request.pageType,
        pageUrl: request.pageUrl,
        preset: request.preset,
        workspaceRoot: request.workspaceRoot,
      },
    });

    return this.toResponse(conversation, []);
  }

  /**
   * 获取对话详情
   */
  async getConversation(conversationId: string): Promise<DesignConversationResponse | null> {
    const conversation = await this.prisma.designConversation.findUnique({
      where: { id: conversationId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!conversation) return null;

    return this.toResponse(conversation, conversation.messages);
  }

  /**
   * 获取用户的对话列表
   */
  async listConversations(
    userId: string,
    options?: { status?: DesignConversationStatus; limit?: number },
  ): Promise<DesignConversationResponse[]> {
    const conversations = await this.prisma.designConversation.findMany({
      where: options?.status ? { status: options.status } : undefined,
      orderBy: { updatedAt: 'desc' },
      take: options?.limit ?? 20,
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1, // 只取最新消息用于预览
        },
      },
    });

    return conversations.map((c) => this.toResponse(c, c.messages));
  }

  /**
   * 添加用户消息
   */
  async addUserMessage(
    conversationId: string,
    request: SendDesignMessageRequest,
  ): Promise<DesignConversationMessage> {
    const conversation = await this.prisma.designConversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation) {
      throw new NotFoundException(`Conversation ${conversationId} not found`);
    }

    const message = await this.prisma.designMessage.create({
      data: {
        conversationId,
        role: 'user',
        content: request.content,
        metadata: request.images?.length
          ? JSON.parse(JSON.stringify({ images: request.images }))
          : undefined,
      },
    });

    // 更新对话的 updatedAt
    await this.prisma.designConversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    return this.toMessage(message);
  }

  /**
   * 添加助手消息
   */
  async addAssistantMessage(
    conversationId: string,
    content: string,
    metadata?: DesignConversationMessage['metadata'],
  ): Promise<DesignConversationMessage> {
    const message = await this.prisma.designMessage.create({
      data: {
        conversationId,
        role: 'assistant',
        content,
        metadata: metadata ? JSON.parse(JSON.stringify(metadata)) : undefined,
      },
    });

    await this.prisma.designConversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    return this.toMessage(message);
  }

  /**
   * 获取对话的所有消息
   */
  async getMessages(conversationId: string): Promise<DesignConversationMessage[]> {
    const messages = await this.prisma.designMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
    });

    return messages.map((m) => this.toMessage(m));
  }

  /**
   * 获取对话上下文（用于构建 LLM prompt）
   */
  async getConversationContext(conversationId: string): Promise<{
    conversation: DesignConversationResponse;
    messages: DesignConversationMessage[];
    pageContext?: {
      pageName: string;
      pageType: string;
      pageUrl?: string;
      preset?: string;
    };
  }> {
    const conversation = await this.getConversation(conversationId);
    if (!conversation) {
      throw new NotFoundException(`Conversation ${conversationId} not found`);
    }

    const pageContext =
      conversation.pageName && conversation.pageType
        ? {
            pageName: conversation.pageName,
            pageType: conversation.pageType,
            pageUrl: conversation.pageUrl,
            preset: conversation.preset,
          }
        : undefined;

    return {
      conversation,
      messages: conversation.messages,
      pageContext,
    };
  }

  /**
   * 更新对话的页面上下文
   */
  async updatePageContext(
    conversationId: string,
    context: {
      pageName?: string;
      pageType?: string;
      pageUrl?: string;
      preset?: string;
    },
  ): Promise<void> {
    await this.prisma.designConversation.update({
      where: { id: conversationId },
      data: context,
    });
  }

  /**
   * 归档对话
   */
  async archiveConversation(conversationId: string): Promise<void> {
    await this.prisma.designConversation.update({
      where: { id: conversationId },
      data: { status: 'archived' },
    });
  }

  /**
   * 删除对话
   */
  async deleteConversation(conversationId: string): Promise<void> {
    await this.prisma.designConversation.delete({
      where: { id: conversationId },
    });
  }

  // ── 私有方法 ────────────────────────────────

  private toResponse(
    conversation: {
      id: string;
      title?: string | null;
      status: string;
      pageName?: string | null;
      pageType?: string | null;
      pageUrl?: string | null;
      preset?: string | null;
      workspaceRoot?: string | null;
      createdAt: Date;
      updatedAt: Date;
    },
    messages: any[],
  ): DesignConversationResponse {
    return {
      id: conversation.id,
      title: conversation.title ?? undefined,
      status: conversation.status as DesignConversationStatus,
      pageName: conversation.pageName ?? undefined,
      pageType: conversation.pageType ?? undefined,
      pageUrl: conversation.pageUrl ?? undefined,
      preset: conversation.preset ?? undefined,
      workspaceRoot: conversation.workspaceRoot ?? undefined,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      messages: messages.map((m) => this.toMessage(m)),
    };
  }

  private toMessage(message: any): DesignConversationMessage {
    return {
      id: message.id,
      conversationId: message.conversationId,
      role: message.role,
      content: message.content,
      metadata: message.metadata,
      createdAt: message.createdAt,
    };
  }
}
