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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DevAgentController = void 0;
const common_1 = require("@nestjs/common");
const dev_agent_service_1 = require("./dev-agent.service");
let DevAgentController = class DevAgentController {
    devAgent;
    constructor(devAgent) {
        this.devAgent = devAgent;
    }
    async listSessions() {
        return this.devAgent.listSessions();
    }
    async getSession(id) {
        return this.devAgent.getSession(id);
    }
    async getRun(runId) {
        return this.devAgent.getRun(runId);
    }
    async cancelRun(runId, body) {
        return this.devAgent.cancelRun(runId, body?.reason);
    }
    async listReminders(sessionId) {
        return this.devAgent.listReminders(sessionId);
    }
    async createReminder(body) {
        return this.devAgent.createReminder(body);
    }
    async setReminderEnabled(id, body) {
        return this.devAgent.setReminderEnabled(id, body?.enabled !== false);
    }
    async triggerReminderNow(id) {
        return this.devAgent.triggerReminderNow(id);
    }
    async deleteReminder(id) {
        return this.devAgent.deleteReminder(id);
    }
};
exports.DevAgentController = DevAgentController;
__decorate([
    (0, common_1.Get)('sessions'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], DevAgentController.prototype, "listSessions", null);
__decorate([
    (0, common_1.Get)('sessions/:id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], DevAgentController.prototype, "getSession", null);
__decorate([
    (0, common_1.Get)('runs/:runId'),
    __param(0, (0, common_1.Param)('runId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], DevAgentController.prototype, "getRun", null);
__decorate([
    (0, common_1.Post)('runs/:runId/cancel'),
    __param(0, (0, common_1.Param)('runId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], DevAgentController.prototype, "cancelRun", null);
__decorate([
    (0, common_1.Get)('reminders'),
    __param(0, (0, common_1.Query)('sessionId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], DevAgentController.prototype, "listReminders", null);
__decorate([
    (0, common_1.Post)('reminders'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], DevAgentController.prototype, "createReminder", null);
__decorate([
    (0, common_1.Post)('reminders/:id/enable'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], DevAgentController.prototype, "setReminderEnabled", null);
__decorate([
    (0, common_1.Post)('reminders/:id/trigger'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], DevAgentController.prototype, "triggerReminderNow", null);
__decorate([
    (0, common_1.Delete)('reminders/:id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], DevAgentController.prototype, "deleteReminder", null);
exports.DevAgentController = DevAgentController = __decorate([
    (0, common_1.Controller)('dev-agent'),
    __metadata("design:paramtypes", [dev_agent_service_1.DevAgentService])
], DevAgentController);
//# sourceMappingURL=dev-agent.controller.js.map