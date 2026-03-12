"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTaskContext = createTaskContext;
function createTaskContext(taskId, goal) {
    return {
        taskId,
        goal,
        plans: [],
        steps: [],
        stepResults: [],
        stepLogs: [],
        errors: [],
        replanCount: 0,
        consecutiveFailures: 0,
    };
}
//# sourceMappingURL=dev-task-context.js.map