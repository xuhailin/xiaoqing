"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const schedule_1 = require("@nestjs/schedule");
const app_controller_1 = require("./app.controller");
const app_service_1 = require("./app.service");
const prisma_service_1 = require("./infra/prisma.service");
const conversation_module_1 = require("./assistant/conversation/conversation.module");
const memory_module_1 = require("./assistant/memory/memory.module");
const summarizer_module_1 = require("./assistant/summarizer/summarizer.module");
const persona_module_1 = require("./assistant/persona/persona.module");
const identity_anchor_module_1 = require("./assistant/identity-anchor/identity-anchor.module");
const pet_module_1 = require("./assistant/pet/pet.module");
const claim_engine_module_1 = require("./assistant/claim-engine/claim-engine.module");
const gateway_module_1 = require("./gateway/gateway.module");
const dev_agent_module_1 = require("./dev-agent/dev-agent.module");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({ isGlobal: true }),
            schedule_1.ScheduleModule.forRoot(),
            conversation_module_1.ConversationModule,
            gateway_module_1.GatewayModule,
            dev_agent_module_1.DevAgentModule,
            memory_module_1.MemoryModule,
            summarizer_module_1.SummarizerModule,
            persona_module_1.PersonaModule,
            identity_anchor_module_1.IdentityAnchorModule,
            pet_module_1.PetModule,
            claim_engine_module_1.ClaimEngineModule,
        ],
        controllers: [app_controller_1.AppController],
        providers: [app_service_1.AppService, prisma_service_1.PrismaService],
        exports: [prisma_service_1.PrismaService],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map