"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenClawModule = void 0;
const common_1 = require("@nestjs/common");
const openclaw_service_1 = require("./openclaw.service");
const task_formatter_service_1 = require("./task-formatter.service");
let OpenClawModule = class OpenClawModule {
};
exports.OpenClawModule = OpenClawModule;
exports.OpenClawModule = OpenClawModule = __decorate([
    (0, common_1.Module)({
        providers: [openclaw_service_1.OpenClawService, task_formatter_service_1.TaskFormatterService],
        exports: [openclaw_service_1.OpenClawService, task_formatter_service_1.TaskFormatterService],
    })
], OpenClawModule);
//# sourceMappingURL=openclaw.module.js.map