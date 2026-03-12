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
exports.ClaimEngineConfig = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
let ClaimEngineConfig = class ClaimEngineConfig {
    config;
    constructor(config) {
        this.config = config;
    }
    get writeDualEnabled() {
        return this.config.get('FEATURE_CLAIM_WRITE_DUAL') === 'true';
    }
    get readNewEnabled() {
        return this.config.get('FEATURE_CLAIM_READ_NEW') === 'true';
    }
    get injectionEnabled() {
        return this.config.get('FEATURE_CLAIM_INJECTION') === 'true';
    }
    get sessionStateInjectionEnabled() {
        return this.config.get('FEATURE_SESSIONSTATE_INJECTION') === 'true';
    }
    get writeInteractionEnabled() {
        return this.config.get('FEATURE_CLAIM_WRITE_INTERACTION') === 'true';
    }
    get writeEmotionEnabled() {
        return this.config.get('FEATURE_CLAIM_WRITE_EMOTION') === 'true';
    }
    get draftEnabled() {
        return this.config.get('FEATURE_CLAIM_DRAFT_ENABLED') === 'true';
    }
    get injectionTokenBudget() {
        const raw = Number(this.config.get('CLAIM_INJECTION_TOKEN_BUDGET') ?? 220);
        return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 220;
    }
    get canonicalMappingThreshold() {
        const raw = Number(this.config.get('CLAIM_CANONICAL_MAPPING_THRESHOLD') ?? 0.72);
        if (!Number.isFinite(raw))
            return 0.72;
        return Math.max(0, Math.min(1, raw));
    }
};
exports.ClaimEngineConfig = ClaimEngineConfig;
exports.ClaimEngineConfig = ClaimEngineConfig = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], ClaimEngineConfig);
//# sourceMappingURL=claim-engine.config.js.map