# 偏好与进化触发手册（排查版）

> 适用场景：你在库里看到了 `UserClaim`，但前端“默认用户偏好”没有展示，或不确定“重新总结/自动触发/进化建议”是否生效。

---

## 1. 先看结论：为什么你这两条没展示

你给出的两条数据是：

- `key`: `draft.ip.tone.cute`、`draft.ip.ask_fewer_questions`
- `status`: `CANDIDATE`

而“默认用户偏好”的投影逻辑只读取：

- `status IN ('STABLE', 'CORE')`
- 且 `key NOT LIKE 'draft.%'`

所以这两条不会进入前端稳定偏好展示。

---

## 2. 展示链路（从 Claim 到 UI）

1. 总结器/画像更新写入 `UserClaim`。
2. `GET /persona/profile` 时，后端会执行 Claim → UserProfile 投影。
3. 前端“默认用户偏好”展示 `UserProfile.preferredVoiceStyle / praisePreference / responseRhythm`。

注意：

- `UserProfile` 是“投影结果表”（面向展示与注入）。
- `UserClaim` 是“证据与状态演进表”（包含草稿和候选）。

---

## 3. 状态晋升规则（为什么经常停在 CANDIDATE）

Claim 状态由证据数、置信度、反证比例决定：

- `CORE`: `evidenceCount >= 12` 且 `confidence >= 0.85`
- `STABLE`: `evidenceCount >= 6` 且 `confidence >= 0.7`
- `WEAK`: `evidenceCount >= 3` 且 `confidence >= 0.55`
- 其他：`CANDIDATE`

另外，`draft.*` key 有上限保护：

- 置信度封顶 `0.55`
- 最高状态不超过 `WEAK`

这就是为什么 `draft.*` 几乎不会进稳定展示区。

---

## 4. 怎么“可预期地”触发到前端可见

目标：让某条偏好进入 UI 稳定区（`STABLE/CORE + 非 draft`）。

建议流程：

1. 在对话里用稳定表达重复偏好（至少 6 次以上，且尽量表述一致）。
2. 每次触发总结（手动点“重新总结”或等自动阈值触发）。
3. 确认 Claim key 最终落在 canonical（`ip.*` / `rr.*`），不是 `draft.*`。
4. 当状态升到 `STABLE` 后，刷新“默认用户偏好”即可看到投影文本。

---

## 5. SQL 排查清单（直接可用）

### 5.1 看某用户的偏好 Claim（含草稿）

```sql
SELECT "type", "key", "status", "confidence", "evidenceCount", "counterEvidenceCount", "updatedAt"
FROM public."UserClaim"
WHERE "userKey" = 'default-user'
  AND "type" IN ('INTERACTION_PREFERENCE', 'RELATION_RHYTHM')
ORDER BY "updatedAt" DESC
LIMIT 100;
```

### 5.2 看“会被 UI 投影”的稳定 Claim

```sql
SELECT "type", "key", "status", "confidence", "evidenceCount", "updatedAt"
FROM public."UserClaim"
WHERE "userKey" = 'default-user'
  AND "type" IN ('INTERACTION_PREFERENCE', 'RELATION_RHYTHM')
  AND "status" IN ('STABLE', 'CORE')
  AND "key" NOT LIKE 'draft.%'
ORDER BY "confidence" DESC, "updatedAt" DESC;
```

### 5.3 看最终前端读取的投影结果

```sql
SELECT "userKey", "preferredVoiceStyle", "praisePreference", "responseRhythm", "updatedAt"
FROM public."UserProfile"
WHERE "userKey" = 'default-user';
```

---

## 6. “重新总结没反应”最短排查

1. 前端 Network 是否发出 `POST /conversations/:id/summarize`。
2. 接口响应看 `created/merged/skipped`，`created=0` 也可能是正常（只是没有新记忆）。
3. 查 `Conversation.summarizedAt` 是否更新。
4. 若 `UserClaim` 有新增但 UI 没显示，按第 5.2 确认是否仍是 `draft` 或 `CANDIDATE/WEAK`。

---

## 7. 偏好与进化相关触发入口

- 偏好提取入口：
  - 手动：`POST /conversations/:id/summarize`
  - 自动：用户消息达到阈值（`FEATURE_AUTO_SUMMARIZE=true` + `AUTO_SUMMARIZE_THRESHOLD`）
  - 即时：命中关键词（`FEATURE_INSTANT_SUMMARIZE=true`）
- 进化建议入口：
  - 手动总结后：自动调用 `suggestEvolution`。其中 `user-preference` 变更会自动应用，`persona` 变更才进入 pending suggestion
  - 自动总结后：若总结有写入，也会触发自动进化建议，规则同上
  - 记忆密度调度：`FEATURE_EVOLUTION_SCHEDULER=true` 且达到阈值

印象确认策略：

- 默认自动写入（`FEATURE_IMPRESSION_REQUIRE_CONFIRM=false`）
- 若要恢复人工确认，改为 `FEATURE_IMPRESSION_REQUIRE_CONFIRM=true`
