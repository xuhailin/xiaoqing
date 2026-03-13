import { Injectable } from '@nestjs/common';
import { CapabilityRegistry } from '../action/capability-registry.service';
import type { ReasoningContext } from './reasoner.interface';

export interface ChainStep {
  capability: string;
  params: Record<string, any>;
  outputMapping?: Record<string, string>;
}

export interface CapabilityChain {
  steps: ChainStep[];
  description?: string;
}

@Injectable()
export class ChainExecutor {
  constructor(private readonly capabilityRegistry: CapabilityRegistry) {}

  async execute(chain: CapabilityChain, context: ReasoningContext): Promise<any> {
    const results: any[] = [];
    let previousOutput: any = null;

    for (const step of chain.steps) {
      const params = this.mapInputs(step, previousOutput);
      const capability = this.capabilityRegistry.get(step.capability);

      if (!capability || !capability.isAvailable()) {
        throw new Error(`Capability ${step.capability} not available`);
      }

      const result = await capability.execute({
        conversationId: context.conversationId,
        turnId: context.turnId ?? '',
        userInput: context.userInput,
        params,
      });

      results.push(result);
      previousOutput = result;
    }

    return results[results.length - 1];
  }

  private mapInputs(step: ChainStep, previousOutput: any): Record<string, any> {
    if (!step.outputMapping || !previousOutput) {
      return step.params;
    }

    const mapped = { ...step.params };
    for (const [targetKey, sourceKey] of Object.entries(step.outputMapping)) {
      if (previousOutput[sourceKey] !== undefined) {
        mapped[targetKey] = previousOutput[sourceKey];
      }
    }
    return mapped;
  }
}
