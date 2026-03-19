import { Controller, Get } from '@nestjs/common';
import { SystemSelfService } from './system-self.service';

@Controller('system')
export class SystemSelfController {
  constructor(private readonly systemSelf: SystemSelfService) {}

  @Get('self')
  getSystemSelf() {
    return this.systemSelf.getSystemSelf();
  }

  @Get('overview')
  getSettingsOverview() {
    return this.systemSelf.getSettingsOverview();
  }
}
