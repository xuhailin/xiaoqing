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
exports.ModelConfigController = void 0;
const common_1 = require("@nestjs/common");
const model_config_service_1 = require("./model-config.service");
let ModelConfigController = class ModelConfigController {
    modelConfig;
    constructor(modelConfig) {
        this.modelConfig = modelConfig;
    }
    getModelConfig() {
        return this.modelConfig.getReadView();
    }
};
exports.ModelConfigController = ModelConfigController;
__decorate([
    (0, common_1.Get)('model-config'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ModelConfigController.prototype, "getModelConfig", null);
exports.ModelConfigController = ModelConfigController = __decorate([
    (0, common_1.Controller)('system'),
    __metadata("design:paramtypes", [model_config_service_1.ModelConfigService])
], ModelConfigController);
//# sourceMappingURL=model-config.controller.js.map