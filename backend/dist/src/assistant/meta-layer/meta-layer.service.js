"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var MetaLayerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetaLayerService = void 0;
const common_1 = require("@nestjs/common");
let MetaLayerService = class MetaLayerService {
    static { MetaLayerService_1 = this; }
    static STRATEGY_EXPLANATION_PATTERNS = [
        /我会先[^。！？!?\n]*再[^。！？!?\n]*/,
        /我的策略是[^。！？!?\n]*/,
        /我想用[^。！？!?\n]*方式[^。！？!?\n]*/,
        /我现在用[^。！？!?\n]*方式[^。！？!?\n]*/,
        /我这样说是为了[^。！？!?\n]*/,
    ];
    static INTERNAL_LOGIC_PATTERNS = [
        /我认为你更需要[^。！？!?\n]*/,
        /我推测你[^。！？!?\n]*所以[^。！？!?\n]*/,
    ];
    static PROMPT_LEAK_PATTERNS = [
        /根据我的(?:规则|设定|提示词|系统)[^。！？!?\n]*/,
        /作为一个(?:AI|助手|模型)[^。！？!?\n]*我[^。！？!?\n]*/,
        /我(?:不能|必须遵循)[^。！？!?\n]*/,
    ];
    filter(content, policy) {
        if (!policy?.trim() || !content.trim()) {
            return {
                content,
                adjusted: false,
                reasons: [],
                removedSegments: 0,
                rewrittenSegments: 0,
            };
        }
        const reasons = [];
        let removedSegments = 0;
        let rewrittenSegments = 0;
        const segments = this.tokenize(content);
        const nextSegments = [];
        for (const segment of segments) {
            if (this.isWhitespace(segment)) {
                nextSegments.push(segment);
                continue;
            }
            if (this.matchesAny(segment, MetaLayerService_1.PROMPT_LEAK_PATTERNS)) {
                const rewritten = this.rewritePromptLeak(segment);
                if (rewritten) {
                    nextSegments.push(rewritten);
                    rewrittenSegments += 1;
                }
                else {
                    removedSegments += 1;
                }
                this.pushReason(reasons, 'removed-prompt-leak');
                continue;
            }
            if (this.matchesAny(segment, MetaLayerService_1.STRATEGY_EXPLANATION_PATTERNS)) {
                removedSegments += 1;
                this.pushReason(reasons, 'removed-strategy-explanation');
                continue;
            }
            if (this.matchesAny(segment, MetaLayerService_1.INTERNAL_LOGIC_PATTERNS)) {
                nextSegments.push(this.rewriteInternalLogic(segment));
                rewrittenSegments += 1;
                this.pushReason(reasons, 'rewrote-internal-logic');
                continue;
            }
            nextSegments.push(segment);
        }
        const cleaned = this.cleanup(nextSegments.join(''));
        return {
            content: cleaned,
            adjusted: reasons.length > 0,
            reasons,
            removedSegments,
            rewrittenSegments,
        };
    }
    tokenize(content) {
        return content.match(/[^\n。！？!?]+[。！？!?]?|\n+|./g) ?? [content];
    }
    isWhitespace(segment) {
        return segment.trim().length === 0;
    }
    matchesAny(segment, patterns) {
        return patterns.some((pattern) => pattern.test(segment));
    }
    rewriteInternalLogic(segment) {
        const trailing = this.getTrailingPunctuation(segment);
        if (/更需要被理解/.test(segment)) {
            return `我先陪你把这一下接住${trailing}`;
        }
        if (/更需要[^。！？!?\n]*缓/.test(segment) || /从你的状态来看/.test(segment)) {
            return `你可以先缓一下${trailing}`;
        }
        if (/我推测你[^。！？!?\n]*所以/.test(segment)) {
            return `咱们先把眼前这一步顾好${trailing}`;
        }
        return `我在这儿，咱们先一点点来${trailing}`;
    }
    rewritePromptLeak(segment) {
        const trailing = this.getTrailingPunctuation(segment);
        if (/(不能|无法|做不了|做不到|没法|必须遵循)/.test(segment)) {
            return `这个我做不了，但我可以换个方式帮你${trailing}`;
        }
        return null;
    }
    getTrailingPunctuation(segment) {
        const matched = segment.match(/[。！？!?]+$/);
        return matched?.[0] ?? '。';
    }
    cleanup(content) {
        const cleaned = content
            .replace(/[ \t]+\n/g, '\n')
            .replace(/\n{3,}/g, '\n\n')
            .replace(/([。！？!?]){2,}/g, '$1')
            .replace(/^[\s\n]+|[\s\n]+$/g, '');
        return cleaned || '嗯。';
    }
    pushReason(reasons, reason) {
        if (!reasons.includes(reason)) {
            reasons.push(reason);
        }
    }
};
exports.MetaLayerService = MetaLayerService;
exports.MetaLayerService = MetaLayerService = MetaLayerService_1 = __decorate([
    (0, common_1.Injectable)()
], MetaLayerService);
//# sourceMappingURL=meta-layer.service.js.map