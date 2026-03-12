import { Global, Module } from '@nestjs/common';
import { ClaimEngineConfig } from './claim-engine.config';
import { ClaimStoreService } from './claim-store.service';
import { ClaimUpdateService } from './claim-update.service';
import { SessionStateService } from './session-state.service';
import { ClaimSelectorService } from './claim-selector.service';

@Global()
@Module({
  providers: [
    ClaimEngineConfig,
    ClaimStoreService,
    ClaimUpdateService,
    SessionStateService,
    ClaimSelectorService,
  ],
  exports: [
    ClaimEngineConfig,
    ClaimStoreService,
    ClaimUpdateService,
    SessionStateService,
    ClaimSelectorService,
  ],
})
export class ClaimEngineModule {}
