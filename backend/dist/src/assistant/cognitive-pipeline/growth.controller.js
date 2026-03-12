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
exports.GrowthController = void 0;
const common_1 = require("@nestjs/common");
const cognitive_growth_service_1 = require("./cognitive-growth.service");
let GrowthController = class GrowthController {
    growth;
    constructor(growth) {
        this.growth = growth;
    }
    async getPending() {
        return this.growth.getPending();
    }
    async confirm(id, body) {
        this.validateType(body?.type);
        await this.growth.confirmGrowth(id, body.type);
        return { ok: true };
    }
    async reject(id, body) {
        this.validateType(body?.type);
        await this.growth.rejectGrowth(id, body.type);
        return { ok: true };
    }
    validateType(type) {
        if (type !== 'cognitive_profile' && type !== 'relationship_state') {
            throw new common_1.BadRequestException('type must be "cognitive_profile" or "relationship_state"');
        }
    }
};
exports.GrowthController = GrowthController;
__decorate([
    (0, common_1.Get)('pending'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], GrowthController.prototype, "getPending", null);
__decorate([
    (0, common_1.Patch)(':id/confirm'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], GrowthController.prototype, "confirm", null);
__decorate([
    (0, common_1.Patch)(':id/reject'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], GrowthController.prototype, "reject", null);
exports.GrowthController = GrowthController = __decorate([
    (0, common_1.Controller)('growth'),
    __metadata("design:paramtypes", [cognitive_growth_service_1.CognitiveGrowthService])
], GrowthController);
//# sourceMappingURL=growth.controller.js.map