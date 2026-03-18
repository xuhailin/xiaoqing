import type {
  ConversationMessageDto,
  ConversationMessageKind,
  ConversationMessageMetadata,
  MessageContentType,
} from './orchestration.types';

export function resolveMessageContentType(role: string): MessageContentType {
  return role === 'assistant' ? 'markdown' : 'text';
}

function resolveMessageKind(input: {
  role: string;
  kind?: string | null;
}): ConversationMessageKind {
  if (input.kind) {
    return input.kind as ConversationMessageKind;
  }
  return input.role === 'user' ? 'user' : 'chat';
}

export function toConversationMessageDto(message: {
  id: string;
  role: string;
  kind?: string | null;
  content: string;
  metadata?: unknown;
  createdAt: Date;
}): ConversationMessageDto {
  return {
    id: message.id,
    role: message.role,
    kind: resolveMessageKind(message),
    content: message.content,
    metadata: (message.metadata as ConversationMessageMetadata | null | undefined) ?? null,
    contentType: resolveMessageContentType(message.role),
    createdAt: message.createdAt,
  };
}
