import { Injectable } from '@nestjs/common';
import type { OpenAI } from 'openai';
import { LlmService } from '../../infra/llm/llm.service';
import { estimateMessagesTokens, truncateToTokenBudget } from '../../infra/token-estimator';
import {
  BoundaryGovernanceService,
  type BoundaryPreflight,
  type BoundaryReviewResult,
} from '../cognitive-pipeline/boundary-governance.service';
import type {
  BoundaryPromptContext,
  CognitiveTurnState,
} from '../cognitive-pipeline/cognitive-pipeline.types';
import { CognitivePipelineService } from '../cognitive-pipeline/cognitive-pipeline.service';
import type { DialogueIntentState } from '../intent/intent.types';
import { MetaLayerService } from '../meta-layer/meta-layer.service';
import { PersonaService, type PersonaDto } from '../persona/persona.service';
import { UserProfileService, type UserProfileDto } from '../persona/user-profile.service';
import { PromptRouterService } from '../prompt-router/prompt-router.service';
import { DecisionSummaryBuilder, type DecisionSummary } from './decision-summary.builder';
import type { TurnContext } from './orchestration.types';

type ToolKind =
  | 'weather'
  | 'book_download'
  | 'general_action'
  | 'timesheet'
  | 'reminder'
  | 'openclaw';

interface ProfilePromptOptions {
  includeImpressionCore: boolean;
  includeImpressionDetail: boolean;
}

export interface ReplyComposition {
  promptMessages: OpenAI.Chat.ChatCompletionMessageParam[];
  rawReplyContent: string;
  filteredReplyContent: string;
  replyContent: string;
  cognitiveState: CognitiveTurnState;
  boundaryReview: BoundaryReviewResult;
}

export interface ChatReplyComposition extends ReplyComposition {
  estimatedTokens: number;
  truncated: boolean;
  boundaryPreflight: BoundaryPreflight;
  actionDecision: TurnContext['runtime']['actionDecision'] | null;
  decisionSummary: DecisionSummary;
}

export interface ToolReplyComposition extends ReplyComposition {}

export interface MissingParamsReplyComposition extends ReplyComposition {
  missingParamNames: string;
  missingParamLabels: string[];
}

@Injectable()
export class ResponseComposer {
  private static readonly PARAM_LABEL: Record<string, string> = {
    city: '城市或坐标',
    location: '城市或坐标',
    reminderreason: '提醒内容',
    remindertime: '提醒时间',
    reminderweekday: '星期几',
    recipient: '收件人',
    to: '收件人',
    subject: '主题',
  };

  constructor(
    private readonly llm: LlmService,
    private readonly router: PromptRouterService,
    private readonly persona: PersonaService,
    private readonly userProfile: UserProfileService,
    private readonly cognitivePipeline: CognitivePipelineService,
    private readonly boundaryGovernance: BoundaryGovernanceService,
    private readonly metaLayer: MetaLayerService,
    private readonly decisionSummaryBuilder: DecisionSummaryBuilder,
  ) {}

  async composeChatReply(input: {
    context: TurnContext;
    recentMessages: Array<{ role: string; content: string }>;
    personaDto: PersonaDto;
    intentState?: DialogueIntentState | null;
    maxContextTokens: number;
    profilePrompt: ProfilePromptOptions;
  }): Promise<ChatReplyComposition> {
    const { context, recentMessages, personaDto, maxContextTokens } = input;
    const personaPrompt = this.persona.buildPersonaPrompt(personaDto);
    const worldState = context.world.fullWorldState;
    const growthContext = context.growth.growthContext;
    const claimCtx = context.claims;
    const cognitiveState = this.cognitivePipeline.analyzeTurn({
      userInput: context.request.userMessage.content,
      recentMessages,
      intentState: input.intentState ?? null,
      worldState,
      growthContext,
      claimSignals: claimCtx.claimSignals,
      sessionState: claimCtx.sessionState,
      socialContext: {
        insights: context.social.insights.map((item) => ({
          content: item.content,
          confidence: item.confidence,
          relatedEntityIds: item.relatedEntityIds,
        })),
        relationSignals: context.social.relationSignals.map((item) => ({
          entityName: item.entityName,
          entityAliases: item.entityAliases,
          relation: item.entityRelation,
          trend: item.trend,
          quality: item.quality,
          note: item.notes,
        })),
      },
    });
    const boundaryPreflight = this.boundaryGovernance.buildPreflight(cognitiveState);
    const boundaryPrompt: BoundaryPromptContext = {
      preflightText: this.boundaryGovernance.buildPreflightPrompt(boundaryPreflight) || null,
    };
    const userProfileText = this.buildInjectedUserProfileText(
      context.user.userProfile,
      input.profilePrompt,
    );

    const actionDecision = context.runtime.actionDecision ?? null;
    const resolvedIntent = context.runtime.mergedIntentState ?? context.runtime.intentState ?? null;
    const decisionSummary = this.decisionSummaryBuilder.build({
      intentState: resolvedIntent,
      actionDecision,
    });

    let messages = this.router.buildChatMessages({
      messages: recentMessages as Array<{ role: 'user' | 'assistant'; content: string }>,
      personaPrompt,
      expressionFields: context.persona.expressionFields,
      userProfileText,
      memories: context.memory.injectedMemories,
      identityAnchor: context.user.anchorText,
      preferredNickname: context.user.preferredNickname,
      intentState: input.intentState ?? undefined,
      worldState,
      cognitiveState,
      growthContext,
      claimPolicyText: claimCtx.claimPolicyText,
      sessionStateText: claimCtx.sessionStateText,
      sharedExperiences: context.relationship.sharedExperiences,
      rhythmObservations: context.relationship.rhythmObservations,
      socialEntities: context.social.entities,
      socialInsights: context.social.insights,
      socialRelationSignals: context.social.relationSignals,
      boundaryPrompt,
      metaFilterPolicy: personaDto.metaFilterPolicy,
      handoffDevHint: actionDecision?.action === 'handoff_dev',
      reminderHint:
        actionDecision?.action === 'suggest_reminder'
          ? (actionDecision.reminderHint ?? '')
          : undefined,
      systemSelf: context.system.systemSelf,
      previousReflection: context.runtime.previousReflection,
      taskPlan: actionDecision?.taskPlan,
      actionDecision: actionDecision ?? undefined,
      decisionSummaryText: decisionSummary.text || undefined,
      collaborationContext: context.runtime.collaborationContext ?? undefined,
    });

    const estimatedTokens = estimateMessagesTokens(
      messages.map((m) => ({ role: String(m.role), content: String(m.content ?? '') })),
    );
    const truncated = estimatedTokens > maxContextTokens;
    if (truncated) {
      messages = truncateToTokenBudget(
        messages.map((m) => ({ role: String(m.role), content: String(m.content ?? '') })),
        maxContextTokens,
      ) as typeof messages;
    }

    const rawReplyContent = await this.llm.generate(messages, { scenario: 'chat' });
    const filteredReplyContent = this.applyMetaLayerFilter(rawReplyContent, personaDto.metaFilterPolicy);
    const boundaryReview = this.boundaryGovernance.reviewGeneratedReply(
      filteredReplyContent,
      cognitiveState,
    );

    return {
      promptMessages: messages,
      rawReplyContent,
      filteredReplyContent,
      replyContent: boundaryReview.content,
      cognitiveState,
      boundaryReview,
      estimatedTokens,
      truncated,
      boundaryPreflight,
      actionDecision,
      decisionSummary,
    };
  }

  async composeToolReply(input: {
    context: TurnContext;
    userInput: string;
    recentMessages?: Array<{ role: string; content: string }>;
    personaDto: PersonaDto;
    intentState?: DialogueIntentState | null;
    toolResult: string | null;
    toolError: string | null;
    toolKind: ToolKind;
    profilePrompt: ProfilePromptOptions;
    toolWasActuallyUsed: boolean;
  }): Promise<ToolReplyComposition> {
    const { context, userInput, recentMessages, personaDto } = input;
    const worldState = context.world.fullWorldState;
    const growthContext = context.growth.growthContext;
    const claimCtx = context.claims;
    const cognitiveState = this.cognitivePipeline.analyzeTurn({
      userInput,
      recentMessages: recentMessages ?? [],
      intentState: input.intentState ?? null,
      worldState,
      growthContext,
      claimSignals: claimCtx.claimSignals,
      sessionState: claimCtx.sessionState,
      socialContext: {
        insights: context.social.insights.map((item) => ({
          content: item.content,
          confidence: item.confidence,
          relatedEntityIds: item.relatedEntityIds,
        })),
        relationSignals: context.social.relationSignals.map((item) => ({
          entityName: item.entityName,
          entityAliases: item.entityAliases,
          relation: item.entityRelation,
          trend: item.trend,
          quality: item.quality,
          note: item.notes,
        })),
      },
    });

    const wrapMessages = this.router.buildToolResultMessages({
      personaText: this.persona.buildPersonaPrompt(personaDto),
      expressionText: this.router.buildExpressionPolicy(
        context.persona.expressionFields,
        input.intentState ?? undefined,
      ),
      userProfileText: this.buildInjectedUserProfileText(
        context.user.userProfile,
        input.profilePrompt,
      ),
      metaFilterPolicy: personaDto.metaFilterPolicy,
      collaborationContext: context.runtime.collaborationContext ?? undefined,
      preferredNickname: context.user.preferredNickname,
      toolKind: input.toolKind,
      userInput,
      toolResult: input.toolResult,
      toolError: input.toolError,
      recentMessages,
    });

    const rawReplyContent = await this.llm.generate(wrapMessages, { scenario: 'chat' });
    const filteredReplyContent = this.applyMetaLayerFilter(rawReplyContent, personaDto.metaFilterPolicy);
    const boundaryReview = this.boundaryGovernance.reviewGeneratedReply(
      filteredReplyContent,
      cognitiveState,
      { toolWasActuallyUsed: input.toolWasActuallyUsed },
    );

    return {
      promptMessages: wrapMessages,
      rawReplyContent,
      filteredReplyContent,
      replyContent: boundaryReview.content,
      cognitiveState,
      boundaryReview,
    };
  }

  async composeMissingParamsReply(input: {
    context: TurnContext;
    userInput: string;
    missingParams: string[];
    personaDto: PersonaDto;
    intentState?: DialogueIntentState | null;
    profilePrompt: ProfilePromptOptions;
  }): Promise<MissingParamsReplyComposition> {
    const missingParamLabels = input.missingParams.map(
      (param) => ResponseComposer.PARAM_LABEL[param.toLowerCase()] ?? param,
    );
    const missingParamNames = missingParamLabels.join('、');

    const systemContent = [
      this.persona.buildPersonaPrompt(input.personaDto),
      this.router.buildCollaborationContextPrompt(input.context.runtime.collaborationContext),
      '',
      this.router.buildExpressionPolicy(
        input.context.persona.expressionFields,
        input.intentState ?? undefined,
      ),
      this.router.buildNicknameHint(input.context.user.preferredNickname),
      this.buildInjectedUserProfileText(input.context.user.userProfile, input.profilePrompt),
      '',
      this.router.buildMetaFilterPolicy(input.personaDto.metaFilterPolicy),
      '',
      '用户想让你帮忙执行一件事，但还少一些关键信息，需要你自然地问 TA 补全。',
      `当前缺少的信息类型：${missingParamNames}。`,
      '请沿用上面的人格与表达字段，用自然口语问用户要这些信息，不要提「系统」「参数」「缺少」等词，一句或两句即可。',
    ].join('\n');
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemContent },
      { role: 'user', content: `用户说：${input.userInput}` },
    ];

    const worldState = input.context.world.fullWorldState;
    const growthContext = input.context.growth.growthContext;
    const claimCtx = input.context.claims;
    const cognitiveState = this.cognitivePipeline.analyzeTurn({
      userInput: input.userInput,
      recentMessages: [],
      intentState: input.intentState ?? null,
      worldState,
      growthContext,
      claimSignals: claimCtx.claimSignals,
      sessionState: claimCtx.sessionState,
      socialContext: {
        insights: input.context.social.insights.map((item) => ({
          content: item.content,
          confidence: item.confidence,
          relatedEntityIds: item.relatedEntityIds,
        })),
        relationSignals: input.context.social.relationSignals.map((item) => ({
          entityName: item.entityName,
          entityAliases: item.entityAliases,
          relation: item.entityRelation,
          trend: item.trend,
          quality: item.quality,
          note: item.notes,
        })),
      },
    });

    const rawReplyContent = await this.llm.generate(messages, { scenario: 'chat' });
    const filteredReplyContent = this.applyMetaLayerFilter(
      rawReplyContent,
      input.personaDto.metaFilterPolicy,
    );
    const boundaryReview = this.boundaryGovernance.reviewGeneratedReply(
      filteredReplyContent,
      cognitiveState,
    );

    return {
      promptMessages: messages,
      rawReplyContent,
      filteredReplyContent,
      replyContent: boundaryReview.content,
      cognitiveState,
      boundaryReview,
      missingParamNames,
      missingParamLabels,
    };
  }

  private buildInjectedUserProfileText(
    profile: UserProfileDto,
    opts: ProfilePromptOptions,
  ): string {
    return this.userProfile.buildPrompt({
      ...profile,
      impressionCore: opts.includeImpressionCore ? profile.impressionCore : null,
      impressionDetail: opts.includeImpressionDetail ? profile.impressionDetail : null,
    });
  }

  private applyMetaLayerFilter(content: string, policy: string): string {
    return this.metaLayer.filter(content, policy).content;
  }

}
