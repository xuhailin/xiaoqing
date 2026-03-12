import { ModelConfigService } from './model-config.service';
export declare class ModelConfigController {
    private readonly modelConfig;
    constructor(modelConfig: ModelConfigService);
    getModelConfig(): import("./model-config.types").ModelConfigReadView;
}
