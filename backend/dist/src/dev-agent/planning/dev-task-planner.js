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
exports.DevTaskPlanner = void 0;
const common_1 = require("@nestjs/common");
const llm_service_1 = require("../../infra/llm/llm.service");
const dev_planner_prompt_factory_1 = require("./dev-planner-prompt.factory");
const dev_plan_parser_1 = require("./dev-plan-parser");
const dev_plan_normalizer_1 = require("./dev-plan-normalizer");
let DevTaskPlanner = class DevTaskPlanner {
    llm;
    promptFactory;
    parser;
    normalizer;
    constructor(llm, promptFactory, parser, normalizer) {
        this.llm = llm;
        this.promptFactory = promptFactory;
        this.parser = parser;
        this.normalizer = normalizer;
    }
    async planTask(goal, taskContext, options) {
        const { systemPrompt, userPrompt } = this.promptFactory.create(goal, taskContext, options);
        const response = await this.llm.generate([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
        ], { scenario: 'dev' });
        const parsed = this.parser.parse(response, goal);
        return this.normalizer.normalize(parsed, goal);
    }
};
exports.DevTaskPlanner = DevTaskPlanner;
exports.DevTaskPlanner = DevTaskPlanner = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [llm_service_1.LlmService,
        dev_planner_prompt_factory_1.DevPlannerPromptFactory,
        dev_plan_parser_1.DevPlanParser,
        dev_plan_normalizer_1.DevPlanNormalizer])
], DevTaskPlanner);
//# sourceMappingURL=dev-task-planner.js.map