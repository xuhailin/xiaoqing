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
Object.defineProperty(exports, "__esModule", { value: true });
exports.DevAgentService = void 0;
const common_1 = require("@nestjs/common");
const dev_session_repository_1 = require("./dev-session.repository");
const dev_runner_service_1 = require("./dev-runner.service");
const dev_reminder_service_1 = require("./dev-reminder.service");
let DevAgentService = class DevAgentService {
    sessions;
    runner;
    reminders;
    constructor(sessions, runner, reminders) {
        this.sessions = sessions;
        this.runner = runner;
        this.reminders = reminders;
    }
    async handleTask(conversationId, userInput) {
        const session = await this.sessions.getOrCreateSession(conversationId);
        const run = await this.sessions.createRun(session.id, userInput);
        this.runner.startRun(run.id, session.id);
        return {
            session: { id: session.id, status: session.status },
            run: {
                id: run.id,
                status: run.status,
                executor: run.executor ?? null,
                plan: null,
                result: run.result,
                error: null,
                artifactPath: null,
            },
            reply: `任务已接收（run: ${run.id}），正在后台执行。你可以轮询 /dev-agent/runs/${run.id} 查看进度。`,
        };
    }
    async listSessions() {
        return this.sessions.listSessions();
    }
    async getSession(sessionId) {
        return this.sessions.getSessionWithRuns(sessionId);
    }
    async getRun(runId) {
        return this.sessions.getRun(runId);
    }
    async cancelRun(runId, reason) {
        const normalizedReason = reason?.trim() || '任务已取消';
        const run = await this.sessions.cancelRun(runId, normalizedReason);
        if (!run) {
            return {
                ok: false,
                error: 'run not found',
            };
        }
        const terminalStatuses = ['success', 'failed', 'canceled'];
        const alreadyTerminal = terminalStatuses.includes(run.status) && run.status !== 'canceled';
        if (alreadyTerminal) {
            return {
                ok: false,
                error: `run already ${run.status}`,
                run: {
                    id: run.id,
                    status: run.status,
                    error: run.error,
                    finishedAt: run.finishedAt,
                },
            };
        }
        return {
            ok: true,
            run: {
                id: run.id,
                status: run.status,
                error: run.error,
                finishedAt: run.finishedAt,
            },
        };
    }
    async createReminder(input) {
        return this.reminders.createReminder(input);
    }
    async listReminders(sessionId) {
        return this.reminders.listReminders(sessionId);
    }
    async setReminderEnabled(id, enabled) {
        return this.reminders.setReminderEnabled(id, enabled);
    }
    async triggerReminderNow(id) {
        return this.reminders.triggerReminderNow(id);
    }
    async deleteReminder(id) {
        return this.reminders.deleteReminder(id);
    }
};
exports.DevAgentService = DevAgentService;
exports.DevAgentService = DevAgentService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [dev_session_repository_1.DevSessionRepository,
        dev_runner_service_1.DevRunRunnerService,
        dev_reminder_service_1.DevReminderService])
], DevAgentService);
//# sourceMappingURL=dev-agent.service.js.map