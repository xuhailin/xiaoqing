"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConversationModule = void 0;
const common_1 = require("@nestjs/common");
const conversation_controller_1 = require("./conversation.controller");
const conversation_service_1 = require("./conversation.service");
const assistant_orchestrator_service_1 = require("./assistant-orchestrator.service");
const turn_context_assembler_service_1 = require("./turn-context-assembler.service");
const llm_module_1 = require("../../infra/llm/llm.module");
const prompt_router_module_1 = require("../prompt-router/prompt-router.module");
const memory_module_1 = require("../memory/memory.module");
const persona_module_1 = require("../persona/persona.module");
const intent_module_1 = require("../intent/intent.module");
const openclaw_module_1 = require("../../openclaw/openclaw.module");
const action_module_1 = require("../../action/action.module");
const world_state_module_1 = require("../../infra/world-state/world-state.module");
const identity_anchor_module_1 = require("../identity-anchor/identity-anchor.module");
const summarizer_module_1 = require("../summarizer/summarizer.module");
const cognitive_pipeline_module_1 = require("../cognitive-pipeline/cognitive-pipeline.module");
const meta_layer_service_1 = require("../meta-layer/meta-layer.service");
const daily_moment_module_1 = require("../daily-moment/daily-moment.module");
const post_turn_pipeline_1 = require("../post-turn/post-turn.pipeline");
let ConversationModule = class ConversationModule {
};
exports.ConversationModule = ConversationModule;
exports.ConversationModule = ConversationModule = __decorate([
    (0, common_1.Module)({
        imports: [llm_module_1.LlmModule, prompt_router_module_1.PromptRouterModule, memory_module_1.MemoryModule, persona_module_1.PersonaModule, intent_module_1.IntentModule, openclaw_module_1.OpenClawModule, action_module_1.ActionModule, world_state_module_1.WorldStateModule, identity_anchor_module_1.IdentityAnchorModule, summarizer_module_1.SummarizerModule, cognitive_pipeline_module_1.CognitivePipelineModule, daily_moment_module_1.DailyMomentModule],
        controllers: [conversation_controller_1.ConversationController],
        providers: [
            conversation_service_1.ConversationService,
            assistant_orchestrator_service_1.AssistantOrchestrator,
            turn_context_assembler_service_1.TurnContextAssembler,
            post_turn_pipeline_1.PostTurnPipeline,
            meta_layer_service_1.MetaLayerService,
        ],
        exports: [conversation_service_1.ConversationService],
    })
], ConversationModule);
//# sourceMappingURL=conversation.module.js.map