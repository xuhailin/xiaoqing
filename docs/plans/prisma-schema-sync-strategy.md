# Prisma 库表同步策略（db push vs migrate）

> 状态：约定文档 | 与 `docs/plans/**` 其他计划同级，**不作为** AI 默认首读；改 schema 时人类/Agent 按需打开。

## 当前阶段（默认）：`prisma db push`

**适用**：单机/小团队、开发库可丢、schema 迭代快、历史上迁移目录与真实库易漂移的场景。

**推荐流程**（在 `backend/` 下、`DATABASE_URL` 已配置）：

```bash
npx prisma db push          # 将 schema.prisma 推到当前库（不生成 migration 文件）
npx prisma generate         # 或 npm run db:generate
npm run db:seed             # 需要时写入 PersonaRule 等种子（幂等 upsert）
```

**npm 脚本**（见 `backend/package.json`）：

- `npm run db:push` — 等价 `prisma db push`
- `npm run db:generate` — 生成 Client
- `npm run db:seed` — 运行 `prisma/seed.ts`

**注意**：

- `db push` **会**按 schema 改库结构，生产环境务必先备份、确认连接的是目标库。
- 种子与「仅 push」正交：新表出现后记得跑 seed（或自行 SQL），否则依赖表数据的逻辑会走 fallback（如 `PersonaRule` 空则用 `Persona.expressionRules`）。

## 何时改为 `prisma migrate`

在出现以下任一需求时，再引入 **版本化 migration**（`migrate dev` / `migrate deploy`）：

1. **多环境可重复、可审计**：staging/prod 必须按序执行同一套 SQL，不能靠 push「对齐」。
2. **团队协作**：多人并行改库，需要 PR 里 review 迁移文件。
3. **已有生产数据**：不能承受 push 的隐式变更行为，需要显式 up/down 与回滚策略。

**切换步骤（概要）**：

1. 选一台「与线上一致」的基准库，执行 `prisma migrate diff` / `db pull` 等，把**当前真实 schema** 固化为第一条 baseline migration（或 `migrate resolve` 标记已应用），具体以 [Prisma 官方：从 introspection / baseline 迁移](https://www.prisma.io/docs/guides/migrate/developing-with-prisma-migrate/baselining) 为准。
2. 之后本地改 schema 用 `prisma migrate dev --name <意涵>` 生成 SQL；CI/CD 对目标库执行 `prisma migrate deploy`。
3. 在 README / 部署文档中写明：**禁止**对生产库随意 `db push`（除非明确是空库初始化且团队约定）。

## 与「结构化表达纪律」的关系

`PersonaRule` 等模型已在 `schema.prisma` 中定义；**不设**手写 `prisma/migrations/*.sql` 时，以 `db push` + `db:seed` 为默认落地方式。原 `structured-expression-rules.md` 里「`npx prisma migrate dev`」的验收项，在采用本策略时改为：**`db push` 成功且 `PersonaRule` 表存在、`db:seed` 后 6 条规则可查**。

## 维护

若团队正式切到 `migrate`，请在本文件顶部更新「当前阶段」勾选，并在 `docs/ai/project-index.md` 或 backend README 的数据库小节加一句入口链接，避免新人混用 push 与 deploy。
