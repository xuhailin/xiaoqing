---
name: checkin
description: 企业 Web/OA 考勤打卡（上班/下班）。通过浏览器自动化打开配置的首页、复用或完成 SSO 扫码登录、授予定位、点击打卡入口与打卡按钮，并处理迟到/早退确认弹窗。适用于用户说「打卡」「帮我打卡」「上下班打卡」「考勤打卡」等；需配置 CHECKIN_TARGET_URL 与可自动化浏览器（如 Playwright）。会产生真实考勤记录，仅在用户明确授权时执行。
user-invocable: true
metadata: {openclaw: {emoji: "⏰", requires: {env: ["CHECKIN_TARGET_URL"]}}}
---

<!-- 安装：在 OpenClaw 工作区创建目录 skills/checkin/，将本文件全文另存为 SKILL.md（文件名必须为 SKILL.md）。也可放入 ~/.openclaw/skills/checkin/SKILL.md。 -->

# 考勤打卡（Web 自动化）

## 重要约束

- **真实副作用**：成功执行会在企业系统中留下**真实打卡记录**，不可在测试或未经用户明确同意时运行。
- **登录态**：依赖浏览器 `storageState` 持久化（按 `CHECKIN_SITE_KEY` 区分站点）；SSO 过期时需用户扫码。
- **定位**：页面可能校验地理位置，自动化上下文须注入 `CHECKIN_GEO_LAT` / `CHECKIN_GEO_LNG` 并授予 `geolocation` 权限。

## 环境变量（与实现一致）

| 变量 | 必填 | 默认值 / 说明 |
|------|------|----------------|
| `CHECKIN_TARGET_URL` | 是 | 打卡流程入口首页 URL；未设置则技能不可用 |
| `CHECKIN_SSO_PATTERN` | 否 | URL 包含此子串时判定为 SSO 登录页，默认 `sso/login` |
| `CHECKIN_GEO_LAT` | 否 | 默认 `31.2304` |
| `CHECKIN_GEO_LNG` | 否 | 默认 `121.4737` |
| `CHECKIN_SCAN_TIMEOUT_MS` | 否 | 扫码等待上限，默认 `300000`（5 分钟） |
| `CHECKIN_SITE_KEY` | 否 | 登录态存储 key，默认 `checkin` |
| `CHECKIN_SCREENSHOT_DIR` | 否 | 截图目录，默认 `assets/checkin-debug`（相对进程 cwd） |
| `CHECKIN_TIMEOUT_MS` | 否 | 页面操作超时，默认 `15000` |
| `LOCAL_ACTION_BROWSER_HEADLESS` | 否 | 设为 `false` 可强制有头浏览器（便于调试） |

## 推荐自动化前置条件

- 使用 **Playwright**（或等价能力）：`chromium` 上下文、`storageState` 读写、定位权限。
- 首次或过期：需能**截图二维码区域**并展示给用户扫码；扫码后轮询 URL 直至不再包含 `CHECKIN_SSO_PATTERN`。

## 执行流程（严格顺序）

1. **加载登录态**  
   从持久化读取 `storageState`（若存在），键名由 `CHECKIN_SITE_KEY` 决定。

2. **创建浏览器上下文**  
   - 注入 `storageState`（若有）  
   - `geolocation`: `{ latitude: CHECKIN_GEO_LAT, longitude: CHECKIN_GEO_LNG }`  
   - `permissions`: 包含 `geolocation`

3. **打开目标页**  
   - `goto(CHECKIN_TARGET_URL)`，等待策略用 `domcontentloaded`（避免企业站 `networkidle` 误判）  
   - 等待 `body`，再短暂 `sleep(1000)` 稳定 DOM  

4. **SSO 分支**  
   若当前 `page.url()` 包含 `CHECKIN_SSO_PATTERN`：  
   - 若曾加载过 `storageState` 仍进入登录页，视为过期：**清除**已保存的 storageState  
   - 点击 `svg.icon-qr` 展示二维码  
   - `sleep(1500)`  
   - 对选择器 `.account-form-container.center-box` **元素截图**，将图片交给用户扫码  
   - 每 `2000ms` 轮询 URL，直到**不再**包含 `CHECKIN_SSO_PATTERN` 或超过 `CHECKIN_SCAN_TIMEOUT_MS`  
   - 超时则中止并告知用户  
   - 成功后 `sleep(3000)`，若 host 与 `CHECKIN_TARGET_URL` 不一致则重新 `goto` 目标页  

5. **刷新并保存登录态**  
   `getStorageState()` 后写回持久化。

6. **进入打卡子页**  
   - `waitFor`：`img[src*="clock_in"]`  
   - `click`：同上图片（或包含该 `img` 的可点击父节点，实现上等价于点到打卡入口）  
   - `sleep(2000)`  

7. **点击打卡按钮**  
   - `waitFor`：`.sign-btn`  
   - `click`：`.sign-btn`  
   - `sleep(1500)`  

8. **异常弹窗（迟到 / 早退等）**  
   - 若存在 `.abnormal-content`：在 `.abnormal-content-footer` 下点击第一个 `div`（「继续打卡」类按钮）  
   - `sleep(1000)`  
   - 若无弹窗则忽略  

9. **结果确认**  
   全页或可视区截图保存到 `CHECKIN_SCREENSHOT_DIR`，向用户返回成功文案并附带结果图（若环境支持 URL 引用则使用资产 URL；否则以附件/路径说明）。

## CSS / 选择器清单（勿随意改动）

| 步骤 | 选择器或特征 |
|------|----------------|
| 二维码切换 | `svg.icon-qr` |
| 二维码区域截图 | `.account-form-container.center-box` |
| 打卡入口 | `img[src*="clock_in"]` |
| 打卡按钮 | `.sign-btn` |
| 异常弹窗容器 | `.abnormal-content` |
| 弹窗底部操作区 | `.abnormal-content-footer` → 第一个 `div` |

若企业前端改版导致选择器失效，需同步更新本技能文档与自动化脚本。

## 失败时排查

- **一直停在登录页**：检查 SSO 是否需额外步骤；二维码选择器是否仍有效；超时是否过短。  
- **点击打卡无反应**：确认定位权限与经纬度是否合理；网络与页面是否加载完成。  
- **找不到 `clock_in` 图**：首页结构或资源 URL 变更，需更新入口定位方式。  

## 与模型/工具的协作说明

- 本技能为**操作规范**：在 OpenClaw 中可由模型阅读后驱动 **browser / playwright** 类工具逐步执行；若使用 `command-dispatch: tool` 模式，需由宿主侧提供与上述步骤一致的工具实现。  
- **不要**在提示词中重复粘贴密钥；环境变量由 `openclaw.json` 的 `skills.entries.checkin.env` 或进程环境注入。
