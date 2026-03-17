import type { ConversationMessageDto, MessageContentType } from './orchestration.types';

export function resolveMessageContentType(role: string): MessageContentType {
  return role === 'assistant' ? 'markdown' : 'text';
}

export function toConversationMessageDto(message: {
  id: string;
  role: string;
  content: string;
  createdAt: Date;
}): ConversationMessageDto {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    contentType: resolveMessageContentType(message.role),
    createdAt: message.createdAt,
  };
}
