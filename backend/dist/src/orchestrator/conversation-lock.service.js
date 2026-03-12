"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var ConversationLockService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConversationLockService = void 0;
const common_1 = require("@nestjs/common");
let ConversationLockService = ConversationLockService_1 = class ConversationLockService {
    logger = new common_1.Logger(ConversationLockService_1.name);
    locks = new Map();
    async acquire(conversationId) {
        let mutex = this.locks.get(conversationId);
        if (!mutex) {
            mutex = new FifoMutex();
            this.locks.set(conversationId, mutex);
        }
        this.logger.debug(`Acquiring lock for conversation ${conversationId}`);
        await mutex.acquire();
        this.logger.debug(`Lock acquired for conversation ${conversationId}`);
        return () => {
            mutex.release();
            this.logger.debug(`Lock released for conversation ${conversationId}`);
            if (!mutex.isLocked && !mutex.hasWaiters) {
                this.locks.delete(conversationId);
            }
        };
    }
};
exports.ConversationLockService = ConversationLockService;
exports.ConversationLockService = ConversationLockService = ConversationLockService_1 = __decorate([
    (0, common_1.Injectable)()
], ConversationLockService);
class FifoMutex {
    _locked = false;
    _queue = [];
    get isLocked() {
        return this._locked;
    }
    get hasWaiters() {
        return this._queue.length > 0;
    }
    acquire() {
        if (!this._locked) {
            this._locked = true;
            return Promise.resolve();
        }
        return new Promise((resolve) => {
            this._queue.push(resolve);
        });
    }
    release() {
        if (this._queue.length > 0) {
            const next = this._queue.shift();
            next();
        }
        else {
            this._locked = false;
        }
    }
}
//# sourceMappingURL=conversation-lock.service.js.map