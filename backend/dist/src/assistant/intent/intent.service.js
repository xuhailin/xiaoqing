"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var IntentService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.IntentService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const llm_service_1 = require("../../infra/llm/llm.service");
const intent_1 = require("../prompts/intent");
const intent_types_1 = require("./intent.types");
let IntentService = class IntentService {
    static { IntentService_1 = this; }
    llm;
    contextRounds;
    perMessageMaxChars;
    constructor(llm, config) {
        this.llm = llm;
        this.contextRounds = Number(config.get('INTENT_CONTEXT_ROUNDS')) || 5;
        this.perMessageMaxChars = Number(config.get('INTENT_MESSAGE_MAX_CHARS')) || 500;
    }
    async recognize(recentMessages, currentUserInput, worldState, capabilityPrompt) {
        const recent = recentMessages
            .slice(-(this.contextRounds * 2))
            .map((m) => ({
            role: String(m.role),
            content: String(m.content ?? '').length > this.perMessageMaxChars
                ? String(m.content ?? '').slice(0, this.perMessageMaxChars) + '…'
                : String(m.content ?? ''),
        }));
        const contextText = recent.map((m) => `${m.role}: ${m.content}`).join('\n');
        const worldStateText = worldState && (worldState.city ?? worldState.timezone ?? worldState.language)
            ? [
                '当前默认世界状态（若本轮未显式变更，可作为默认前提参与判断与槽位补全）：',
                ...(worldState.city ? [`- city: ${worldState.city}`] : []),
                ...(worldState.timezone ? [`- timezone: ${worldState.timezone}`] : []),
                ...(worldState.language ? [`- language: ${worldState.language}`] : []),
            ].join('\n')
            : '当前默认世界状态：无';
        const capabilitySuffix = capabilityPrompt
            ? `\n\n【当前可用的本地能力】\n以下能力当前已配置并可用，taskIntent 应优先匹配这些值：\n${capabilityPrompt}\n- general_tool：其他工具型请求（未匹配到上述能力时使用）`
            : '';
        const messages = [
            {
                role: 'system',
                content: `[${intent_1.INTENT_PROMPT_VERSION}]\n${intent_1.INTENT_SYSTEM_PROMPT}${capabilitySuffix}`,
            },
            {
                role: 'user',
                content: `${worldStateText}\n\n最近对话：\n${contextText}\n\n本轮用户输入：\n${currentUserInput}`,
            },
        ];
        try {
            const raw = await this.llm.generate(messages, { scenario: 'reasoning' });
            return this.parseIntentState(raw);
        }
        catch {
            return intent_types_1.DEFAULT_INTENT_STATE;
        }
    }
    parseIntentState(raw) {
        const cleaned = String(raw ?? '')
            .replace(/```json\s*/gi, '')
            .replace(/```/g, '')
            .trim();
        const jsonStr = this.extractJsonObject(cleaned);
        if (!jsonStr)
            return intent_types_1.DEFAULT_INTENT_STATE;
        try {
            const parsed = JSON.parse(jsonStr);
            return this.normalize(parsed);
        }
        catch {
            return intent_types_1.DEFAULT_INTENT_STATE;
        }
    }
    extractJsonObject(text) {
        const start = text.indexOf('{');
        const end = text.lastIndexOf('}');
        if (start === -1 || end === -1 || end <= start)
            return null;
        return text.slice(start, end + 1);
    }
    normalize(input) {
        const rawInput = input;
        const mode = this.pickOne(input.mode, [
            'chat',
            'thinking',
            'decision',
            'task',
        ]) ?? intent_types_1.DEFAULT_INTENT_STATE.mode;
        const seriousness = this.pickOne(input.seriousness, [
            'casual',
            'semi',
            'focused',
        ]) ?? intent_types_1.DEFAULT_INTENT_STATE.seriousness;
        const expectation = this.pickOne(input.expectation, [
            '陪聊',
            '一起想',
            '直接给结果',
        ]) ?? intent_types_1.DEFAULT_INTENT_STATE.expectation;
        const agency = this.pickOne(input.agency, [
            '朋友',
            '并肩思考者',
            '顾问',
            '执行器',
        ]) ?? intent_types_1.DEFAULT_INTENT_STATE.agency;
        const parsedTaskIntent = this.pickOne(input.taskIntent, [
            'none',
            'weather_query',
            'book_download',
            'general_tool',
            'timesheet',
            'dev_task',
        ]);
        const legacyToolNeed = this.pickOne(rawInput.toolNeed, [
            'none',
            'memory',
            'openclaw',
            'task-system',
        ]);
        const taskIntent = parsedTaskIntent ??
            (legacyToolNeed === 'openclaw' ? 'general_tool' : intent_types_1.DEFAULT_INTENT_STATE.taskIntent);
        const requiresTool = typeof input.requiresTool === 'boolean'
            ? input.requiresTool
            : legacyToolNeed === 'openclaw' || taskIntent !== 'none';
        const escalation = this.pickOne(input.escalation, [
            '不推进',
            '可记录',
            '应转任务',
        ]) ?? intent_types_1.DEFAULT_INTENT_STATE.escalation;
        const confidenceRaw = typeof input.confidence === 'number' && Number.isFinite(input.confidence)
            ? input.confidence
            : intent_types_1.DEFAULT_INTENT_STATE.confidence;
        const confidence = Math.max(0, Math.min(1, confidenceRaw));
        const missingParams = Array.isArray(input.missingParams)
            ? input.missingParams.filter((p) => typeof p === 'string' && p.length > 0)
            : [];
        const suggestedToolAllowed = ['weather', 'book_download', 'timesheet'];
        const suggestedToolRaw = this.pickOne(input.suggestedTool, suggestedToolAllowed) ??
            this.pickOne(rawInput.preferredSkill, suggestedToolAllowed);
        const suggestedTool = suggestedToolRaw ??
            (taskIntent === 'weather_query' ? 'weather' : taskIntent === 'book_download' ? 'book_download' : taskIntent === 'timesheet' ? 'timesheet' : undefined);
        const normalizedTaskIntent = taskIntent === 'general_tool' && suggestedTool === 'weather'
            ? 'weather_query'
            : taskIntent === 'general_tool' && suggestedTool === 'book_download'
                ? 'book_download'
                : taskIntent === 'general_tool' && suggestedTool === 'timesheet'
                    ? 'timesheet'
                    : taskIntent;
        const slots = this.normalizeSlots(input.slots);
        const identityUpdate = this.normalizeIdentityUpdate(rawInput.identityUpdate);
        const worldStateUpdate = this.normalizeWorldStateUpdate(rawInput.worldStateUpdate);
        const detectedEmotion = this.pickOne(rawInput.detectedEmotion, ['calm', 'happy', 'low', 'anxious', 'irritated', 'tired', 'hurt', 'excited']);
        return {
            mode,
            seriousness,
            expectation,
            agency,
            requiresTool,
            taskIntent: normalizedTaskIntent,
            slots,
            escalation,
            confidence,
            missingParams,
            ...(suggestedTool !== undefined ? { suggestedTool } : {}),
            identityUpdate: identityUpdate ?? {},
            worldStateUpdate: worldStateUpdate ?? {},
            ...(detectedEmotion ? { detectedEmotion } : {}),
        };
    }
    normalizeIdentityUpdate(raw) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw))
            return undefined;
        const o = raw;
        const out = {};
        if (typeof o.city === 'string' && o.city.trim())
            out.city = o.city.trim();
        if (typeof o.timezone === 'string' && o.timezone.trim())
            out.timezone = o.timezone.trim();
        if (typeof o.language === 'string' && o.language.trim())
            out.language = o.language.trim();
        if (typeof o.conversationMode === 'string' && o.conversationMode.trim()) {
            out.conversationMode = o.conversationMode.trim();
        }
        return Object.keys(out).length > 0 ? out : undefined;
    }
    normalizeWorldStateUpdate(raw) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw))
            return undefined;
        const o = raw;
        const out = {};
        if (typeof o.city === 'string' && o.city.trim())
            out.city = o.city.trim();
        if (typeof o.timezone === 'string' && o.timezone.trim())
            out.timezone = o.timezone.trim();
        if (typeof o.language === 'string' && o.language.trim())
            out.language = o.language.trim();
        if (typeof o.device === 'string' && o.device.trim())
            out.device = o.device.trim();
        if (typeof o.conversationMode === 'string' && o.conversationMode.trim()) {
            out.conversationMode = o.conversationMode.trim();
        }
        return Object.keys(out).length > 0 ? out : undefined;
    }
    pickOne(value, allowed) {
        if (typeof value !== 'string')
            return null;
        return allowed.includes(value) ? value : null;
    }
    static COORD_REGEX = /^-?\d+(\.\d{1,2})?,\s*-?\d+(\.\d{1,2})?$/;
    normalizeSlots(raw) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw))
            return {};
        const input = raw;
        const slots = {};
        if (typeof input.city === 'string' && input.city.trim()) {
            slots.city = input.city.trim();
        }
        if (typeof input.district === 'string' && input.district.trim()) {
            slots.district = input.district.trim();
        }
        if (typeof input.dateLabel === 'string' && input.dateLabel.trim()) {
            slots.dateLabel = input.dateLabel.trim();
        }
        if (typeof input.bookName === 'string' && input.bookName.trim()) {
            slots.bookName = input.bookName.trim();
        }
        if (typeof input.bookChoiceIndex === 'number' && Number.isInteger(input.bookChoiceIndex) && input.bookChoiceIndex >= 0) {
            slots.bookChoiceIndex = input.bookChoiceIndex;
        }
        const timesheetActionAllowed = ['preview', 'confirm', 'submit', 'query_missing'];
        const tsAction = this.pickOne(input.timesheetAction, timesheetActionAllowed);
        if (tsAction)
            slots.timesheetAction = tsAction;
        if (typeof input.timesheetDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.timesheetDate.trim())) {
            slots.timesheetDate = input.timesheetDate.trim();
        }
        if (typeof input.timesheetMonth === 'string' && /^\d{4}-\d{2}$/.test(input.timesheetMonth.trim())) {
            slots.timesheetMonth = input.timesheetMonth.trim();
        }
        if (typeof input.timesheetRawOverride === 'string' && input.timesheetRawOverride.trim()) {
            slots.timesheetRawOverride = input.timesheetRawOverride.trim();
        }
        const locRaw = typeof input.location === 'string' ? input.location.trim() : '';
        if (locRaw && IntentService_1.COORD_REGEX.test(locRaw)) {
            slots.location = locRaw;
        }
        const lat = typeof input.latitude === 'string' ? input.latitude.trim() : (typeof input.lat === 'string' ? input.lat.trim() : '');
        const lon = typeof input.longitude === 'string' ? input.longitude.trim() : (typeof input.lon === 'string' ? input.lon.trim() : '');
        if (lat && lon && IntentService_1.COORD_REGEX.test(`${lon},${lat}`)) {
            slots.location = `${lon},${lat}`;
        }
        return slots;
    }
};
exports.IntentService = IntentService;
exports.IntentService = IntentService = IntentService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [llm_service_1.LlmService,
        config_1.ConfigService])
], IntentService);
//# sourceMappingURL=intent.service.js.map