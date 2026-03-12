import { Injectable } from '@nestjs/common';
import { TurnContextAssembler } from './turn-context-assembler.service';
import type { SendMessageResult } from './conversation.service';
import type { TurnContext } from './orchestration.types';

@Injectable()
export class AssistantOrchestrator {
  constructor(private readonly assembler: TurnContextAssembler) {}

  async processTurn(input: {
    conversationId: string;
    userInput: string;
    userMessage: { id: string; role: 'user'; content: string; createdAt: Date };
    recentRounds: number;
    execute: (context: TurnContext) => Promise<SendMessageResult>;
  }): Promise<SendMessageResult> {
    const context = await this.assembler.assembleBase({
      conversationId: input.conversationId,
      userInput: input.userInput,
      userMessage: input.userMessage,
      now: new Date(),
      recentRounds: input.recentRounds,
    });
    return input.execute(context);
  }
}
