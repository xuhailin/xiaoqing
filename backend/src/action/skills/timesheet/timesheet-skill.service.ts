import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../infra/prisma.service';
import type { ICapability } from '../../capability.interface';
import type { CapabilityRequest, CapabilityResult } from '../../capability.types';
import type { MessageChannel } from '../../../gateway/message-router.types';
import { executeTimesheetWorkflow } from './timesheet.executor';
import { loadProjectMappings, getTimesheetConfig, type TimesheetProjectMapping } from './timesheet.config';
import { readGitLogForDate, distributeHours } from './git-log.reader';
import type {
  TimesheetSkillExecuteParams,
  TimesheetSkillResult,
  TimesheetPreviewEntry,
  TimesheetOverrideEntry,
} from './timesheet-skill.types';

@Injectable()
export class TimesheetSkillService implements ICapability {
  private readonly logger = new Logger(TimesheetSkillService.name);
  private readonly featureEnabled: boolean;
  private readonly loginId: string;

  // ── ICapability 元数据 ──────────────────────────────────
  readonly name = 'timesheet';
  readonly taskIntent = 'timesheet';
  readonly channels: MessageChannel[] = ['chat'];
  readonly description = '工时上报（填工时、录入工时、查询未录入工时等）';
  readonly surface = 'assistant' as const;
  readonly scope = 'private' as const;
  readonly portability = 'environment-bound' as const;
  readonly requiresAuth = true;
  readonly requiresUserContext = true;
  readonly visibility = 'optional' as const;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.featureEnabled = config.get('FEATURE_TIMESHEET') === 'true';
    this.loginId = config.get('TIMESHEET_LOGIN_ID') || '';
  }

  isAvailable(): boolean {
    return this.featureEnabled && Boolean(this.loginId);
  }

  // ── ICapability.execute — 统一入口 ─────────────────────
  async execute(request: CapabilityRequest): Promise<CapabilityResult> {
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

  async executeTimesheet(params: TimesheetSkillExecuteParams): Promise<TimesheetSkillResult> {
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

  // ─── Preview：只读 git log，不提交 ───────────────────────────
  private async previewTimesheet(targetDate?: string): Promise<TimesheetSkillResult> {
    const date = targetDate || this.todayString();

    // 检查是否已提交过
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

    const gitConfig = getTimesheetConfig();
    const entries: TimesheetPreviewEntry[] = [];

    for (const mapping of mappings) {
      try {
        const logEntry = readGitLogForDate(mapping.repoPath, date, gitConfig.gitAuthor || undefined);
        if (logEntry.commits.length > 0) {
          entries.push({
            rdProjectCode: mapping.rdProjectCode,
            customerProjectCode: mapping.customerProjectCode,
            displayName: mapping.displayName,
            commits: logEntry.commits,
            suggestedHours: 0, // 稍后分配
          });
        }
      } catch (e) {
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

    // 分配工时
    const hoursList = distributeHours(entries.length);
    for (let i = 0; i < entries.length && i < hoursList.length; i++) {
      entries[i].suggestedHours = hoursList[i];
    }

    // 构建预览文本（结构化列表，便于用户快速确认/修改）
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

  // ─── Confirm：解析用户修改 → 提交 ──────────────────────────
  private async confirmTimesheet(targetDate?: string, rawOverride?: string): Promise<TimesheetSkillResult> {
    const date = targetDate || this.todayString();

    // 检查是否已提交过
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

    // 如果有 rawOverride，解析用户修改；否则使用 git log 默认数据
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

    // 无修改，直接用 git log 数据提交
    return this.submitTimesheet(date);
  }

  // ─── 用户覆盖提交 ──────────────────────────────────────────
  private async submitWithOverrides(
    date: string,
    overrides: TimesheetOverrideEntry[],
    mappings: TimesheetProjectMapping[],
  ): Promise<TimesheetSkillResult> {
    try {
      const result = await executeTimesheetWorkflow(date, { overrides, mappings });

      if (result.ok && result.submittedProjects) {
        await this.prisma.timesheetRecord.create({
          data: {
            date: new Date(date),
            totalHours: result.totalHours ?? 8,
            projectsSummary: result.submittedProjects as any,
          },
        });
        this.logger.log(`工时已提交(用户确认): ${date}, ${result.totalHours}h`);
      } else {
        this.logger.warn(`工时上报失败: ${date}, ${result.message}`);
      }

      return {
        success: result.ok,
        content: result.message,
        error: result.ok ? undefined : this.buildExternalSubmitError(result.message),
        submittedProjects: result.submittedProjects,
        totalHours: result.totalHours,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(`工时上报异常: ${msg}`);
      return { success: false, content: '', error: msg };
    }
  }

  // ─── 解析用户修改文本 ─────────────────────────────────────
  /**
   * 解析用户的原始修改文本，支持多行或单行：
   * - "住院医生 松江现场支持 8"
   * - "住院医生 8" (只改工时，内容用 git log)
   * - 多行: "住院医生 松江支持 4\n另一个项目 开发 4"
   */
  parseRawOverride(raw: string, mappings: TimesheetProjectMapping[]): TimesheetOverrideEntry[] {
    const lines = raw.split(/[\n;；]/).map((l) => l.trim()).filter(Boolean);
    const result: TimesheetOverrideEntry[] = [];

    for (const line of lines) {
      const entry = this.parseSingleOverrideLine(line, mappings);
      if (entry) result.push(entry);
    }

    return result;
  }

  private parseSingleOverrideLine(
    line: string,
    mappings: TimesheetProjectMapping[],
  ): TimesheetOverrideEntry | null {
    // 从末尾提取工时数字
    const hoursMatch = line.match(/\s+(\d+(?:\.\d+)?)\s*[hH小时]?\s*$/);
    if (!hoursMatch) return null;

    const hours = parseFloat(hoursMatch[1]);
    if (hours <= 0 || hours > 24) return null;

    const beforeHours = line.slice(0, hoursMatch.index!).trim();
    if (!beforeHours) return null;

    // 分离项目名和工作内容：第一个空格/空白分隔
    const parts = beforeHours.split(/\s+/);
    const projectHint = parts[0];
    const content = parts.length > 1 ? parts.slice(1).join(' ') : undefined;

    // 模糊匹配项目
    const matched = this.fuzzyMatchProject(projectHint, mappings);
    if (!matched) return null;

    return {
      displayName: matched.displayName,
      content,
      hours,
    };
  }

  // ─── 模糊匹配项目 ──────────────────────────────────────────
  /**
   * 模糊匹配：支持缩写、部分匹配
   * "住院医生" → "住院医师工作站"
   * "住院" → "住院医师工作站"
   */
  fuzzyMatchProject(hint: string, mappings: TimesheetProjectMapping[]): TimesheetProjectMapping | null {
    if (!hint) return null;
    const h = hint.toLowerCase();

    // 1. 精确匹配 displayName
    const exact = mappings.find((m) => m.displayName.toLowerCase() === h);
    if (exact) return exact;

    // 2. displayName 包含 hint
    const contains = mappings.filter((m) => m.displayName.toLowerCase().includes(h));
    if (contains.length === 1) return contains[0];

    // 3. 字符重叠度打分
    let bestScore = 0;
    let bestMapping: TimesheetProjectMapping | null = null;

    for (const mapping of mappings) {
      const name = mapping.displayName.toLowerCase();
      const score = this.overlapScore(h, name);
      if (score > bestScore) {
        bestScore = score;
        bestMapping = mapping;
      }
    }

    // 至少 50% 的 hint 字符出现在 displayName 中才算匹配
    if (bestMapping && bestScore >= h.length * 0.5) {
      return bestMapping;
    }

    // 5. 兜底：只有一个项目时直接匹配
    if (mappings.length === 1) return mappings[0];

    return null;
  }

  /** 计算两个字符串的字符重叠数 */
  private overlapScore(a: string, b: string): number {
    let score = 0;
    const bChars = new Set(b.split(''));
    for (const ch of a) {
      if (bChars.has(ch)) score++;
    }
    return score;
  }

  // ─── 原有 submit（git log 自动模式）────────────────────────
  private async submitTimesheet(targetDate?: string): Promise<TimesheetSkillResult> {
    const date = targetDate || this.todayString();
    if (!date) {
      return { success: false, content: '', error: '缺少目标日期' };
    }

    // 检查是否已提交过
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
      const result = await executeTimesheetWorkflow(date);

      if (result.ok && result.submittedProjects) {
        await this.prisma.timesheetRecord.create({
          data: {
            date: new Date(date),
            totalHours: result.totalHours ?? 8,
            projectsSummary: result.submittedProjects as any,
          },
        });
        this.logger.log(`工时已提交: ${date}, ${result.totalHours}h`);
      } else {
        this.logger.warn(`工时上报失败: ${date}, ${result.message}`);
      }

      return {
        success: result.ok,
        content: result.message,
        error: result.ok ? undefined : this.buildExternalSubmitError(result.message),
        submittedProjects: result.submittedProjects,
        totalHours: result.totalHours,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(`工时上报异常: ${msg}`);
      return { success: false, content: '', error: msg };
    }
  }

  // ─── query_missing（不变）────────────────────────────────
  private async queryMissingDates(targetMonth?: string): Promise<TimesheetSkillResult> {
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

    const submittedDates = new Set(
      records.map((r) => this.formatDate(r.date)),
    );

    const today = this.todayString();
    const missingDates = workdays.filter(
      (d) => d <= today && !submittedDates.has(d),
    );

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

  // ─── 工具方法 ──────────────────────────────────────────────
  private loadMappings(): TimesheetProjectMapping[] | null {
    try {
      const cfg = getTimesheetConfig();
      return loadProjectMappings(cfg.projectsConfigPath);
    } catch (e) {
      this.logger.error(`加载项目映射失败: ${e}`);
      return null;
    }
  }

  private getWorkdaysInMonth(year: number, month: number): string[] {
    const days: string[] = [];
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

  private todayString(): string {
    return this.formatDate(new Date());
  }

  private currentMonthString(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  private formatDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private buildExternalSubmitError(rawMessage: string): string {
    const msg = String(rawMessage ?? '').trim();
    if (!msg) return '工时上报失败';

    // 与本地 timesheetRecord 判重区分：该类错误来自 OA 弹窗/页面状态。
    if (msg.includes('已录入过该日期的工时')) {
      return `OA 提示该日期已录入工时（非本地 TimesheetRecord 判重）：${msg}`;
    }
    return msg;
  }

  private parseParams(params: Record<string, unknown>): TimesheetSkillExecuteParams | null {
    const action = typeof params.timesheetAction === 'string' ? params.timesheetAction.trim() : '';
    if (action !== 'preview' && action !== 'confirm' && action !== 'submit' && action !== 'query_missing') return null;
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
}
