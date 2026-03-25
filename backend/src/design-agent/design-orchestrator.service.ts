import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { resolve } from 'path';
import { DesignConversationService } from './design-conversation.service';
import { DesignIntentClassifier } from './design-intent-classifier.service';
import { DesignAgentService } from './design-agent.service';
import { VisualAuditService } from './visual-audit.service';
import { PageScreenshotService } from './screenshot/page-screenshot.service';
import { ClaudeCodeStreamService } from '../dev-agent/executors/claude-code-stream.service';
import { DevAgentService } from '../dev-agent/dev-agent.service';
import type {
  CreateDesignConversationRequest,
  SendDesignMessageRequest,
  DesignConversationResponse,
  DesignConversationMessage,
  DesignImageInput,
  DesignAuditResult,
  ProposedChange,
  ApplyChangesResult,
  DesignPageType,
  DesignPreset,
  DesignAuditMode,
} from './design-agent.types';
import { defaultPresetForPageType } from './design-agent.types';

@Injectable()
export class DesignOrchestratorService {
  private readonly logger = new Logger(DesignOrchestratorService.name);
  private readonly defaultWorkspaceRoot: string;

  constructor(
    private readonly conversation: DesignConversationService,
    private readonly intentClassifier: DesignIntentClassifier,
    private readonly designAgent: DesignAgentService,
    private readonly visualAudit: VisualAuditService,
    private readonly screenshot: PageScreenshotService,
    private readonly stream: ClaudeCodeStreamService,
    private readonly devAgent: DevAgentService,
    config: ConfigService,
  ) {
    this.defaultWorkspaceRoot =
      config.get<string>('DESIGN_AGENT_WORKSPACE_ROOT') ??
      resolve(process.cwd(), '..');
  }

  /**
   * 创建新对话并发送首条消息
   */
  async startConversation(
    request: CreateDesignConversationRequest & { initialMessage?: string },
  ): Promise<DesignConversationResponse> {
    // 创建对话
    const conversation = await this.conversation.createConversation('default-user', request);

    // 如果有初始消息，处理它
    if (request.initialMessage?.trim()) {
      const message = await this.conversation.addUserMessage(conversation.id, {
        content: request.initialMessage,
      });

      // 处理消息并生成回复
      await this.processUserMessage(conversation.id, message);
    }

    return this.conversation.getConversation(conversation.id) as Promise<DesignConversationResponse>;
  }

  /**
   * 发送消息并获取回复
   */
  async sendMessage(
    conversationId: string,
    request: SendDesignMessageRequest,
  ): Promise<DesignConversationResponse> {
    // 添加用户消息
    const userMessage = await this.conversation.addUserMessage(conversationId, request);

    // 处理消息并生成回复
    await this.processUserMessage(conversationId, userMessage);

    // 返回更新后的对话
    return this.conversation.getConversation(conversationId) as Promise<DesignConversationResponse>;
  }

  /**
   * 应用修改
   */
  async applyChanges(
    conversationId: string,
    changeIds?: string[],
    notes?: string,
  ): Promise<ApplyChangesResult> {
    const context = await this.conversation.getConversationContext(conversationId);
    const lastAssistantMessage = [...context.messages]
      .reverse()
      .find((m) => m.role === 'assistant' && m.metadata?.proposedChanges?.length);

    if (!lastAssistantMessage?.metadata?.proposedChanges) {
      return {
        success: false,
        changedFiles: [],
        error: '没有找到待应用的修改方案',
      };
    }

    const proposedChanges = lastAssistantMessage.metadata.proposedChanges as ProposedChange[];
    const changesToApply = changeIds
      ? proposedChanges.filter((_, i) => changeIds.includes(`change-${i}`))
      : proposedChanges;

    if (changesToApply.length === 0) {
      return {
        success: false,
        changedFiles: [],
        error: '没有选择任何修改',
      };
    }

    // 判断修改复杂度
    const isComplex = this.isComplexChange(changesToApply);

    if (isComplex) {
      // 复杂修改：委派给 DevAgent
      return this.delegateToDevAgent(conversationId, changesToApply, notes);
    }

    // 简单修改：直接执行
    return this.applyChangesDirectly(conversationId, changesToApply, notes);
  }

  /**
   * 预览修改（生成 diff）
   */
  async previewChanges(
    conversationId: string,
    changeIds?: string[],
  ): Promise<{ diffs: Array<{ filePath: string; diff: string }> }> {
    const context = await this.conversation.getConversationContext(conversationId);
    const lastAssistantMessage = [...context.messages]
      .reverse()
      .find((m) => m.role === 'assistant' && m.metadata?.proposedChanges?.length);

    if (!lastAssistantMessage?.metadata?.proposedChanges) {
      return { diffs: [] };
    }

    const proposedChanges = lastAssistantMessage.metadata.proposedChanges as ProposedChange[];
    const changesToPreview = changeIds
      ? proposedChanges.filter((_, i) => changeIds.includes(`change-${i}`))
      : proposedChanges;

    const workspaceRoot = context.conversation.workspaceRoot ?? this.defaultWorkspaceRoot;
    const previewPrompt = this.buildPreviewPrompt(changesToPreview);

    try {
      const result = await this.stream.execute(previewPrompt, {
        cwd: workspaceRoot,
        allowedTools: ['Read', 'Glob', 'Grep'],
        maxTurns: 5,
      });

      const diffs = this.extractDiffs(result.content ?? '');
      return { diffs };
    } catch (err) {
      this.logger.error(`Preview changes failed: ${String(err)}`);
      return { diffs: [] };
    }
  }

  /**
   * 委派复杂修改到 DevAgent
   */
  private async delegateToDevAgent(
    conversationId: string,
    changes: ProposedChange[],
    notes?: string,
  ): Promise<ApplyChangesResult> {
    const context = await this.conversation.getConversationContext(conversationId);
    const workspaceRoot = context.conversation.workspaceRoot ?? this.defaultWorkspaceRoot;

    // 添加提示消息
    await this.conversation.addAssistantMessage(
      conversationId,
      '这是一个较复杂的修改，已委派给 DevAgent 执行。你可以在 DevAgent 面板查看进度。',
    );

    const taskPrompt = this.buildDevAgentTaskPrompt(changes, notes, context);

    try {
      const result = await this.devAgent.handleTask(
        `design-${conversationId}`,
        taskPrompt,
        { workspaceRoot },
        { mode: 'agent' },
      );

      const changedFiles = this.extractChangedFilesFromRunResult(result.run?.result);

      // 添加结果消息
      await this.conversation.addAssistantMessage(
        conversationId,
        result.run?.status === 'success'
          ? `DevAgent 已完成修改，涉及 ${changedFiles.length} 个文件。\n\n${changedFiles.map((f) => `- ${f}`).join('\n')}`
          : `DevAgent 执行${result.run?.status === 'failed' ? '失败' : '中'}：${result.run?.error || '查看 DevAgent 面板了解详情'}`,
        {
          executionResult: {
            success: result.run?.status === 'success',
            changedFiles,
            error: result.run?.error ?? undefined,
          },
        },
      );

      return {
        success: result.run?.status === 'success',
        changedFiles,
        error: result.run?.error ?? undefined,
      };
    } catch (err) {
      const error = String(err);
      this.logger.error(`Delegate to DevAgent failed: ${error}`);
      return {
        success: false,
        changedFiles: [],
        error,
      };
    }
  }

  /**
   * 直接应用简单修改
   */
  private async applyChangesDirectly(
    conversationId: string,
    changes: ProposedChange[],
    notes?: string,
  ): Promise<ApplyChangesResult> {
    const context = await this.conversation.getConversationContext(conversationId);
    const workspaceRoot = context.conversation.workspaceRoot ?? this.defaultWorkspaceRoot;
    const applyPrompt = this.buildApplyChangesPrompt(changes, notes);

    try {
      const result = await this.stream.execute(applyPrompt, {
        cwd: workspaceRoot,
        allowedTools: ['Read', 'Edit', 'Write', 'Glob', 'Grep'],
        maxTurns: 10,
      });

      const changedFiles = this.extractChangedFiles(result.content ?? '');

      // 添加执行结果消息
      await this.conversation.addAssistantMessage(conversationId, result.success
        ? `已完成修改，涉及 ${changedFiles.length} 个文件。\n\n${changedFiles.map((f) => `- ${f}`).join('\n')}`
        : `修改失败：${result.error ?? '未知错误'}`,
        {
          executionResult: {
            success: result.success,
            changedFiles,
            error: result.error ?? undefined,
          },
        },
      );

      return {
        success: result.success,
        changedFiles,
        error: result.error ?? undefined,
      };
    } catch (err) {
      const error = String(err);
      this.logger.error(`Apply changes failed: ${error}`);
      return {
        success: false,
        changedFiles: [],
        error,
      };
    }
  }

  /**
   * 判断修改是否复杂
   */
  private isComplexChange(changes: ProposedChange[]): boolean {
    // 超过 3 个文件，或涉及创建/删除操作，或文件路径包含核心模块
    if (changes.length > 3) return true;
    if (changes.some((c) => c.changeType === 'create' || c.changeType === 'delete')) return true;
    if (changes.some((c) =>
      c.filePath.includes('core/') ||
      c.filePath.includes('infra/') ||
      c.filePath.includes('module.ts'),
    )) return true;
    return false;
  }

  // ── 私有方法 ────────────────────────────────

  /**
   * 处理用户消息，生成回复
   */
  private async processUserMessage(
    conversationId: string,
    userMessage: DesignConversationMessage,
  ): Promise<void> {
    const context = await this.conversation.getConversationContext(conversationId);
    const intent = await this.intentClassifier.classify(userMessage, context);

    this.logger.log(`User intent: ${intent.type}`);

    try {
      switch (intent.type) {
        case 'audit_page':
          await this.handleAuditPage(conversationId, intent, context);
          break;

        case 'describe_issue':
          await this.handleDescribeIssue(conversationId, intent, context, userMessage);
          break;

        case 'upload_screenshot':
          await this.handleUploadScreenshot(conversationId, intent, context, userMessage);
          break;

        case 'confirm_changes':
          await this.applyChanges(conversationId, intent.changeIds, intent.notes);
          break;

        case 'request_modification':
          await this.handleRequestModification(conversationId, intent, context);
          break;

        case 'ask_question':
          await this.handleQuestion(conversationId, intent, context);
          break;

        default:
          await this.conversation.addAssistantMessage(
            conversationId,
            '我理解你想进行设计审查。请告诉我你想审查哪个页面，或者描述你发现的 UI 问题。',
          );
      }
    } catch (err) {
      const error = String(err);
      this.logger.error(`Process message failed: ${error}`);
      await this.conversation.addAssistantMessage(
        conversationId,
        `处理消息时出错：${error}`,
      );
    }
  }

  /**
   * 处理审查页面请求
   */
  private async handleAuditPage(
    conversationId: string,
    intent: { pageName: string; pageType: DesignPageType; pageUrl?: string | null; preset?: DesignPreset },
    context: any,
  ): Promise<void> {
    const preset = intent.preset ?? defaultPresetForPageType(intent.pageType);
    await this.conversation.updatePageContext(conversationId, {
      pageName: intent.pageName,
      pageType: intent.pageType,
      pageUrl: intent.pageUrl ?? undefined,
      preset,
    });

    await this.conversation.addAssistantMessage(
      conversationId,
      `正在审查 ${intent.pageName} 页面（${intent.pageType} 类型）...`,
    );

    const workspaceRoot = context.conversation.workspaceRoot ?? this.defaultWorkspaceRoot;

    try {
      const result = await this.designAgent.runAudit({
        pageName: intent.pageName,
        pageType: intent.pageType,
        pageUrl: intent.pageUrl ?? undefined,
        preset,
        mode: 'full',
        workspaceRoot,
      });

      if (!result.success || !result.auditResult) {
        await this.conversation.addAssistantMessage(
          conversationId,
          `审查失败：${result.error || '未知错误'}`,
        );
        return;
      }

      const audit = result.auditResult;
      const findingsText = audit.findings.length > 0
        ? audit.findings.map((f, i) =>
            `${i + 1}. **${f.rule}** (${f.severity})\n   ${f.problem}\n   位置：${f.location}`,
          ).join('\n\n')
        : '没有发现设计问题。';

      const reply = `## 审查结果：${audit.summary.status}

**风险等级**：${audit.summary.riskLevel}
**耗时**：${(result.durationMs / 1000).toFixed(1)}s

### 总体评估
${audit.summary.overallAssessment}

### 发现的问题
${findingsText}

${audit.minimalFixPlan?.length ? `
### 建议修改
${audit.minimalFixPlan.map((f, i) => `${i + 1}. ${f.action}（${f.target}）`).join('\n')}

如需应用修改，请回复「确认修改」。
` : ''}`;

      await this.conversation.addAssistantMessage(conversationId, reply, {
        auditResult: audit,
        proposedChanges: audit.minimalFixPlan?.map((f, i) => ({
          filePath: f.target,
          changeType: 'edit' as const,
          description: f.action,
        })),
      });
    } catch (err) {
      await this.conversation.addAssistantMessage(
        conversationId,
        `审查过程出错：${String(err)}`,
      );
    }
  }

  /**
   * 处理描述问题
   */
  private async handleDescribeIssue(
    conversationId: string,
    intent: { description: string },
    context: any,
    userMessage: DesignConversationMessage,
  ): Promise<void> {
    if (!context.pageContext) {
      await this.conversation.addAssistantMessage(
        conversationId,
        '请先告诉我你想审查哪个页面（如 memory、chat、workspace）。',
      );
      return;
    }

    const workspaceRoot = context.conversation.workspaceRoot ?? this.defaultWorkspaceRoot;
    const prompt = this.buildIssueAnalysisPrompt(intent.description, context.pageContext, userMessage);

    try {
      const result = await this.stream.execute(prompt, {
        cwd: workspaceRoot,
        allowedTools: ['Read', 'Glob', 'Grep'],
        maxTurns: 15,
      });

      if (!result.success) {
        await this.conversation.addAssistantMessage(
          conversationId,
          `分析问题失败：${result.error}`,
        );
        return;
      }

      // 尝试解析为 JSON，否则直接返回文本
      const parsed = this.tryParseJson(result.content ?? '');
      if (parsed && parsed.task === 'issue_analysis') {
        await this.conversation.addAssistantMessage(
          conversationId,
          this.formatIssueAnalysisReply(parsed),
          { proposedChanges: parsed.proposedChanges },
        );
      } else {
        await this.conversation.addAssistantMessage(conversationId, result.content ?? '');
      }
    } catch (err) {
      await this.conversation.addAssistantMessage(
        conversationId,
        `分析过程出错：${String(err)}`,
      );
    }
  }

  /**
   * 处理截图上传
   */
  private async handleUploadScreenshot(
    conversationId: string,
    intent: { images: DesignImageInput[] },
    context: any,
    userMessage: DesignConversationMessage,
  ): Promise<void> {
    const pageContext = context.pageContext || {
      pageName: 'uploaded-screenshot',
      pageType: 'memory' as DesignPageType,
      preset: 'quiet-personal' as DesignPreset,
    };

    try {
      const result = await this.visualAudit.audit({
        pageName: pageContext.pageName,
        pageType: pageContext.pageType as DesignPageType,
        preset: pageContext.preset as DesignPreset,
        lightScreenshot: intent.images[0].base64,
        notes: userMessage.content || intent.images[0].annotation,
      });

      if (!result.success || !result.auditResult) {
        await this.conversation.addAssistantMessage(
          conversationId,
          `截图审查失败：${result.error || '未知错误'}`,
        );
        return;
      }

      const audit = result.auditResult;
      const reply = `## 截图审查结果

**状态**：${audit.summary.status}
**风险等级**：${audit.summary.riskLevel}

### 总体评估
${audit.summary.overallAssessment}

### 发现的问题
${audit.findings.map((f, i) => `${i + 1}. **${f.rule}**：${f.problem}`).join('\n')}

${audit.minimalFixPlan?.length ? '回复「确认修改」可应用建议的修改。' : ''}`;

      await this.conversation.addAssistantMessage(conversationId, reply, {
        auditResult: audit,
        proposedChanges: audit.minimalFixPlan?.map((f) => ({
          filePath: f.target,
          changeType: 'edit' as const,
          description: f.action,
        })),
      });
    } catch (err) {
      await this.conversation.addAssistantMessage(
        conversationId,
        `截图审查出错：${String(err)}`,
      );
    }
  }

  /**
   * 处理修改请求
   */
  private async handleRequestModification(
    conversationId: string,
    intent: { description: string },
    context: any,
  ): Promise<void> {
    if (!context.pageContext) {
      await this.conversation.addAssistantMessage(
        conversationId,
        '请先告诉我你想修改哪个页面。',
      );
      return;
    }

    const workspaceRoot = context.conversation.workspaceRoot ?? this.defaultWorkspaceRoot;
    const prompt = this.buildModificationPrompt(intent.description, context);

    await this.conversation.addAssistantMessage(conversationId, '正在生成修改方案...');

    try {
      const result = await this.stream.execute(prompt, {
        cwd: workspaceRoot,
        allowedTools: ['Read', 'Glob', 'Grep'],
        maxTurns: 15,
      });

      const proposedChanges = this.extractProposedChanges(result.content ?? '');

      await this.conversation.addAssistantMessage(
        conversationId,
        result.content ?? '',
        { proposedChanges },
      );
    } catch (err) {
      await this.conversation.addAssistantMessage(
        conversationId,
        `生成修改方案出错：${String(err)}`,
      );
    }
  }

  /**
   * 处理问题
   */
  private async handleQuestion(
    conversationId: string,
    intent: { question: string },
    context: any,
  ): Promise<void> {
    const workspaceRoot = context.conversation.workspaceRoot ?? this.defaultWorkspaceRoot;
    const prompt = this.buildQuestionPrompt(intent.question, context);

    try {
      const result = await this.stream.execute(prompt, {
        cwd: workspaceRoot,
        allowedTools: ['Read', 'Glob', 'Grep'],
        maxTurns: 10,
      });

      await this.conversation.addAssistantMessage(conversationId, result.content ?? '');
    } catch (err) {
      await this.conversation.addAssistantMessage(
        conversationId,
        `回答问题出错：${String(err)}`,
      );
    }
  }

  // ── Prompt 构建 ────────────────────────────────

  private buildIssueAnalysisPrompt(
    description: string,
    pageContext: any,
    userMessage: DesignConversationMessage,
  ): string {
    return `你是 XiaoQing 的设计审查助手。用户描述了一个 UI 问题，请分析问题并给出修改建议。

## 页面上下文
- 页面名称：${pageContext.pageName}
- 页面类型：${pageContext.pageType}
- 页面 URL：${pageContext.pageUrl || '未知'}

## 用户描述
${userMessage.content}

## 任务
1. 阅读相关组件代码（frontend/src/app/ 目录下）
2. 分析用户描述的问题
3. 给出修改建议

## 输出格式
输出 JSON 格式：
{
  "task": "issue_analysis",
  "analysis": "问题分析...",
  "proposedChanges": [
    { "filePath": "...", "changeType": "edit", "description": "..." }
  ],
  "explanation": "修改说明..."
}`;
  }

  private buildModificationPrompt(description: string, context: any): string {
    return `你是 XiaoQing 的设计审查助手。用户请求修改 UI。

## 页面上下文
- 页面名称：${context.pageContext.pageName}
- 页面类型：${context.pageContext.pageType}

## 用户请求
${description}

## 任务
1. 理解用户的修改需求
2. 阅读相关组件代码
3. 给出具体的修改方案（不要执行修改，只给出方案）

## 输出
清晰地描述修改方案，包括：
- 要修改的文件
- 具体的修改内容
- 修改原因`;
  }

  private buildQuestionPrompt(question: string, context: any): string {
    return `你是 XiaoQing 的设计审查助手。用户有一个关于 UI/设计系统的问题。

${context.pageContext ? `## 页面上下文\n- 页面：${context.pageContext.pageName}\n- 类型：${context.pageContext.pageType}` : ''}

## 用户问题
${question}

## 任务
阅读相关代码和设计系统，给出清晰的回答。`;
  }

  private buildApplyChangesPrompt(changes: ProposedChange[], notes?: string): string {
    return `执行以下 UI 修改：

## 修改列表
${changes.map((c, i) => `${i + 1}. ${c.filePath}: ${c.description}`).join('\n')}

${notes ? `## 用户备注\n${notes}` : ''}

## 要求
1. 按照设计系统规范进行修改
2. 使用 CSS 变量（var(--xxx)）而非硬编码值
3. 保持最小修改原则
4. 完成后列出修改的文件`;
  }

  private buildPreviewPrompt(changes: ProposedChange[]): string {
    return `预览以下修改，生成 diff（不执行实际修改）：

## 修改列表
${changes.map((c, i) => `${i + 1}. ${c.filePath}: ${c.description}`).join('\n')}

## 要求
1. 阅读相关文件
2. 生成 unified diff 格式的预览
3. 使用标准 diff 格式：--- a/file 和 +++ b/file`;
  }

  private buildDevAgentTaskPrompt(
    changes: ProposedChange[],
    notes?: string,
    context?: any,
  ): string {
    const pageContext = context?.pageContext;
    return `执行设计审查修改任务：

## 页面上下文
${pageContext ? `- 页面：${pageContext.pageName}\n- 类型：${pageContext.pageType}` : '无'}

## 修改列表
${changes.map((c, i) => `${i + 1}. [${c.changeType}] ${c.filePath}\n   ${c.description}`).join('\n')}

${notes ? `## 用户备注\n${notes}` : ''}

## 设计规范要求
1. 颜色必须使用 CSS 变量（如 var(--color-text), var(--space-4)）
2. 间距使用 var(--space-*) 系列
3. 圆角使用 var(--radius-*) 系列
4. 优先使用现有共享组件（AppPanel, AppButton 等）
5. 保持最小修改原则，不改动无关代码

完成后列出所有修改的文件路径。`;
  }

  private extractDiffs(content: string): Array<{ filePath: string; diff: string }> {
    const diffs: Array<{ filePath: string; diff: string }> = [];
    const diffRegex = /diff --git a\/(.+?) b\/(.+?)[\s\S]*?(?=diff --git|$)/g;
    let match;
    while ((match = diffRegex.exec(content)) !== null) {
      diffs.push({
        filePath: match[1],
        diff: match[0].trim(),
      });
    }
    return diffs;
  }

  private extractChangedFilesFromRunResult(result: any): string[] {
    if (!result) return [];
    const content = typeof result === 'string' ? result : JSON.stringify(result);
    return this.extractChangedFiles(content);
  }

  private formatIssueAnalysisReply(parsed: any): string {
    return `## 问题分析

${parsed.analysis || ''}

### 建议修改
${parsed.proposedChanges?.map((c: any, i: number) => `${i + 1}. ${c.filePath}: ${c.description}`).join('\n') || '无'}

${parsed.explanation ? `### 说明\n${parsed.explanation}` : ''}

如需应用修改，请回复「确认修改」。`;
  }

  private tryParseJson(content: string): any | null {
    try {
      const match = content.match(/```(?:json)?\s*([\s\S]*?)```/) ?? content.match(/(\{[\s\S]*\})/);
      if (match) {
        return JSON.parse(match[1].trim());
      }
      return null;
    } catch {
      return null;
    }
  }

  private extractProposedChanges(content: string): ProposedChange[] {
    // 简单提取：查找文件路径模式
    const changes: ProposedChange[] = [];
    const filePathRegex = /(?:frontend\/src\/app\/[^\s:]+)/g;
    const matches = content.match(filePathRegex) || [];

    const seen = new Set<string>();
    for (const filePath of matches) {
      if (!seen.has(filePath)) {
        seen.add(filePath);
        changes.push({
          filePath,
          changeType: 'edit',
          description: '修改此文件',
        });
      }
    }

    return changes;
  }

  private extractChangedFiles(content: string): string[] {
    const filePathRegex = /(?:frontend\/src\/[^\s:]+\.(ts|scss|html))/g;
    const matches = content.match(filePathRegex) || [];
    return [...new Set(matches)];
  }
}
