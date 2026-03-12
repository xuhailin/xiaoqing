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
var GeneralActionSkillService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.GeneralActionSkillService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const executor_1 = require("../../tools/general-action/executor");
let GeneralActionSkillService = GeneralActionSkillService_1 = class GeneralActionSkillService {
    logger = new common_1.Logger(GeneralActionSkillService_1.name);
    enabled;
    name = 'general-action';
    taskIntent = 'general_tool';
    channels = ['chat'];
    description = '其他工具型请求（搜索、邮件、日历、外部查询等）';
    constructor(config) {
        this.enabled = config.get('FEATURE_LOCAL_GENERAL_ACTION') === 'true';
    }
    isAvailable() {
        return this.enabled;
    }
    async execute(request) {
        const adapted = this.parseParams(request.params);
        if (!adapted) {
            return { success: false, content: null, error: 'general_action params invalid' };
        }
        const result = await this.executeGeneralAction(adapted);
        return {
            success: result.success,
            content: result.content || null,
            error: result.error ?? null,
            meta: {
                ...(result.meta ?? {}),
                reasonCode: result.code ?? null,
                actionType: typeof result.meta?.actionType === 'string' ? result.meta.actionType : null,
            },
        };
    }
    async executeGeneralAction(params) {
        const input = params?.input?.trim();
        if (!input) {
            return { success: false, content: '', error: '输入为空', code: 'VALIDATION_ERROR' };
        }
        if (!this.enabled) {
            return { success: false, content: '', error: '本地基础行动能力未开启', code: 'NOT_SUPPORTED' };
        }
        try {
            const result = await (0, executor_1.executeGeneralAction)(input);
            return {
                success: result.ok,
                content: result.message ?? '',
                error: result.ok ? undefined : result.message,
                code: result.code,
                meta: result.meta,
            };
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            this.logger.warn(`General action skill error: ${msg}`);
            return { success: false, content: '', error: msg, code: 'EXECUTION_ERROR' };
        }
    }
    parseParams(params) {
        const input = typeof params.input === 'string' ? params.input.trim() : '';
        if (!input)
            return null;
        return { input };
    }
};
exports.GeneralActionSkillService = GeneralActionSkillService;
exports.GeneralActionSkillService = GeneralActionSkillService = GeneralActionSkillService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], GeneralActionSkillService);
//# sourceMappingURL=general-action-skill.service.js.map