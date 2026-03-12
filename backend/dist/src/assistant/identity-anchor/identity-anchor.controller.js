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
exports.IdentityAnchorController = void 0;
const common_1 = require("@nestjs/common");
const identity_anchor_service_1 = require("./identity-anchor.service");
let IdentityAnchorController = class IdentityAnchorController {
    service;
    constructor(service) {
        this.service = service;
    }
    async list() {
        return this.service.list();
    }
    async create(body) {
        return this.service.create(body);
    }
    async update(id, body) {
        return this.service.update(id, body);
    }
    async remove(id) {
        return this.service.remove(id);
    }
    async getHistory() {
        return this.service.getHistory();
    }
    async migrateFromMemory() {
        return this.service.migrateFromMemory();
    }
};
exports.IdentityAnchorController = IdentityAnchorController;
__decorate([
    (0, common_1.Get)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], IdentityAnchorController.prototype, "list", null);
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], IdentityAnchorController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], IdentityAnchorController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], IdentityAnchorController.prototype, "remove", null);
__decorate([
    (0, common_1.Get)('history'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], IdentityAnchorController.prototype, "getHistory", null);
__decorate([
    (0, common_1.Post)('migrate'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], IdentityAnchorController.prototype, "migrateFromMemory", null);
exports.IdentityAnchorController = IdentityAnchorController = __decorate([
    (0, common_1.Controller)('identity-anchors'),
    __metadata("design:paramtypes", [identity_anchor_service_1.IdentityAnchorService])
], IdentityAnchorController);
//# sourceMappingURL=identity-anchor.controller.js.map