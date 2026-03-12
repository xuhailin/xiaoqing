"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SummarizerModule = void 0;
const common_1 = require("@nestjs/common");
const summarizer_controller_1 = require("./summarizer.controller");
const summarizer_service_1 = require("./summarizer.service");
const llm_module_1 = require("../../infra/llm/llm.module");
const prompt_router_module_1 = require("../prompt-router/prompt-router.module");
const memory_module_1 = require("../memory/memory.module");
const persona_module_1 = require("../persona/persona.module");
const identity_anchor_module_1 = require("../identity-anchor/identity-anchor.module");
let SummarizerModule = class SummarizerModule {
};
exports.SummarizerModule = SummarizerModule;
exports.SummarizerModule = SummarizerModule = __decorate([
    (0, common_1.Module)({
        imports: [llm_module_1.LlmModule, prompt_router_module_1.PromptRouterModule, memory_module_1.MemoryModule, persona_module_1.PersonaModule, identity_anchor_module_1.IdentityAnchorModule],
        controllers: [summarizer_controller_1.SummarizerController],
        providers: [summarizer_service_1.SummarizerService],
        exports: [summarizer_service_1.SummarizerService],
    })
], SummarizerModule);
//# sourceMappingURL=summarizer.module.js.map