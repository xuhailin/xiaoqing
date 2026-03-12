import { Injectable, Logger } from '@nestjs/common';
import { CapabilityRegistry } from '../capability-registry.service';
import type { CapabilityResult } from '../capability.types';
import { SkillRegistry } from './skill-registry.service';
import type {
  LocalSkillRunRequest,
  LocalSkillRunResult,
  LocalSkillStepResult,
} from './local-skill.types';

@Injectable()
export class SkillRunner {
  private readonly logger = new Logger(SkillRunner.name);

  constructor(
    private readonly skillRegistry: SkillRegistry,
    private readonly capabilityRegistry: CapabilityRegistry,
  ) {}

  async run(request: LocalSkillRunRequest): Promise<LocalSkillRunResult> {
    const startedAt = new Date();
    const startedAtIso = startedAt.toISOString();
    const skill = this.skillRegistry.get(request.skill);

    if (!skill) {
      const summary = `Unknown local skill: ${request.skill}`;
      return {
        skill: request.skill,
        success: false,
        summary,
        steps: [],
        startedAt: startedAtIso,
        durationMs: Date.now() - startedAt.getTime(),
      };
    }

    const steps: LocalSkillStepResult[] = [];
    let success = true;

    for (let i = 0; i < skill.steps.length; i++) {
      const step = skill.steps[i];
      const stepStart = Date.now();

      if (!skill.capabilityAllowlist.includes(step.capability)) {
        steps.push({
          index: i + 1,
          id: step.id,
          capability: step.capability,
          request: step.request,
          success: false,
          content: null,
          error: `capability "${step.capability}" is not allowed for skill "${skill.name}"`,
          durationMs: Date.now() - stepStart,
        });
        success = false;
        break;
      }

      const capability = this.capabilityRegistry.get(step.capability);
      if (!capability) {
        steps.push({
          index: i + 1,
          id: step.id,
          capability: step.capability,
          request: step.request,
          success: false,
          content: null,
          error: `capability "${step.capability}" is not registered`,
          durationMs: Date.now() - stepStart,
        });
        success = false;
        break;
      }

      if (!capability.isAvailable()) {
        steps.push({
          index: i + 1,
          id: step.id,
          capability: step.capability,
          request: step.request,
          success: false,
          content: null,
          error: `capability "${step.capability}" is not available`,
          durationMs: Date.now() - stepStart,
        });
        success = false;
        break;
      }

      let result: CapabilityResult;
      try {
        const params = request.sessionId
          ? { ...step.request, __devSessionId: request.sessionId }
          : step.request;
        result = await capability.execute({
          conversationId: request.conversationId,
          turnId: request.turnId,
          userInput: request.userInput,
          params,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `Local skill step failed: skill=${skill.name}, step=${step.id}, capability=${step.capability}, error=${message}`,
        );
        steps.push({
          index: i + 1,
          id: step.id,
          capability: step.capability,
          request: step.request,
          success: false,
          content: null,
          error: message,
          durationMs: Date.now() - stepStart,
        });
        success = false;
        break;
      }

      steps.push({
        index: i + 1,
        id: step.id,
        capability: step.capability,
        request: step.request,
        success: result.success,
        content: result.content,
        error: result.error,
        durationMs: Date.now() - stepStart,
        ...(result.meta ? { meta: result.meta } : {}),
      });

      if (!result.success) {
        success = false;
        break;
      }
    }

    return {
      skill: skill.name,
      success,
      summary: skill.summarize({ steps, success }),
      steps,
      startedAt: startedAtIso,
      durationMs: Date.now() - startedAt.getTime(),
    };
  }
}
