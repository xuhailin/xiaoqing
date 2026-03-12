import { Injectable } from '@nestjs/common';
import type {
  ChatCompletionResult,
  ToolPolicyDecision,
  TurnContext,
} from './orchestration.types';
import { ChatCompletionEngine } from './chat-completion.engine';

@Injectable()
export class ChatCompletionRunner {
  constructor(private readonly engine: ChatCompletionEngine) {}

  async execute(
    context: TurnContext,
    policy: ToolPolicyDecision,
  ): Promise<ChatCompletionResult> {
    return this.engine.execute(context, policy);
  }
}
