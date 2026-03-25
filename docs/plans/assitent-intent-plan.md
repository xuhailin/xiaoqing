链路分析
第一层：意图识别（IntentService）
输入：最近 5 轮对话（截断至 500 字/条）、当前用户输入、worldState、能力列表

输出：DialogueIntentState — mode / seriousness / expectation / agency / requiresTool / taskIntent / slots / escalation / confidence / detectedEmotion / actionHint

说明：

调用 LLM（reasoning 场景），返回 JSON
在 resolve 阶段同步把 worldStateUpdate / identityUpdate 写入数据库
并行做了 worldState 槽位补全 → 得到 mergedIntentState
存在问题：意图层承担了太多职责：槽位识别 + 情绪识别 + worldState 写入 + actionHint 推断全在同一个 service 里，已经越界到决策域了。

第二层：世界状态合并（assembler.resolveIntent 内）
输入：intentState + anchorCity

输出：mergedIntentState（slots 用存储的 city/timezone 补全）

说明：这层是轻量的，通过 worldState.mergeSlots 实现，目前合并逻辑健康。

第三层：记忆召回（TurnContextAssembler.recallMemories）
输入：recentMessages、persona、userProfile

输出：injectedMemories（已经按 token 预算裁剪）

两条路径：

无关键词预筛时：直接取最近 K 条
有预筛时：候选集 → 可选 LLM 精排 → budget-aware 选取
预算计算：maxSystemTokens − personaTokens − coreTokens，动态感知。

第四层：上下文组装（TurnContextAssembler.assemble）
这层是大型聚合器，并行拉取：

persona / userProfile / anchors / growthContext / systemSelf
claimSignals + sessionState
sharedExperiences + rhythmObservations
socialEntities + socialInsights + socialRelationSignals
previousReflection（从 sessionState 读取）
然后调用 ActionReasonerService.decide 得到 actionDecision，全部打包成 TurnContext。

第五层：决策层（ActionReasonerService）
在 assembler 里调用一次，结果放进 context.runtime.actionDecision。

Orchestrator 收到 context 后会再判断：如果 context.runtime.actionDecision 已有，则直接取；否则重新调用 decide。所以实际上只调用一次，但代码结构暗示可能两次。

输出：action (direct_reply / run_capability / handoff_dev / suggest_reminder) + toolPolicy (chat / ask_missing / run_capability / run_openclaw) + targetKind + planIntent

第六层：认知管道（CognitivePipelineService）
在 ResponseComposer 内部调用，不是独立的 pre-step，而是 Prompt 组装的前置计算。

输入：userInput、recentMessages、intentState、worldState、growthContext、claimSignals、sessionState、socialContext

输出：CognitiveTurnState — situation / userState / responseStrategy / judgement / value / emotionRule / affinity / rhythm / safety

特点：纯规则（无 LLM），速度很快。

三条 compose 路径（chat / tool / missing-params）都调用了认知管道，但：

chat 路径：cognitiveState 注入到 prompt 里
tool 路径：cognitiveState 不注入到 prompt，仅用于 boundary review 和 post-turn 计划
missing-params 路径：仅用于 boundary review
第七层：Prompt 组装（PromptRouterService.buildChatMessages）
system prompt 由 26 个 section 拼接（filter(Boolean) 后的非空项）：

区域	内容
人格区	persona prompt、systemSelf（能力+代理）
了解区	identityAnchor（城市/时区）、nickname
记忆区	召回记忆、userProfile 印象
背景信号	worldState、协作上下文、intentState
长期认知	growthPart（6 个子块）、claimPart（长期 claims）、sessionState
社会/关系	sharedExperiences、rhythmObservations、socialEntities、socialInsights、socialRelationSignals
决策/治理	boundaryPart、cognitivePart、reflectionPart、taskPlanPart、decisionContextPart、actionHintPart
约束层	metaFilter、expressionPart
第八层：LLM 生成
标准 chat 场景生成，输出 raw reply。

第九层：后处理
MetaLayer filter：regex 过滤内部策略暴露
BoundaryGovernance review：生成后复核，可修改内容
PostTurnPipeline（异步）：life_record_sync / record_growth / summarize_trigger / record_cognitive_observation / session_reflection
信息损耗与冗余
1. 意图层与认知管道的情绪重复
IntentService 输出 detectedEmotion（LLM 识别）。

CognitivePipelineService 里情绪识别优先级是：

sessionState.mood（已持久化的短期状态）
intentState.detectedEmotion（LLM 识别，仅当 sessionMood 为空时）
regex 关键词兜底
逻辑上正确，但 detectedEmotion 的价值在 prompt 里并没有被单独呈现——它只影响认知管道的内部计算，然后通过 [当前认知决策] emotion: 间接注入。意图层跑了 LLM 识别情绪，但最终在 prompt 里不可直接追溯。

2. intentState 与 cognitiveState 双重注入
Prompt 里同时有：

[当前对话意图状态]（raw intent）：mode / seriousness / agency / taskIntent / confidence
[当前认知决策]（derived）：situation / emotion / strategy / rhythm / affinity
认知决策已经是对意图状态的解释和翻译。两者同时出现，模型收到了原始信号和派生信号，可能产生混淆，也增加了 token 消耗。对纯聊天路径，intentPart 基本可以去掉或折叠进 cognitiveState 备注里。

3. growthPart 与 claimPart 内容重叠
growthPart 来自 CognitivePipelineGrowthService（从历史记忆中沉淀的画像、判断模式、价值排序、节奏）。

claimPart 来自 UserClaim 表（结构化的 INTERACTION_PREFERENCE / RELATION_RHYTHM / JUDGEMENT_PATTERN 等）。

两者都在描述同一个人——用户的长期偏好与认知模式——只是来源和格式不同。模型在 prompt 里会看到两套"关于用户"的描述，内容可能有实质重叠。

4. worldState 被取了两次
在 assemble() 里：

第一次：await this.worldState.get(...) 在初始 Promise.all 里取得 storedWorldState
中间：resolveIntent 可能会 worldState.update(...) 写入变更
第二次：const fullWorldState = await this.worldState.get(...) 再取一次
第二次是为了拿到更新后的值，逻辑正确但是两次数据库查询。可以改成在 resolveIntent 内返回更新后的 state，避免重复查询。

5. 社会上下文在工具路径下无效加载
buildSocialContext（entities / insights / relationSignals）在 assembler 里无论什么路径都加载，但 buildToolResultMessages 的 prompt 完全不注入这些字段。在工具调用路径（天气/提醒/工时等）下这些数据库查询是无效的。

6. DecisionSummaryBuilder 与 PromptRouter 内联逻辑冗余
PromptRouterService.buildChatMessages 有两套 decisionContextPart 构建逻辑：

优先使用 DecisionSummaryBuilder 输出的 decisionSummaryText
降级用内联的 actionDecision 直接构建
两套逻辑都输出 [决策上下文] 格式的 prompt block。DecisionSummaryBuilder 的存在应该是为了取代内联逻辑，但内联的没有完全删除，形成了双重代码。

Prompt 注入诊断：有无过度注入？
明确过度的部分：

注入	问题
intentPart（mode/seriousness/expectation/agency）	这些已经被认知管道翻译成 situation + strategy，在纯聊天路径下 intentPart 基本重复
growthPart + claimPart	双重长期用户画像，内容交叠
sessionStatePart	已经影响了 cognitiveState 的 emotion/fragility，再单独注入等于给模型看两遍
合理存在但密度过高的部分：

[相关共同经历] + [最近节奏观察] + [相关人物认知] + [社会洞察] + [近期关系变化] = 5 个社会/关系 section，每次查询都执行，但触发条件（conversationId + 最近消息）也可能召回大量内容。这些 section 对闲聊质量有价值，但每轮都注入有信噪比的问题。

合理的：

persona + expressionPart（高权重，必须靠近历史消息）
memoryPart（核心记忆注入，有 budget 控制）
identityAnchor + nickname（稳定、量少）
cognitivePart（认知决策的唯一权威表达）
boundaryPart（安全治理，必要）
decisionContextPart（行动决策，必要）
可简化/优化建议
1. 去掉 intentPart（chat 路径）

认知管道已经把 intent 解读成更可操作的 situation + strategy。直接把 [当前对话意图状态] 从 chat 路径的 system prompt 里移除，减少约 60-100 token 的冗余，同时降低模型混淆原始意图信号和派生决策的概率。工具路径不受影响。

2. 合并 growthPart 和 claimPart 的内容来源

两套描述用户的系统应该有统一的注入层，而不是各自注入。可以让 claimPart 消费的数据和 growthContext 的数据在注入时做去重折叠，或者明确各自的覆盖范围（claims 只管结构化偏好键，growth 只管自然语言画像叙述）。

3. 工具路径跳过社会上下文加载

在 TurnContextAssembler.assemble 里，当 actionDecision.toolPolicy.action === 'run_capability' 时，可以跳过 buildSocialContext 和 buildRelationshipContext，这两个有多个 DB 查询。

4. worldState 一次性取

在 resolveIntent 内把 update 后的最新状态返回出来，assembler 直接用，避免第二次 worldState.get 查询。

5. 删除 PromptRouter 里的内联 decisionContext 构建

DecisionSummaryBuilder 已经存在并且功能完整，应该把 PromptRouterService.buildChatMessages 里的内联 actionDecision 构建逻辑彻底删掉，统一走 builder。现在两套逻辑并存是历史遗留。

6. cognitive pipeline 在 tool 路径下仅按需调用

工具回复 prompt（buildToolResultMessages）不注入 cognitiveState，但 composeToolReply 还是跑了完整的 analyzeTurn。这是纯规则计算、很快，影响不大，但如果后续想优化 tool 路径的 latency，可以把这个 analyzeTurn 改成轻量版（只算 safety flags，用于 boundary review）。

整体评价：链路设计方向是对的，五能力分层清晰。主要问题集中在「信号重复注入」和「工具路径做了不必要的聊天路径工作」两点。优先改第 1 和第 5 条是成本最低、收益最高的。