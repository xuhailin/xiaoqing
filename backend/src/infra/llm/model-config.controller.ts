import { Controller, Get } from '@nestjs/common';
import { ModelConfigService } from './model-config.service';

@Controller('system')
export class ModelConfigController {
  constructor(private readonly modelConfig: ModelConfigService) {}

  @Get('model-config')
  getModelConfig() {
    return this.modelConfig.getReadView();
  }
}
