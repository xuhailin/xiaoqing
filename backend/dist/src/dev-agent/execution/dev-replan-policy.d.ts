import type { DevExecutorErrorType } from '../dev-agent.types';
import type { DevTaskContext } from '../dev-task-context';
export declare class DevReplanPolicy {
    shouldAutoReplan(errorType: DevExecutorErrorType): boolean;
    buildFailureSuggestion(taskContext: DevTaskContext): string;
}
