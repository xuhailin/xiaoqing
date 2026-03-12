"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PromptRouterModule = void 0;
const common_1 = require("@nestjs/common");
const prompt_router_service_1 = require("./prompt-router.service");
const llm_module_1 = require("../../infra/llm/llm.module");
let PromptRouterModule = class PromptRouterModule {
};
exports.PromptRouterModule = PromptRouterModule;
exports.PromptRouterModule = PromptRouterModule = __decorate([
    (0, common_1.Module)({
        imports: [llm_module_1.LlmModule],
        providers: [prompt_router_service_1.PromptRouterService],
        exports: [prompt_router_service_1.PromptRouterService],
    })
], PromptRouterModule);
//# sourceMappingURL=prompt-router.module.js.map