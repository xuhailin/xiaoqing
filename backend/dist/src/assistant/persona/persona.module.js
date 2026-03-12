"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PersonaModule = void 0;
const common_1 = require("@nestjs/common");
const persona_controller_1 = require("./persona.controller");
const persona_service_1 = require("./persona.service");
const evolution_scheduler_service_1 = require("./evolution-scheduler.service");
const user_profile_service_1 = require("./user-profile.service");
const llm_module_1 = require("../../infra/llm/llm.module");
let PersonaModule = class PersonaModule {
};
exports.PersonaModule = PersonaModule;
exports.PersonaModule = PersonaModule = __decorate([
    (0, common_1.Module)({
        imports: [llm_module_1.LlmModule],
        controllers: [persona_controller_1.PersonaController],
        providers: [persona_service_1.PersonaService, evolution_scheduler_service_1.EvolutionSchedulerService, user_profile_service_1.UserProfileService],
        exports: [persona_service_1.PersonaService, evolution_scheduler_service_1.EvolutionSchedulerService, user_profile_service_1.UserProfileService],
    })
], PersonaModule);
//# sourceMappingURL=persona.module.js.map