"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var CapabilityRegistry_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CapabilityRegistry = void 0;
const common_1 = require("@nestjs/common");
let CapabilityRegistry = CapabilityRegistry_1 = class CapabilityRegistry {
    logger = new common_1.Logger(CapabilityRegistry_1.name);
    capabilities = new Map();
    register(capability) {
        this.capabilities.set(capability.name, capability);
        this.logger.log(`Registered capability: ${capability.name} (taskIntent=${capability.taskIntent}, channels=${capability.channels.join(',')})`);
    }
    get(name) {
        return this.capabilities.get(name);
    }
    findByTaskIntent(taskIntent, channel) {
        for (const cap of this.capabilities.values()) {
            if (cap.taskIntent === taskIntent && cap.channels.includes(channel) && cap.isAvailable()) {
                return cap;
            }
        }
        return undefined;
    }
    listAvailable(channel) {
        return [...this.capabilities.values()].filter((c) => c.channels.includes(channel) && c.isAvailable());
    }
    listAll() {
        return [...this.capabilities.values()].map((c) => ({
            name: c.name,
            taskIntent: c.taskIntent,
            channels: c.channels,
            description: c.description,
        }));
    }
    buildCapabilityPrompt(channel) {
        const available = this.listAvailable(channel);
        if (available.length === 0)
            return '';
        const lines = available.map((c) => `- ${c.taskIntent}：${c.description}`);
        return lines.join('\n');
    }
};
exports.CapabilityRegistry = CapabilityRegistry;
exports.CapabilityRegistry = CapabilityRegistry = CapabilityRegistry_1 = __decorate([
    (0, common_1.Injectable)()
], CapabilityRegistry);
//# sourceMappingURL=capability-registry.service.js.map