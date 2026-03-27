import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppService } from './app.service';
import { isFeatureEnabled } from './config/feature-flags';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  getHealth() {
    return {
      ok: true,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('app/mode')
  getAppMode() {
    return {
      devAgentEnabled: isFeatureEnabled(this.config, 'devAgent'),
      designAgentEnabled: isFeatureEnabled(this.config, 'designAgent'),
    };
  }
}
