import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export type ModelScenario = 'chat' | 'dev' | 'python' | 'reasoning' | 'summary';
export type ModelRoutingKey =
  | 'chatModel'
  | 'devModel'
  | 'pythonModel'
  | 'reasoningModel'
  | 'summaryModel';

export interface ModelDefinition {
  id: string;
  displayName: string;
  provider: string;
  type: string;
  tags: string[];
  enabled: boolean;
}

export interface ModelScenarioView {
  routingKey: ModelRoutingKey;
  modelId: string;
  displayName: string;
  provider: string;
  type: string;
  tags: string[];
  enabled: boolean;
  fallbackApplied: boolean;
}

export interface ModelFlowMappingItem {
  flow: string;
  scenario: ModelScenario;
  routingKey: ModelRoutingKey;
  entrypoints: string[];
  note?: string;
}

export interface ModelConfigView {
  readonly: true;
  source: {
    kind: 'file';
    path: string;
  };
  notice: string;
  models: ModelDefinition[];
  routing: Record<ModelRoutingKey, string>;
  scenarioRouting: Record<ModelScenario, ModelRoutingKey>;
  scenarios: Record<ModelScenario, ModelScenarioView>;
  flowMapping: ModelFlowMappingItem[];
}

@Injectable({ providedIn: 'root' })
export class ModelConfigService {
  private readonly base = `${environment.apiUrl}/system/model-config`;

  constructor(private readonly http: HttpClient) {}

  getConfig() {
    return this.http.get<ModelConfigView>(this.base);
  }
}
