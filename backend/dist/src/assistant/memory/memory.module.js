"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MemoryModule = void 0;
const common_1 = require("@nestjs/common");
const memory_controller_1 = require("./memory.controller");
const memory_service_1 = require("./memory.service");
const memory_decay_service_1 = require("./memory-decay.service");
const memory_write_guard_service_1 = require("./memory-write-guard.service");
const memory_scheduler_service_1 = require("./memory-scheduler.service");
let MemoryModule = class MemoryModule {
};
exports.MemoryModule = MemoryModule;
exports.MemoryModule = MemoryModule = __decorate([
    (0, common_1.Module)({
        controllers: [memory_controller_1.MemoryController],
        providers: [memory_service_1.MemoryService, memory_decay_service_1.MemoryDecayService, memory_write_guard_service_1.MemoryWriteGuardService, memory_scheduler_service_1.MemorySchedulerService],
        exports: [memory_service_1.MemoryService, memory_decay_service_1.MemoryDecayService, memory_write_guard_service_1.MemoryWriteGuardService, memory_scheduler_service_1.MemorySchedulerService],
    })
], MemoryModule);
//# sourceMappingURL=memory.module.js.map