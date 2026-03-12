import type { ModelConfigReadView, ModelScenario, ResolvedScenarioModel } from './model-config.types';
export declare class ModelConfigService {
    private readonly logger;
    private cachedPath;
    private cachedMtimeMs;
    private cachedConfig;
    resolveScenarioModel(scenario: ModelScenario): ResolvedScenarioModel;
    getReadView(): ModelConfigReadView;
    private buildFlowMapping;
    private loadConfig;
    private findConfigPath;
    private safeMtimeMs;
    private readConfigFile;
    private normalizeConfig;
    private normalizeModels;
    private normalizeSingleModel;
    private normalizeRouting;
    private normalizeScenarioRouting;
    private findEnabledModel;
    private createFallbackModel;
    private asRecord;
}
