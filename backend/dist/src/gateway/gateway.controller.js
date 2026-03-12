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
exports.GatewayController = void 0;
const common_1 = require("@nestjs/common");
const dispatcher_service_1 = require("../orchestrator/dispatcher.service");
let GatewayController = class GatewayController {
    dispatcher;
    constructor(dispatcher) {
        this.dispatcher = dispatcher;
    }
    async sendMessage(id, body) {
        if (!body?.content || typeof body.content !== 'string') {
            return { error: 'content is required' };
        }
        const result = await this.dispatcher.dispatch(id, body.content.trim(), body.mode);
        return result.payload;
    }
};
exports.GatewayController = GatewayController;
__decorate([
    (0, common_1.Post)(':id/messages'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], GatewayController.prototype, "sendMessage", null);
exports.GatewayController = GatewayController = __decorate([
    (0, common_1.Controller)('conversations'),
    __metadata("design:paramtypes", [dispatcher_service_1.DispatcherService])
], GatewayController);
//# sourceMappingURL=gateway.controller.js.map