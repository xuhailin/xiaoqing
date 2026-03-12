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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MemoryController = void 0;
const common_1 = require("@nestjs/common");
const memory_service_1 = require("./memory.service");
const memory_decay_service_1 = require("./memory-decay.service");
let MemoryController = class MemoryController {
    memory;
    decay;
    constructor(memory, decay) {
        this.memory = memory;
        this.decay = decay;
    }
    async forInjection(midK) {
        const k = Math.max(0, parseInt(String(midK || '5'), 10) || 5);
        return this.memory.getForInjection(k);
    }
    async list(type, category) {
        return this.memory.list(type, category);
    }
    async getOne(id) {
        return this.memory.getOne(id);
    }
    async update(id, body) {
        return this.memory.update(id, body);
    }
    async recalculateDecay() {
        const updated = await this.decay.recalcAll();
        return { updated };
    }
    async getDecayCandidates() {
        return this.decay.getDecayCandidates();
    }
    async cleanupDecayed(body) {
        const deleted = await this.decay.cleanup(body.memoryIds);
        return { deleted };
    }
    async deleteOne(id) {
        return this.memory.deleteOne(id);
    }
};
exports.MemoryController = MemoryController;
__decorate([
    (0, common_1.Get)('for-injection'),
    __param(0, (0, common_1.Query)('midK')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], MemoryController.prototype, "forInjection", null);
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Query)('type')),
    __param(1, (0, common_1.Query)('category')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], MemoryController.prototype, "list", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], MemoryController.prototype, "getOne", null);
__decorate([
    (0, common_1.Patch)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], MemoryController.prototype, "update", null);
__decorate([
    (0, common_1.Post)('decay/recalculate'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], MemoryController.prototype, "recalculateDecay", null);
__decorate([
    (0, common_1.Get)('decay/candidates'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], MemoryController.prototype, "getDecayCandidates", null);
__decorate([
    (0, common_1.Delete)('decay/cleanup'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], MemoryController.prototype, "cleanupDecayed", null);
__decorate([
    (0, common_1.Delete)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], MemoryController.prototype, "deleteOne", null);
exports.MemoryController = MemoryController = __decorate([
    (0, common_1.Controller)('memories'),
    __metadata("design:paramtypes", [memory_service_1.MemoryService,
        memory_decay_service_1.MemoryDecayService])
], MemoryController);
//# sourceMappingURL=memory.controller.js.map