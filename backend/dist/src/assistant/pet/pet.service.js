"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PetService = void 0;
const common_1 = require("@nestjs/common");
const rxjs_1 = require("rxjs");
let PetService = class PetService {
    state$ = new rxjs_1.BehaviorSubject('idle');
    idleTimer = null;
    getStateStream() {
        return this.state$.pipe((0, rxjs_1.map)((state) => ({
            data: JSON.stringify({ state, timestamp: Date.now() }),
            type: 'state',
        })));
    }
    setState(state) {
        this.clearIdleTimer();
        this.state$.next(state);
    }
    setStateWithAutoIdle(state, delayMs = 3000) {
        this.clearIdleTimer();
        this.state$.next(state);
        this.idleTimer = setTimeout(() => {
            this.state$.next('idle');
            this.idleTimer = null;
        }, delayMs);
    }
    getCurrentState() {
        return this.state$.getValue();
    }
    clearIdleTimer() {
        if (this.idleTimer) {
            clearTimeout(this.idleTimer);
            this.idleTimer = null;
        }
    }
};
exports.PetService = PetService;
exports.PetService = PetService = __decorate([
    (0, common_1.Injectable)()
], PetService);
//# sourceMappingURL=pet.service.js.map