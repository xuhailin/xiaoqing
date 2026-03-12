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
var DevReminderSchedulerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DevReminderSchedulerService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const schedule_1 = require("@nestjs/schedule");
const dev_reminder_service_1 = require("./dev-reminder.service");
let DevReminderSchedulerService = DevReminderSchedulerService_1 = class DevReminderSchedulerService {
    reminders;
    logger = new common_1.Logger(DevReminderSchedulerService_1.name);
    enabled;
    constructor(reminders, config) {
        this.reminders = reminders;
        this.enabled = config.get('FEATURE_DEV_REMINDER') !== 'false';
    }
    onModuleInit() {
        if (!this.enabled)
            return;
        void this.reminders.dispatchDueReminders().catch((err) => {
            this.logger.error(`Initial reminder dispatch failed: ${String(err)}`);
        });
    }
    async handleReminderPolling() {
        if (!this.enabled)
            return;
        try {
            const result = await this.reminders.dispatchDueReminders();
            if (result.triggered > 0) {
                this.logger.log(`Reminder polling triggered runs: scanned=${result.scanned} triggered=${result.triggered}`);
            }
        }
        catch (err) {
            this.logger.error(`Reminder polling failed: ${String(err)}`);
        }
    }
};
exports.DevReminderSchedulerService = DevReminderSchedulerService;
__decorate([
    (0, schedule_1.Cron)('*/15 * * * * *'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], DevReminderSchedulerService.prototype, "handleReminderPolling", null);
exports.DevReminderSchedulerService = DevReminderSchedulerService = DevReminderSchedulerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [dev_reminder_service_1.DevReminderService,
        config_1.ConfigService])
], DevReminderSchedulerService);
//# sourceMappingURL=dev-reminder.scheduler.service.js.map