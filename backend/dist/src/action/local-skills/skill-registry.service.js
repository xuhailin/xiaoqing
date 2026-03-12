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
var SkillRegistry_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SkillRegistry = void 0;
const common_1 = require("@nestjs/common");
const repo_summary_skill_1 = require("./skills/repo-summary.skill");
const SKILL_WHITELIST = new Set(['repo-summary']);
let SkillRegistry = SkillRegistry_1 = class SkillRegistry {
    logger = new common_1.Logger(SkillRegistry_1.name);
    skills = new Map();
    constructor() {
        this.register(repo_summary_skill_1.REPO_SUMMARY_SKILL);
    }
    register(skill) {
        if (!SKILL_WHITELIST.has(skill.name)) {
            this.logger.warn(`Skip non-whitelisted local skill: ${skill.name}`);
            return;
        }
        this.skills.set(skill.name, skill);
    }
    get(name) {
        return this.skills.get(name);
    }
    list() {
        return [...this.skills.values()];
    }
};
exports.SkillRegistry = SkillRegistry;
exports.SkillRegistry = SkillRegistry = SkillRegistry_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], SkillRegistry);
//# sourceMappingURL=skill-registry.service.js.map