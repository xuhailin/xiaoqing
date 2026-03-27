# Seedance Module

这个模块提供独立的 `/seeddance/**` HTTP 接口，用于提交视频生成任务、查询状态和通过 SSE 订阅进度。

需要的环境变量：

- `ARK_API_KEY`：Volcengine ARK API Key。
- `SEEDDANCE_API_KEY`：可选，填写后会优先于 `ARK_API_KEY`。
- `SEEDDANCE_BASE_URL`：可选，默认 `https://ark.cn-beijing.volces.com/api/v3`。
- `SEEDDANCE_MODEL`：可选，默认 `doubao-seedance-1-0-pro-250528`。
- `SEEDDANCE_TIMEOUT`：可选，请求超时，默认 `120000` 毫秒。

移除方式：

1. 删除 `backend/src/seeddance/`。
2. 从 `backend/src/app.module.ts` 移除 `SeedanceModule` 的 import 和注册。
3. 删除 `frontend/src/app/seeddance/`。
4. 从 `frontend/src/app/app.routes.ts` 移除 `quick` 路由。
