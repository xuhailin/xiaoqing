export type ModelScenario = 'chat' | 'dev' | 'python' | 'reasoning' | 'summary';
export type ModelRoutingKey = 'chatModel' | 'devModel' | 'pythonModel' | 'reasoningModel' | 'summaryModel';
export interface ModelDefinition {
    id: string;
    displayName: string;
    provider: 'openai' | 'glm' | 'local' | 'other' | string;
    type: string;
    tags: string[];
    enabled: boolean;
}
export interface ModelRoutingConfig {
    models: ModelDefinition[];
    routing: Record<ModelRoutingKey, string>;
    scenarioRouting: Record<ModelScenario, ModelRoutingKey>;
}
export interface ResolvedScenarioModel {
    scenario: ModelScenario;
    routingKey: ModelRoutingKey;
    model: ModelDefinition;
    sourcePath: string;
    fallbackApplied: boolean;
}
export interface ModelFlowMappingItem {
    flow: string;
    scenario: ModelScenario;
    routingKey: ModelRoutingKey;
    entrypoints: string[];
    note?: string;
}
export interface ModelConfigReadView {
    readonly: true;
    source: {
        kind: 'file';
        path: string;
    };
    notice: string;
    models: ModelDefinition[];
    routing: Record<ModelRoutingKey, string>;
    scenarioRouting: Record<ModelScenario, ModelRoutingKey>;
    scenarios: Record<ModelScenario, {
        routingKey: ModelRoutingKey;
        modelId: string;
        displayName: string;
        provider: string;
        type: string;
        tags: string[];
        enabled: boolean;
        fallbackApplied: boolean;
    }>;
    flowMapping: ModelFlowMappingItem[];
}
