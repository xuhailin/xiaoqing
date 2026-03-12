# Tools Layer Conventions

- `backend/src/tools` 只放通用、可复用的基础能力（atomic capabilities）。
- 业务流程（例如电子书下载）放在 `backend/src/skills/*`，由 skill 组合 tools。
- `general_action` 仅负责单步、低风险、本地确定性动作，不承载业务编排。

当前基础工具：

- `browser/`：浏览器基础动作（launch/newPage/goto/click/fill/waitFor/close）
- `file/`：文件基础动作（白名单校验 + read/write/exists/list/ensureDir）
- `general-action/`：规则解析与单步动作执行
