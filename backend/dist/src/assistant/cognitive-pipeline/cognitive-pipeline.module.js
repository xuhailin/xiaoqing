"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CognitivePipelineModule = void 0;
const common_1 = require("@nestjs/common");
const cognitive_pipeline_service_1 = require("./cognitive-pipeline.service");
const cognitive_growth_service_1 = require("./cognitive-growth.service");
const boundary_governance_service_1 = require("./boundary-governance.service");
const growth_controller_1 = require("./growth.controller");
let CognitivePipelineModule = class CognitivePipelineModule {
};
exports.CognitivePipelineModule = CognitivePipelineModule;
exports.CognitivePipelineModule = CognitivePipelineModule = __decorate([
    (0, common_1.Module)({
        controllers: [growth_controller_1.GrowthController],
        providers: [cognitive_pipeline_service_1.CognitivePipelineService, cognitive_growth_service_1.CognitiveGrowthService, boundary_governance_service_1.BoundaryGovernanceService],
        exports: [cognitive_pipeline_service_1.CognitivePipelineService, cognitive_growth_service_1.CognitiveGrowthService, boundary_governance_service_1.BoundaryGovernanceService],
    })
], CognitivePipelineModule);
//# sourceMappingURL=cognitive-pipeline.module.js.map