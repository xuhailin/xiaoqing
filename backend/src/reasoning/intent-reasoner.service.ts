import { Injectable } from '@nestjs/common';
import { IntentService } from '../assistant/intent/intent.service';
import { ActionReasonerService } from '../assistant/action-reasoner/action-reasoner.service';
import type { IReasoner, ReasoningContext, ReasoningResult } from './reasoner.interface';

@Injectable()
export class IntentReasoner implements IReasoner {
  constructor(
    private readonly intentService: IntentService,
    private readonly actionReasoner: ActionReasonerService,
  ) {}

  async reason(context: ReasoningContext): Promise<ReasoningResult> {
    const intentState = context.intentState ??
      await this.intentService.recognize([], context.userInput);

    const actionDecision = this.actionReasoner.decide(intentState);

    const decision = this.mapActionToDecision(actionDecision.action);
    const capabilities = actionDecision.capability ? [actionDecision.capability] : [];

    return {
      decision,
      capabilities,
      params: intentState.slots,
      reasoning: actionDecision.reason,
    };
  }

  private mapActionToDecision(action: string): ReasoningResult['decision'] {
    switch (action) {
      case 'direct_reply': return 'direct_reply';
      case 'run_capability': return 'run_capability';
      case 'handoff_dev': return 'handoff';
      case 'suggest_reminder': return 'direct_reply';
      default: return 'direct_reply';
    }
  }
}
