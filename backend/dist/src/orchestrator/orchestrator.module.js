"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrchestratorModule = void 0;
const common_1 = require("@nestjs/common");
const conversation_module_1 = require("../assistant/conversation/conversation.module");
const dev_agent_module_1 = require("../dev-agent/dev-agent.module");
const llm_module_1 = require("../infra/llm/llm.module");
const dispatcher_service_1 = require("./dispatcher.service");
const conversation_lock_service_1 = require("./conversation-lock.service");
const assistant_agent_adapter_1 = require("./assistant-agent.adapter");
const dev_agent_adapter_1 = require("./dev-agent.adapter");
const message_router_service_1 = require("../gateway/message-router.service");
const agent_interface_1 = require("./agent.interface");
let OrchestratorModule = class OrchestratorModule {
};
exports.OrchestratorModule = OrchestratorModule;
exports.OrchestratorModule = OrchestratorModule = __decorate([
    (0, common_1.Module)({
        imports: [conversation_module_1.ConversationModule, dev_agent_module_1.DevAgentModule, llm_module_1.LlmModule],
        providers: [
            conversation_lock_service_1.ConversationLockService,
            assistant_agent_adapter_1.AssistantAgentAdapter,
            dev_agent_adapter_1.DevAgentAdapter,
            message_router_service_1.MessageRouterService,
            {
                provide: agent_interface_1.AGENT_TOKEN,
                useFactory: (assistant, dev) => [
                    assistant,
                    dev,
                ],
                inject: [assistant_agent_adapter_1.AssistantAgentAdapter, dev_agent_adapter_1.DevAgentAdapter],
            },
            dispatcher_service_1.DispatcherService,
        ],
        exports: [dispatcher_service_1.DispatcherService],
    })
], OrchestratorModule);
//# sourceMappingURL=orchestrator.module.js.map