import { OnModuleInit } from '@nestjs/common';
import { DevAgentOrchestrator } from './dev-agent.orchestrator';
import { DevSessionRepository } from './dev-session.repository';
export declare class DevRunRunnerService implements OnModuleInit {
    private readonly sessions;
    private readonly orchestrator;
    private readonly logger;
    private readonly inFlightRuns;
    private readonly sessionQueues;
    private readonly activeSessionWorkers;
    private readonly recoverRunningStrategy;
    constructor(sessions: DevSessionRepository, orchestrator: DevAgentOrchestrator);
    onModuleInit(): void;
    startRun(runId: string, sessionId?: string): void;
    private enqueueByRunId;
    private enqueueForSession;
    private drainSessionQueue;
    private execute;
    private recoverInterruptedRuns;
}
