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
var TimesheetSkillService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TimesheetSkillService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const prisma_service_1 = require("../../../infra/prisma.service");
const timesheet_executor_1 = require("./timesheet.executor");
const timesheet_config_1 = require("./timesheet.config");
const git_log_reader_1 = require("./git-log.reader");
let TimesheetSkillService = TimesheetSkillService_1 = class TimesheetSkillService {
    config;
    prisma;
    logger = new common_1.Logger(TimesheetSkillService_1.name);
    featureEnabled;
    loginId;
    name = 'timesheet';
    taskIntent = 'timesheet';
    channels = ['chat'];
    description = '工时上报（填工时、录入工时、查询未录入工时等）';
    constructor(config, prisma) {
        this.config = config;
        this.prisma = prisma;
        this.featureEnabled = config.get('FEATURE_TIMESHEET') === 'true';
        this.loginId = config.get('TIMESHEET_LOGIN_ID') || '';
    }
    isAvailable() {
        return this.featureEnabled && Boolean(this.loginId);
    }
    async execute(request) {
        const adapted = this.parseParams(request.params);
        if (!adapted) {
            return { success: false, content: null, error: 'timesheet params invalid' };
        }
        const result = await this.executeTimesheet(adapted);
        return {
            success: result.success,
            content: result.content || null,
            error: result.error ?? null,
            meta: {
                ...(result.submittedProjects && { submittedProjects: result.submittedProjects }),
                ...(result.totalHours != null && { totalHours: result.totalHours }),
                ...(result.previewEntries && { previewEntries: result.previewEntries }),
            },
        };
    }
    async executeTimesheet(params) {
        if (!this.isAvailable()) {
            return { success: false, content: '', error: '工时上报功能未启用或未配置凭证' };
        }
        if (params.action === 'preview') {
            return this.previewTimesheet(params.targetDate);
        }
        if (params.action === 'confirm') {
            return this.confirmTimesheet(params.targetDate, params.rawOverride);
        }
        if (params.action === 'query_missing') {
            return this.queryMissingDates(params.targetMonth);
        }
        if (params.action === 'submit') {
            return this.submitTimesheet(params.targetDate);
        }
        return { success: false, content: '', error: `不支持的操作: ${params.action}` };
    }
    async previewTimesheet(targetDate) {
        const date = targetDate || this.todayString();
        const existing = await this.prisma.timesheetRecord.findUnique({
            where: { date: new Date(date) },
        });
        if (existing) {
            return {
                success: true,
                content: `${date} 的工时已经提交过了，无需重复提交。`,
            };
        }
        const mappings = this.loadMappings();
        if (!mappings) {
            return { success: false, content: '', error: '项目映射配置加载失败' };
        }
        const gitConfig = (0, timesheet_config_1.getTimesheetConfig)();
        const entries = [];
        for (const mapping of mappings) {
            try {
                const logEntry = (0, git_log_reader_1.readGitLogForDate)(mapping.repoPath, date, gitConfig.gitAuthor || undefined);
                if (logEntry.commits.length > 0) {
                    entries.push({
                        rdProjectCode: mapping.rdProjectCode,
                        customerProjectCode: mapping.customerProjectCode,
                        displayName: mapping.displayName,
                        commits: logEntry.commits,
                        suggestedHours: 0,
                    });
                }
            }
            catch (e) {
                this.logger.warn(`读取 ${mapping.displayName} git log 失败: ${e}`);
            }
        }
        if (entries.length === 0) {
            return {
                success: true,
                content: `${date} 没有检测到任何项目的 git 提交记录。\n你可以手动指定，例如：「住院医生 松江现场支持 8」`,
                previewEntries: [],
            };
        }
        const hoursList = (0, git_log_reader_1.distributeHours)(entries.length);
        for (let i = 0; i < entries.length && i < hoursList.length; i++) {
            entries[i].suggestedHours = hoursList[i];
        }
        const lines = [`📋 ${date} 工时预览（已分配）：`, ''];
        for (let i = 0; i < entries.length; i++) {
            const entry = entries[i];
            lines.push(`${i + 1}. ${entry.displayName}：${entry.suggestedHours}h`);
            for (const commit of entry.commits.slice(0, 3)) {
                lines.push(`   - ${commit}`);
            }
            if (entry.commits.length > 3) {
                lines.push(`   - …其余 ${entry.commits.length - 3} 条`);
            }
            lines.push('');
        }
        const totalHours = entries.reduce((sum, e) => sum + e.suggestedHours, 0);
        lines.push(`合计：${totalHours}h`);
        lines.push('');
        lines.push('确认无误请回复「确认」。');
        lines.push('如需修改，请按行发送：项目名 工作内容 工时（例：住院医生 松江现场支持 8）');
        return {
            success: true,
            content: lines.join('\n'),
            previewEntries: entries,
            totalHours,
        };
    }
    async confirmTimesheet(targetDate, rawOverride) {
        const date = targetDate || this.todayString();
        const existing = await this.prisma.timesheetRecord.findUnique({
            where: { date: new Date(date) },
        });
        if (existing) {
            return {
                success: false,
                content: `${date} 的工时已经提交过了。`,
                error: '该日期工时已提交',
            };
        }
        const mappings = this.loadMappings();
        if (!mappings) {
            return { success: false, content: '', error: '项目映射配置加载失败' };
        }
        if (rawOverride && rawOverride.trim()) {
            const overrides = this.parseRawOverride(rawOverride, mappings);
            if (overrides.length === 0) {
                return {
                    success: false,
                    content: '无法识别你的修改内容。请使用格式：「项目名 工作内容 工时」，例如「住院医生 松江现场支持 8」',
                    error: '解析用户修改失败',
                };
            }
            return this.submitWithOverrides(date, overrides, mappings);
        }
        return this.submitTimesheet(date);
    }
    async submitWithOverrides(date, overrides, mappings) {
        try {
            const result = await (0, timesheet_executor_1.executeTimesheetWorkflow)(date, { overrides, mappings });
            if (result.ok && result.submittedProjects) {
                await this.prisma.timesheetRecord.create({
                    data: {
                        date: new Date(date),
                        totalHours: result.totalHours ?? 8,
                        projectsSummary: result.submittedProjects,
                    },
                });
                this.logger.log(`工时已提交(用户确认): ${date}, ${result.totalHours}h`);
            }
            else {
                this.logger.warn(`工时上报失败: ${date}, ${result.message}`);
            }
            return {
                success: result.ok,
                content: result.message,
                error: result.ok ? undefined : this.buildExternalSubmitError(result.message),
                submittedProjects: result.submittedProjects,
                totalHours: result.totalHours,
            };
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            this.logger.error(`工时上报异常: ${msg}`);
            return { success: false, content: '', error: msg };
        }
    }
    parseRawOverride(raw, mappings) {
        const lines = raw.split(/[\n;；]/).map((l) => l.trim()).filter(Boolean);
        const result = [];
        for (const line of lines) {
            const entry = this.parseSingleOverrideLine(line, mappings);
            if (entry)
                result.push(entry);
        }
        return result;
    }
    parseSingleOverrideLine(line, mappings) {
        const hoursMatch = line.match(/\s+(\d+(?:\.\d+)?)\s*[hH小时]?\s*$/);
        if (!hoursMatch)
            return null;
        const hours = parseFloat(hoursMatch[1]);
        if (hours <= 0 || hours > 24)
            return null;
        const beforeHours = line.slice(0, hoursMatch.index).trim();
        if (!beforeHours)
            return null;
        const parts = beforeHours.split(/\s+/);
        const projectHint = parts[0];
        const content = parts.length > 1 ? parts.slice(1).join(' ') : undefined;
        const matched = this.fuzzyMatchProject(projectHint, mappings);
        if (!matched)
            return null;
        return {
            displayName: matched.displayName,
            content,
            hours,
        };
    }
    fuzzyMatchProject(hint, mappings) {
        if (!hint)
            return null;
        const h = hint.toLowerCase();
        const exact = mappings.find((m) => m.displayName.toLowerCase() === h);
        if (exact)
            return exact;
        const contains = mappings.filter((m) => m.displayName.toLowerCase().includes(h));
        if (contains.length === 1)
            return contains[0];
        let bestScore = 0;
        let bestMapping = null;
        for (const mapping of mappings) {
            const name = mapping.displayName.toLowerCase();
            const score = this.overlapScore(h, name);
            if (score > bestScore) {
                bestScore = score;
                bestMapping = mapping;
            }
        }
        if (bestMapping && bestScore >= h.length * 0.5) {
            return bestMapping;
        }
        if (mappings.length === 1)
            return mappings[0];
        return null;
    }
    overlapScore(a, b) {
        let score = 0;
        const bChars = new Set(b.split(''));
        for (const ch of a) {
            if (bChars.has(ch))
                score++;
        }
        return score;
    }
    async submitTimesheet(targetDate) {
        const date = targetDate || this.todayString();
        if (!date) {
            return { success: false, content: '', error: '缺少目标日期' };
        }
        const existing = await this.prisma.timesheetRecord.findUnique({
            where: { date: new Date(date) },
        });
        if (existing) {
            return {
                success: false,
                content: `${date} 的工时已经提交过了。`,
                error: '该日期工时已提交',
            };
        }
        try {
            const result = await (0, timesheet_executor_1.executeTimesheetWorkflow)(date);
            if (result.ok && result.submittedProjects) {
                await this.prisma.timesheetRecord.create({
                    data: {
                        date: new Date(date),
                        totalHours: result.totalHours ?? 8,
                        projectsSummary: result.submittedProjects,
                    },
                });
                this.logger.log(`工时已提交: ${date}, ${result.totalHours}h`);
            }
            else {
                this.logger.warn(`工时上报失败: ${date}, ${result.message}`);
            }
            return {
                success: result.ok,
                content: result.message,
                error: result.ok ? undefined : this.buildExternalSubmitError(result.message),
                submittedProjects: result.submittedProjects,
                totalHours: result.totalHours,
            };
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            this.logger.error(`工时上报异常: ${msg}`);
            return { success: false, content: '', error: msg };
        }
    }
    async queryMissingDates(targetMonth) {
        const month = targetMonth || this.currentMonthString();
        const [year, mon] = month.split('-').map(Number);
        if (!year || !mon) {
            return { success: false, content: '', error: `无效月份: ${month}` };
        }
        const workdays = this.getWorkdaysInMonth(year, mon);
        const startDate = new Date(`${month}-01`);
        const endDate = new Date(year, mon, 1);
        const records = await this.prisma.timesheetRecord.findMany({
            where: {
                date: { gte: startDate, lt: endDate },
            },
            select: { date: true },
        });
        const submittedDates = new Set(records.map((r) => this.formatDate(r.date)));
        const today = this.todayString();
        const missingDates = workdays.filter((d) => d <= today && !submittedDates.has(d));
        if (missingDates.length === 0) {
            return {
                success: true,
                content: `${month} 截至今天的工作日工时均已通过本工具提交。（注意：仅统计通过本工具提交的记录）`,
            };
        }
        const content = [
            `${month} 有 ${missingDates.length} 天工作日未通过本工具提交工时：`,
            missingDates.join('、'),
            '（注意：仅统计通过本工具提交的记录，手动在 OA 录入的不计入）',
        ].join('\n');
        return { success: true, content };
    }
    loadMappings() {
        try {
            const cfg = (0, timesheet_config_1.getTimesheetConfig)();
            return (0, timesheet_config_1.loadProjectMappings)(cfg.projectsConfigPath);
        }
        catch (e) {
            this.logger.error(`加载项目映射失败: ${e}`);
            return null;
        }
    }
    getWorkdaysInMonth(year, month) {
        const days = [];
        const daysInMonth = new Date(year, month, 0).getDate();
        for (let d = 1; d <= daysInMonth; d++) {
            const date = new Date(year, month - 1, d);
            const dayOfWeek = date.getDay();
            if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                days.push(this.formatDate(date));
            }
        }
        return days;
    }
    todayString() {
        return this.formatDate(new Date());
    }
    currentMonthString() {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }
    formatDate(d) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }
    buildExternalSubmitError(rawMessage) {
        const msg = String(rawMessage ?? '').trim();
        if (!msg)
            return '工时上报失败';
        if (msg.includes('已录入过该日期的工时')) {
            return `OA 提示该日期已录入工时（非本地 TimesheetRecord 判重）：${msg}`;
        }
        return msg;
    }
    parseParams(params) {
        const action = typeof params.timesheetAction === 'string' ? params.timesheetAction.trim() : '';
        if (action !== 'preview' && action !== 'confirm' && action !== 'submit' && action !== 'query_missing')
            return null;
        const targetDate = typeof params.timesheetDate === 'string' ? params.timesheetDate.trim() : undefined;
        const targetMonth = typeof params.timesheetMonth === 'string' ? params.timesheetMonth.trim() : undefined;
        const rawOverride = typeof params.rawOverride === 'string'
            ? params.rawOverride.trim()
            : (typeof params.timesheetRawOverride === 'string' ? params.timesheetRawOverride.trim() : undefined);
        return {
            action,
            ...(targetDate && { targetDate }),
            ...(targetMonth && { targetMonth }),
            ...(rawOverride && { rawOverride }),
        };
    }
};
exports.TimesheetSkillService = TimesheetSkillService;
exports.TimesheetSkillService = TimesheetSkillService = TimesheetSkillService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        prisma_service_1.PrismaService])
], TimesheetSkillService);
//# sourceMappingURL=timesheet-skill.service.js.map