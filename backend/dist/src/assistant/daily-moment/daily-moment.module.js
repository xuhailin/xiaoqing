"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DailyMomentModule = void 0;
const common_1 = require("@nestjs/common");
const llm_module_1 = require("../../infra/llm/llm.module");
const daily_moment_trigger_evaluator_1 = require("./daily-moment-trigger.evaluator");
const daily_moment_snippet_extractor_1 = require("./daily-moment-snippet.extractor");
const daily_moment_generator_1 = require("./daily-moment-generator");
const daily_moment_policy_1 = require("./daily-moment-policy");
const daily_moment_service_1 = require("./daily-moment.service");
const daily_moment_prisma_repository_1 = require("./daily-moment-prisma.repository");
let DailyMomentModule = class DailyMomentModule {
};
exports.DailyMomentModule = DailyMomentModule;
exports.DailyMomentModule = DailyMomentModule = __decorate([
    (0, common_1.Module)({
        imports: [llm_module_1.LlmModule],
        providers: [
            daily_moment_trigger_evaluator_1.DailyMomentTriggerEvaluator,
            daily_moment_snippet_extractor_1.DailyMomentSnippetExtractor,
            daily_moment_generator_1.DailyMomentGenerator,
            daily_moment_policy_1.DailyMomentPolicy,
            daily_moment_prisma_repository_1.DailyMomentPrismaRepository,
            daily_moment_service_1.DailyMomentService,
        ],
        exports: [daily_moment_service_1.DailyMomentService],
    })
], DailyMomentModule);
//# sourceMappingURL=daily-moment.module.js.map