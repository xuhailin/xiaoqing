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
exports.PetController = void 0;
const common_1 = require("@nestjs/common");
const rxjs_1 = require("rxjs");
const pet_service_1 = require("./pet.service");
let PetController = class PetController {
    petService;
    constructor(petService) {
        this.petService = petService;
    }
    stateStream() {
        return this.petService.getStateStream();
    }
    getState() {
        return { state: this.petService.getCurrentState() };
    }
    setState(body) {
        const validStates = ['idle', 'speaking', 'thinking'];
        const state = body.state;
        if (validStates.includes(state)) {
            this.petService.setState(state);
        }
        return { ok: true };
    }
};
exports.PetController = PetController;
__decorate([
    (0, common_1.Sse)('state-stream'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", rxjs_1.Observable)
], PetController.prototype, "stateStream", null);
__decorate([
    (0, common_1.Get)('state'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Object)
], PetController.prototype, "getState", null);
__decorate([
    (0, common_1.Post)('state'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Object)
], PetController.prototype, "setState", null);
exports.PetController = PetController = __decorate([
    (0, common_1.Controller)('pet'),
    __metadata("design:paramtypes", [pet_service_1.PetService])
], PetController);
//# sourceMappingURL=pet.controller.js.map