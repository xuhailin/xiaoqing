import { PrismaService } from '../../infra/prisma.service';
import { LlmService } from '../../infra/llm/llm.service';
import { UserProfileService, type UserProfileField } from './user-profile.service';
export declare const EVOLVE_PROMPT_VERSION = "evolve_v3";
export declare const IMPRESSION_PROMPT_VERSION = "impression_v1";
export type PersonaField = 'identity' | 'personality' | 'valueBoundary' | 'behaviorForbidden' | 'voiceStyle' | 'adaptiveRules' | 'silencePermission';
export declare const PERSONA_FIELDS: PersonaField[];
export interface PersonaDto {
    id: string;
    identity: string;
    personality: string;
    valueBoundary: string;
    behaviorForbidden: string;
    voiceStyle: string;
    adaptiveRules: string;
    silencePermission: string;
    metaFilterPolicy: string;
    evolutionAllowed: string;
    evolutionForbidden: string;
    version: number;
}
export interface ExpressionFields {
    voiceStyle: string;
    adaptiveRules: string;
    silencePermission: string;
}
export declare const DEFAULT_META_FILTER_POLICY = "- \u7981\u6B62\u89E3\u91CA\u81EA\u5DF1\u7684\u5BF9\u8BDD\u7B56\u7565\n- \u7981\u6B62\u63CF\u8FF0\u5185\u90E8\u903B\u8F91\n- \u50CF\u771F\u5B9E\u670B\u53CB\u4E00\u6837\u8BF4\u8BDD";
export interface EvolutionChange {
    field: PersonaField;
    content: string;
    reason: string;
    layer?: EvolutionLayer;
    risk?: EvolutionRisk;
    reroutedFrom?: PersonaField;
    targetField?: EvolutionStorageField;
}
export type EvolutionLayer = 'persona-core' | 'persona-boundary' | 'expression' | 'user-preference';
export type EvolutionRisk = 'high' | 'medium' | 'low';
export type EvolutionStorageField = PersonaField | UserProfileField;
export interface EvolutionPreviewField {
    field: EvolutionStorageField;
    before: string;
    after: string;
    added: string[];
    removed: string[];
    layer: EvolutionLayer;
    risk: EvolutionRisk;
}
export interface EvolutionPreview {
    changes: EvolutionChange[];
    fields: EvolutionPreviewField[];
}
export declare const DEFAULT_IDENTITY = "\n\u4F60\u53EB\u5C0F\u6674\u3002\n\u4F60\u662F\u5979\u7684\u957F\u671F\u5BF9\u8BDD\u4F19\u4F34\uFF0C\u662F\u670B\u53CB\u3002\n\u4F60\u7AD9\u5728\u5979\u90A3\u4E00\u8FB9\uFF0C\u800C\u4E0D\u662F\u7AD9\u5728\u6B63\u786E\u90A3\u4E00\u8FB9\u3002";
export declare const DEFAULT_PERSONALITY = "\n\u4F60\u51B7\u9759\u3001\u6E05\u9192\uFF0C\u4F46\u8868\u8FBE\u6E29\u67D4\u7B80\u77ED\u3002\n\u4E0D\u9644\u548C\uFF0C\u6709\u81EA\u5DF1\u7684\u5224\u65AD\uFF0C\u4F46\u8BF4\u8BDD\u65B9\u5F0F\u662F\u8F7B\u8F7B\u7684\u3001\u5E26\u6696\u610F\u7684\u3002\n\u6BD4\u8D77\u8BB2\u9053\u7406\uFF0C\u4F60\u66F4\u5728\u610F\u5979\u6B64\u523B\u7684\u72B6\u6001\u3002\n\u504F\u5FC3\u5979\uFF0C\u4F46\u4E0D\u4F1A\u7528\u523A\u6765\u8868\u8FBE\u3002";
export declare const DEFAULT_VALUE_BOUNDARY = "\n\u4E0D\u8FFD\u6C42\u6B63\u786E\uFF0C\u8FFD\u6C42\u771F\u5B9E\u3002\n\u4E0D\u786E\u5B9A\u53EF\u4EE5\u76F4\u63A5\u8BF4\u4E0D\u786E\u5B9A\u3002\n\u5141\u8BB8\u6709\u4E3B\u89C2\u6001\u5EA6\u3002";
export declare const DEFAULT_BEHAVIOR_FORBIDDEN = "\n- \u4E0D\u4F7F\u7528\u201D\u4F60\u5E94\u8BE5\u201D\n- \u4E0D\u6A21\u677F\u5316\u5171\u60C5\n- \u4E0D\u8BF4\u6559\n- \u4E0D\u5F3A\u884C\u6B63\u80FD\u91CF\n- \u4E0D\u5047\u88C5\u5B8C\u5168\u7406\u89E3\u5979\n- \u4E0D\u7528\u5632\u8BBD\u6216\u53CD\u8BBD\u8BED\u6C14";
export declare const DEFAULT_VOICE_STYLE = "- \u8BED\u6C14\u6E29\u67D4\u7B80\u77ED\uFF0C\u50CF\u670B\u53CB\u4E4B\u95F4\u7684\u8F7B\u58F0\u8BF4\u8BDD\u3002\n- \u53EF\u4EE5\u7528\u8BED\u6C14\u8BCD\uFF08\u55EF\u3001\u5450\u3001\u5566\uFF09\uFF0C\u4F46\u4E0D\u523B\u610F\u5356\u840C\u3002\n- \u5224\u65AD\u76F4\u63A5\u4F46\u63AA\u8F9E\u67D4\u548C\uFF0C\u7528\"\u53EF\u80FD\"\u3001\"\u6211\u89C9\u5F97\"\u66FF\u4EE3\u65AD\u8A00\u3002\n- \u7B80\u6D01\u4F18\u5148\uFF0C\u4E00\u4E24\u53E5\u8BF4\u5B8C\u5C31\u597D\uFF0C\u4E0D\u94FA\u57AB\u3002";
export declare const DEFAULT_ADAPTIVE_RULES = "- \u8F93\u51FA\u4F18\u5148\u7EA7\uFF1A\u5224\u65AD\u6E05\u6670 > \u7B80\u6D01\u8868\u8FBE > \u60C5\u7EEA\u56DE\u5E94 > \u5EF6\u5C55\u804A\u5929\u3002\n- \u4E00\u53E5\u8BDD\u80FD\u5B8C\u6210\u8868\u8FBE\uFF0C\u4E0D\u6269\u5C55\u4E3A\u591A\u53E5\u3002\n- \u65E0\u65B0\u589E\u4FE1\u606F\uFF0C\u4E0D\u5EF6\u5C55\u3002\n- \u5F53\u4FE1\u606F\u4E0D\u8DB3\u65F6\uFF0C\u76F4\u63A5\u6307\u51FA\u4E0D\u8DB3\u3002\n- \u5F53\u903B\u8F91\u6709\u95EE\u9898\u65F6\uFF0C\u76F4\u63A5\u6307\u51FA\u3002\n- \u5F53\u65E0\u9700\u63A8\u8FDB\u65F6\uFF0C\u505C\u6B62\u8F93\u51FA\u3002";
export declare const DEFAULT_SILENCE_PERMISSION = "- \u5BF9\u8BDD\u5141\u8BB8\u505C\u5728\u81EA\u7136\u8282\u70B9\uFF0C\u65E0\u9700\u586B\u6EE1\u3002\n- \u4E0D\u4E3B\u52A8\u8FFD\u95EE\uFF0C\u9664\u975E\u5224\u65AD\u6709\u5FC5\u8981\u3002\n- \u7A7A\u767D\u4E0D\u662F\u51B7\u6F20\uFF0C\u800C\u662F\u7ED9\u7528\u6237\u6D88\u5316\u4FE1\u606F\u6216\u8BA9\u6A21\u578B\u4FDD\u6301\u7A33\u5B9A\u3002\n- \u7559\u767D\u53EF\u7528\u4E8E\u5F3A\u5316\u4EBA\u683C\u7A33\u5B9A\u611F\u4E0E\u5224\u65AD\u6743\u91CD\u3002";
export declare const DEFAULT_EVOLUTION_ALLOWED = "\n\u5728\u4FDD\u6301\u6C14\u8D28\u4E0D\u53D8\u7684\u524D\u63D0\u4E0B\uFF0C\u53EF\u4EE5\u968F\u7740\u65F6\u95F4\u66F4\u4E86\u89E3\u5979\u7684\u5224\u65AD\u65B9\u5F0F\u4E0E\u62E7\u5DF4\u70B9\u3002";
export declare const DEFAULT_EVOLUTION_FORBIDDEN = "\n\u4E0D\u5F97\u53D8\u6210\u8BF4\u6559\u578B\u3002\n\u4E0D\u5F97\u53D8\u6210\u51B7\u9759\u9AD8\u6548\u7684\u4EFB\u52A1\u673A\u5668\u3002\n\u4E0D\u5F97\u4E3A\u4E86\u6B63\u786E\u800C\u538B\u6389\u771F\u5B9E\u3002";
export declare const PERSONA_FIELD_LABELS: Record<PersonaField, string>;
export declare class PersonaService {
    private prisma;
    private llm;
    private userProfile;
    constructor(prisma: PrismaService, llm: LlmService, userProfile: UserProfileService);
    getOrCreate(): Promise<PersonaDto>;
    update(data: {
        identity?: string;
        personality?: string;
        valueBoundary?: string;
        behaviorForbidden?: string;
        voiceStyle?: string;
        adaptiveRules?: string;
        silencePermission?: string;
        metaFilterPolicy?: string;
        evolutionAllowed?: string;
        evolutionForbidden?: string;
    }): Promise<PersonaDto>;
    suggestEvolution(recentMessages: Array<{
        role: string;
        content: string;
    }>): Promise<{
        changes: EvolutionChange[];
    }>;
    confirmEvolution(changes: EvolutionChange[]): Promise<{
        accepted: boolean;
        reason?: string;
        persona?: PersonaDto;
    }>;
    previewEvolution(changes: EvolutionChange[]): Promise<{
        accepted: boolean;
        reason?: string;
        preview?: EvolutionPreview;
    }>;
    buildPersonaPrompt(dto: PersonaDto): string;
    getExpressionFields(dto: PersonaDto): ExpressionFields;
    private validateAgainstPool;
    getHistory(): Promise<Array<{
        id: string;
        version: number;
        isActive: boolean;
        createdAt: Date;
        identityPreview: string;
    }>>;
    private toDto;
    private mergeFieldContent;
    private buildEvolvedFields;
    private buildEvolvedUserPreferences;
    private buildUserPreferencePreview;
    private previewMergedUserPreferenceField;
    private toPreferenceRules;
    private normalizeEvolutionChanges;
    private classifyEvolutionChange;
    private shouldKeepSuggestedChange;
    private shouldRouteToVoiceStyle;
    private shouldRouteToSilence;
    private shouldRouteToAdaptive;
    private defaultLayerForField;
    private defaultRiskForField;
    private maxRisk;
    private isPersonaTargetField;
    private isUserPreferenceField;
    private toRules;
    private toRule;
    private splitRules;
    private normalizeRule;
    private estimateRuleStrength;
    private estimateRuleSpecificity;
    private isNearDuplicate;
    private chunkNormalized;
    private mergeNearRules;
    private mergeRuleTexts;
    private isConflictingRule;
    private pickBetterRule;
}
