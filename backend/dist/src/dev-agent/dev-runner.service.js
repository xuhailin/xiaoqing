"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var DevRunRunnerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DevRunRunnerService = void 0;
const common_1 = require("@nestjs/common");
const dev_agent_orchestrator_1 = require("./dev-agent.orchestrator");
const dev_session_repository_1 = require("./dev-session.repository");
let DevRunRunnerService = DevRunRunnerService_1 = class DevRunRunnerService {
    sessions;
    orchestrator;
    logger = new common_1.Logger(DevRunRunnerService_1.name);
    inFlightRuns = new Set();
    sessionQueues = new Map();
    activeSessionWorkers = new Set();
    recoverRunningStrategy = process.env.DEV_RUN_RECOVER_RUNNING_STRATEGY?.toLowerCase() === 'retry'
        ? 'retry'
        : 'fail';
    constructor(sessions, orchestrator) {
        this.sessions = sessions;
        this.orchestrator = orchestrator;
    }
    onModuleInit() {
        void this.recoverInterruptedRuns();
    }
    startRun(runId, sessionId) {
        if (this.inFlightRuns.has(runId)) {
            this.logger.debug(`Skip duplicated startRun request (already running): run=${runId}`);
            return;
        }
        if (sessionId) {
            this.enqueueForSession(sessionId, runId);
            return;
        }
        setImmediate(() => void this.enqueueByRunId(runId));
    }
    async enqueueByRunId(runId) {
        try {
            const run = await this.sessions.getRunWithSession(runId);
            if (!run?.sessionId) {
                this.logger.warn(`Skip enqueue: run not found or session missing: run=${runId}`);
                return;
            }
            this.enqueueForSession(run.sessionId, runId);
        }
        catch (err) {
            this.logger.error(`Failed to enqueue run=${runId}: ${String(err)}`);
        }
    }
    enqueueForSession(sessionId, runId) {
        const queue = this.sessionQueues.get(sessionId) ?? [];
        if (!this.sessionQueues.has(sessionId)) {
            this.sessionQueues.set(sessionId, queue);
        }
        if (queue.includes(runId) || this.inFlightRuns.has(runId)) {
            this.logger.debug(`Skip duplicated queue entry: session=${sessionId} run=${runId}`);
            return;
        }
        queue.push(runId);
        this.logger.debug(`Run queued: session=${sessionId} run=${runId} queueSize=${queue.length}`);
        if (this.activeSessionWorkers.has(sessionId)) {
            return;
        }
        this.activeSessionWorkers.add(sessionId);
        setImmediate(() => void this.drainSessionQueue(sessionId));
    }
    async drainSessionQueue(sessionId) {
        try {
            while (true) {
                const queue = this.sessionQueues.get(sessionId);
                const runId = queue?.shift();
                if (!runId) {
                    break;
                }
                this.inFlightRuns.add(runId);
                try {
                    await this.execute(runId);
                }
                finally {
                    this.inFlightRuns.delete(runId);
                }
            }
        }
        catch (err) {
            this.logger.error(`Session queue worker crashed: session=${sessionId} err=${String(err)}`);
        }
        finally {
            this.activeSessionWorkers.delete(sessionId);
            const queue = this.sessionQueues.get(sessionId);
            if (!queue || queue.length === 0) {
                this.sessionQueues.delete(sessionId);
                return;
            }
            if (!this.activeSessionWorkers.has(sessionId)) {
                this.activeSessionWorkers.add(sessionId);
                setImmediate(() => void this.drainSessionQueue(sessionId));
            }
        }
    }
    async execute(runId) {
        try {
            const claimedRun = await this.sessions.claimRunForExecution(runId);
            if (!claimedRun) {
                this.logger.warn(`Run is not claimable (already running or finished): run=${runId}`);
                return;
            }
            await this.orchestrator.executeRun({
                conversationId: claimedRun.session.conversationId ?? null,
                session: {
                    id: claimedRun.session.id,
                    status: claimedRun.session.status,
                },
                run: {
                    id: claimedRun.id,
                    userInput: claimedRun.userInput,
                },
            });
        }
        catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            this.logger.error(`Background run execution failed: run=${runId} ${errorMsg}`);
            await this.sessions
                .updateRunStatus(runId, {
                status: 'failed',
                error: `后台执行异常：${errorMsg}`,
                finishedAt: new Date(),
            })
                .catch((updateErr) => {
                this.logger.error(`Failed to persist run failure: ${String(updateErr)}`);
            });
        }
    }
    async recoverInterruptedRuns() {
        try {
            const recoverableRuns = await this.sessions.listRunsByStatuses([
                'queued',
                'pending',
                'running',
            ]);
            if (recoverableRuns.length === 0) {
                return;
            }
            this.logger.warn(`Recovering interrupted runs: count=${recoverableRuns.length}, runningStrategy=${this.recoverRunningStrategy}`);
            for (const run of recoverableRuns) {
                if (run.status === 'running') {
                    if (this.recoverRunningStrategy === 'retry') {
                        const requeued = await this.sessions.requeueRunningRun(run.id, '服务重启后自动恢复：重新入队执行');
                        if (requeued.count > 0) {
                            this.startRun(run.id, run.sessionId);
                        }
                        continue;
                    }
                    await this.sessions.markRunFailedForRecovery(run.id, '服务重启导致任务中断，已标记失败，请重新发起任务。');
                    continue;
                }
                this.startRun(run.id, run.sessionId);
            }
        }
        catch (err) {
            this.logger.error(`Failed to recover interrupted runs: ${String(err)}`);
        }
    }
};
exports.DevRunRunnerService = DevRunRunnerService;
exports.DevRunRunnerService = DevRunRunnerService = DevRunRunnerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [dev_session_repository_1.DevSessionRepository,
        dev_agent_orchestrator_1.DevAgentOrchestrator])
], DevRunRunnerService);
//# sourceMappingURL=dev-runner.service.js.map