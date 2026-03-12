"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostTurnPipeline = void 0;
const common_1 = require("@nestjs/common");
let PostTurnPipeline = class PostTurnPipeline {
    async runBeforeReturn(plan, runner) {
        for (const task of plan.beforeReturn) {
            await runner(task, plan);
        }
    }
    async runAfterReturn(plan, runner) {
        for (const task of plan.afterReturn) {
            await runner(task, plan);
        }
    }
};
exports.PostTurnPipeline = PostTurnPipeline;
exports.PostTurnPipeline = PostTurnPipeline = __decorate([
    (0, common_1.Injectable)()
], PostTurnPipeline);
//# sourceMappingURL=post-turn.pipeline.js.map