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
exports.DevFinalReportGenerator = void 0;
const common_1 = require("@nestjs/common");
const llm_service_1 = require("../../infra/llm/llm.service");
const dev_agent_constants_1 = require("../dev-agent.constants");
let DevFinalReportGenerator = class DevFinalReportGenerator {
    llm;
    constructor(llm) {
        this.llm = llm;
    }
    async generateReport(userInput, summary) {
        const safeUserInput = String(userInput ?? '').slice(0, dev_agent_constants_1.REPORT_USER_INPUT_MAX_CHARS);
        try {
            return await this.llm.generate([
                {
                    role: 'system',
                    content: '你是开发助手小晴。仅基于最终摘要，给出简洁执行汇报。成功时简短确认；失败时说明原因并给一条建议。',
                },
                {
                    role: 'user',
                    content: `任务：${safeUserInput}\n最终摘要：${JSON.stringify(summary, null, 2)}`,
                },
            ], { scenario: 'dev' });
        }
        catch {
            return `任务处理完成，摘要：${JSON.stringify(summary)}`;
        }
    }
};
exports.DevFinalReportGenerator = DevFinalReportGenerator;
exports.DevFinalReportGenerator = DevFinalReportGenerator = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [llm_service_1.LlmService])
], DevFinalReportGenerator);
//# sourceMappingURL=dev-final-report.generator.js.map