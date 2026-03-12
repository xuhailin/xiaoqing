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
var DispatcherService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DispatcherService = void 0;
const common_1 = require("@nestjs/common");
const message_router_service_1 = require("../gateway/message-router.service");
const conversation_lock_service_1 = require("./conversation-lock.service");
const agent_interface_1 = require("./agent.interface");
let DispatcherService = DispatcherService_1 = class DispatcherService {
    router;
    lock;
    logger = new common_1.Logger(DispatcherService_1.name);
    agentMap;
    constructor(router, lock, agents) {
        this.router = router;
        this.lock = lock;
        this.agentMap = new Map(agents.map((a) => [a.channel, a]));
        this.logger.log(`Dispatcher initialized with agents: [${[...this.agentMap.keys()].join(', ')}]`);
    }
    async dispatch(conversationId, content, mode) {
        const decision = await this.router.route(content, mode);
        this.logger.log(`Dispatch: conv=${conversationId} channel=${decision.channel} reason="${decision.reason}"`);
        const agent = this.agentMap.get(decision.channel);
        if (!agent) {
            throw new Error(`No agent registered for channel "${decision.channel}"`);
        }
        const release = await this.lock.acquire(conversationId);
        try {
            const req = {
                conversationId,
                content: decision.content,
                mode: decision.channel,
            };
            return await agent.handle(req);
        }
        finally {
            release();
        }
    }
};
exports.DispatcherService = DispatcherService;
exports.DispatcherService = DispatcherService = DispatcherService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(2, (0, common_1.Inject)(agent_interface_1.AGENT_TOKEN)),
    __metadata("design:paramtypes", [message_router_service_1.MessageRouterService,
        conversation_lock_service_1.ConversationLockService, Array])
], DispatcherService);
//# sourceMappingURL=dispatcher.service.js.map