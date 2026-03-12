"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClaimEngineModule = void 0;
const common_1 = require("@nestjs/common");
const claim_engine_config_1 = require("./claim-engine.config");
const claim_store_service_1 = require("./claim-store.service");
const claim_update_service_1 = require("./claim-update.service");
const session_state_service_1 = require("./session-state.service");
const claim_selector_service_1 = require("./claim-selector.service");
let ClaimEngineModule = class ClaimEngineModule {
};
exports.ClaimEngineModule = ClaimEngineModule;
exports.ClaimEngineModule = ClaimEngineModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        providers: [
            claim_engine_config_1.ClaimEngineConfig,
            claim_store_service_1.ClaimStoreService,
            claim_update_service_1.ClaimUpdateService,
            session_state_service_1.SessionStateService,
            claim_selector_service_1.ClaimSelectorService,
        ],
        exports: [
            claim_engine_config_1.ClaimEngineConfig,
            claim_store_service_1.ClaimStoreService,
            claim_update_service_1.ClaimUpdateService,
            session_state_service_1.SessionStateService,
            claim_selector_service_1.ClaimSelectorService,
        ],
    })
], ClaimEngineModule);
//# sourceMappingURL=claim-engine.module.js.map