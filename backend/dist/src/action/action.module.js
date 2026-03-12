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
exports.ActionModule = void 0;
const common_1 = require("@nestjs/common");
const capability_registry_service_1 = require("./capability-registry.service");
const tool_executor_registry_service_1 = require("./tools/tool-executor-registry.service");
const weather_skill_module_1 = require("./skills/weather/weather-skill.module");
const book_download_skill_module_1 = require("./skills/book-download/book-download-skill.module");
const general_action_skill_module_1 = require("./skills/general-action/general-action-skill.module");
const timesheet_skill_module_1 = require("./skills/timesheet/timesheet-skill.module");
const weather_skill_service_1 = require("./skills/weather/weather-skill.service");
const book_download_skill_service_1 = require("./skills/book-download/book-download-skill.service");
const general_action_skill_service_1 = require("./skills/general-action/general-action-skill.service");
const timesheet_skill_service_1 = require("./skills/timesheet/timesheet-skill.service");
const openclaw_module_1 = require("../openclaw/openclaw.module");
const readonly_file_capability_service_1 = require("./capabilities/readonly-file-capability.service");
const local_skill_module_1 = require("./local-skills/local-skill.module");
const skill_runner_service_1 = require("./local-skills/skill-runner.service");
let ActionModule = class ActionModule {
    registry;
    weather;
    bookDownload;
    generalAction;
    timesheet;
    readonlyFileCapability;
    constructor(registry, weather, bookDownload, generalAction, timesheet, readonlyFileCapability) {
        this.registry = registry;
        this.weather = weather;
        this.bookDownload = bookDownload;
        this.generalAction = generalAction;
        this.timesheet = timesheet;
        this.readonlyFileCapability = readonlyFileCapability;
    }
    onModuleInit() {
        this.registry.register(this.weather);
        this.registry.register(this.bookDownload);
        this.registry.register(this.generalAction);
        this.registry.register(this.timesheet);
        this.registry.register(this.readonlyFileCapability);
    }
};
exports.ActionModule = ActionModule;
exports.ActionModule = ActionModule = __decorate([
    (0, common_1.Module)({
        imports: [
            weather_skill_module_1.WeatherSkillModule,
            book_download_skill_module_1.BookDownloadSkillModule,
            general_action_skill_module_1.GeneralActionSkillModule,
            timesheet_skill_module_1.TimesheetSkillModule,
            local_skill_module_1.LocalSkillModule,
            openclaw_module_1.OpenClawModule,
        ],
        providers: [capability_registry_service_1.CapabilityRegistry, tool_executor_registry_service_1.ToolExecutorRegistry, readonly_file_capability_service_1.ReadonlyFileCapabilityService, skill_runner_service_1.SkillRunner],
        exports: [capability_registry_service_1.CapabilityRegistry, tool_executor_registry_service_1.ToolExecutorRegistry, weather_skill_module_1.WeatherSkillModule, local_skill_module_1.LocalSkillModule, skill_runner_service_1.SkillRunner],
    }),
    __metadata("design:paramtypes", [capability_registry_service_1.CapabilityRegistry,
        weather_skill_service_1.WeatherSkillService,
        book_download_skill_service_1.BookDownloadSkillService,
        general_action_skill_service_1.GeneralActionSkillService,
        timesheet_skill_service_1.TimesheetSkillService,
        readonly_file_capability_service_1.ReadonlyFileCapabilityService])
], ActionModule);
//# sourceMappingURL=action.module.js.map