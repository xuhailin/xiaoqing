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
var MessageRouterService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageRouterService = void 0;
const common_1 = require("@nestjs/common");
const llm_service_1 = require("../infra/llm/llm.service");
let MessageRouterService = MessageRouterService_1 = class MessageRouterService {
    llm;
    logger = new common_1.Logger(MessageRouterService_1.name);
    constructor(llm) {
        this.llm = llm;
    }
    async route(content, mode) {
        if (mode === 'dev') {
            return { channel: 'dev', content, reason: 'explicit mode=dev' };
        }
        if (content.startsWith('/dev ')) {
            return { channel: 'dev', content: content.slice(5), reason: 'prefix /dev' };
        }
        if (content.startsWith('/task ')) {
            return { channel: 'dev', content: content.slice(6), reason: 'prefix /task' };
        }
        if (mode === undefined) {
            const intentChannel = await this.classifyIntent(content);
            if (intentChannel) {
                return { channel: intentChannel, content, reason: 'llm intent classification' };
            }
        }
        return { channel: 'chat', content, reason: 'default chat' };
    }
    async classifyIntent(content) {
        try {
            const response = await this.llm.generate([
                {
                    role: 'system',
                    content: `你是一个消息意图分类器。判断用户消息是"聊天"还是"开发任务"。

开发任务的特征：
- 明确要求执行 shell 命令、代码操作、文件管理
- 要求查看 git 状态、运行测试、构建项目等
- 要求部署、安装依赖、数据库操作等

聊天的特征：
- 日常对话、闲聊、情感交流
- 提问、讨论、请教建议
- 没有明确的技术执行指令

只回复一个单词：chat 或 dev。如果不确定，回复 chat。`,
                },
                { role: 'user', content },
            ], { scenario: 'reasoning' });
            const trimmed = response.trim().toLowerCase();
            if (trimmed === 'dev') {
                this.logger.log(`LLM intent: dev for "${content.slice(0, 50)}"`);
                return 'dev';
            }
            return null;
        }
        catch (err) {
            this.logger.warn(`Intent classification failed: ${err}`);
            return null;
        }
    }
};
exports.MessageRouterService = MessageRouterService;
exports.MessageRouterService = MessageRouterService = MessageRouterService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [llm_service_1.LlmService])
], MessageRouterService);
//# sourceMappingURL=message-router.service.js.map