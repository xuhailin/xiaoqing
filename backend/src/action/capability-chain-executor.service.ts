import { Injectable } from '@nestjs/common';
import { CapabilityRegistry } from './capability-registry.service';

export interface ChainStep {
  capability: string;
  params: Record<string, any>;
  outputMapping?: Record<string, string>;
}

export interface CapabilityChain {
  steps: ChainStep[];
  description?: string;
}

export interface ChainExecutionContext {
  conversationId: string;
  turnId: string;
  userInput: string;
}

/**
 * Executes a multi-step capability chain sequentially,
 * piping each step's output into the next step via outputMapping.
 *
 * Belongs in the execution/capability layer — chain planning is
 * the caller's responsibility (e.g. a future DecisionEngine or
 * capability planner).
 */
@Injectable()
export class CapabilityChainExecutor {
  constructor(private readonly capabilityRegistry: CapabilityRegistry) {}

  async execute(chain: CapabilityChain, context: ChainExecutionContext): Promise<any> {
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
        turnId: context.turnId,
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
