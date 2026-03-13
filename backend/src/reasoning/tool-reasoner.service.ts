import { Injectable } from '@nestjs/common';
import { IntentCapabilityMapper } from '../action/intent-capability-mapper.service';
import { CapabilityRegistry } from '../action/capability-registry.service';
import type { IReasoner, ReasoningContext, ReasoningResult } from './reasoner.interface';

@Injectable()
export class ToolReasoner implements IReasoner {
  constructor(
    private readonly intentMapper: IntentCapabilityMapper,
    private readonly capabilityRegistry: CapabilityRegistry,
  ) {}

  async reason(context: ReasoningContext): Promise<ReasoningResult> {
    const taskIntent = context.intentState?.taskIntent;
    if (!taskIntent || taskIntent === 'none') {
      return {
        decision: 'direct_reply',
        capabilities: [],
        reasoning: 'No tool intent detected',
      };
    }

    const capNames = this.intentMapper.findCapabilities(taskIntent as any, context.channel);
    const availableCap = capNames.find(name => {
      const cap = this.capabilityRegistry.get(name);
      return cap?.isAvailable();
    });

    if (availableCap) {
      return {
        decision: 'run_capability',
        capabilities: [availableCap],
        params: context.intentState?.slots,
        reasoning: `Mapped ${taskIntent} to ${availableCap}`,
      };
    }

    return {
      decision: 'direct_reply',
      capabilities: [],
      reasoning: `No available capability for ${taskIntent}`,
    };
  }
}
