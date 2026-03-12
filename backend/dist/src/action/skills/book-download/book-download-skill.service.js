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
var BookDownloadSkillService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.BookDownloadSkillService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const book_download_executor_1 = require("./book-download.executor");
let BookDownloadSkillService = BookDownloadSkillService_1 = class BookDownloadSkillService {
    logger = new common_1.Logger(BookDownloadSkillService_1.name);
    baseUrl;
    name = 'book-download';
    taskIntent = 'book_download';
    channels = ['chat'];
    description = '下载电子书（用户说「下载xxx」「帮我找《xxx》」等）';
    constructor(config) {
        this.baseUrl = config.get('RESOURCE_BASE_URL') || '';
    }
    isAvailable() {
        return Boolean(this.baseUrl);
    }
    async execute(request) {
        const adapted = this.parseParams(request.params);
        if (!adapted) {
            return { success: false, content: null, error: 'book_download params invalid' };
        }
        const result = await this.executeBookDownload(adapted);
        return {
            success: result.success,
            content: result.content || null,
            error: result.error ?? null,
            meta: {
                ...(result.debug && { bookDownloadDebug: result.debug }),
                ...(result.choices && { bookChoices: result.choices }),
            },
        };
    }
    async executeBookDownload(params) {
        const bookName = params?.bookName?.trim();
        if (!bookName) {
            return { success: false, content: '', error: '书名为空' };
        }
        if (!this.baseUrl) {
            return { success: false, content: '', error: '未配置 RESOURCE_BASE_URL' };
        }
        try {
            const parsed = await (0, book_download_executor_1.executeBookDownloadWorkflow)(bookName, undefined, params.choiceIndex);
            if (!parsed.ok) {
                this.logger.warn(`Book download workflow failed: ${parsed.message}`, {
                    bookName,
                    choiceIndex: params.choiceIndex ?? null,
                    choicesCount: parsed.choices?.length ?? 0,
                    debug: parsed.debug ?? null,
                });
            }
            const content = parsed.ok
                ? parsed.message ?? '已下载。'
                : [parsed.message, parsed.choices?.map((c) => `${c.index}: ${c.title}`).join('；')].filter(Boolean).join(' ');
            return {
                success: parsed.ok === true,
                content,
                error: parsed.ok ? undefined : (parsed.message ?? '下载未成功'),
                debug: parsed.debug,
                choices: parsed.ok ? undefined : parsed.choices,
            };
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            this.logger.warn(`Book download skill error: ${msg}`);
            return { success: false, content: '', error: msg };
        }
    }
    parseParams(params) {
        const bookName = typeof params.bookName === 'string' ? params.bookName.trim() : '';
        if (!bookName)
            return null;
        const choiceIndex = typeof params.bookChoiceIndex === 'number' ? params.bookChoiceIndex : undefined;
        return { bookName, ...(choiceIndex != null && { choiceIndex }) };
    }
};
exports.BookDownloadSkillService = BookDownloadSkillService;
exports.BookDownloadSkillService = BookDownloadSkillService = BookDownloadSkillService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], BookDownloadSkillService);
//# sourceMappingURL=book-download-skill.service.js.map