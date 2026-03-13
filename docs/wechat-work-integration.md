# 企业微信接入指南

## 功能说明

小晴现在支持通过企业微信进行对话，用户可以在企业微信应用中直接与小晴交流。

## 配置步骤

### 1. 注册企业微信并创建应用

1. 访问 https://work.weixin.qq.com/ 注册企业（可注册个人企业，免费）
2. 登录管理后台，进入「应用管理」→「应用」→「创建应用」
3. 填写应用信息（名称：小晴，上传logo）
4. 记录以下信息：
   - **CorpID**：在「我的企业」页面查看
   - **AgentID**：在应用详情页查看
   - **Secret**：在应用详情页查看

### 2. 配置环境变量

在 `backend/.env` 文件中添加：

```bash
WECHAT_WORK_CORP_ID=ww1234567890abcdef
WECHAT_WORK_AGENT_ID=1000002
WECHAT_WORK_SECRET=xxxxxxxxxxxxx
WECHAT_WORK_TOKEN=xiaoqing_token_2024
WECHAT_WORK_ENCODING_AES_KEY=xxxxxxxxxxxxxx
```

说明：
- `WECHAT_WORK_TOKEN`：自己生成一个随机字符串
- `WECHAT_WORK_ENCODING_AES_KEY`：在企业微信后台点击"随机生成"

### 3. 配置回调URL（需要公网访问）

#### 方案A：使用 ngrok（本地开发推荐）

```bash
# 安装 ngrok
brew install ngrok

# 启动后端
npm run start:dev

# 另开终端，启动 ngrok
ngrok http 3000

# 会得到公网URL，如：https://abc123.ngrok.io
```

#### 方案B：部署到服务器

直接使用服务器的公网域名。

### 4. 在企业微信后台配置

1. 进入应用详情页
2. 找到「接收消息」→「设置API接收」
3. 填写：
   - **URL**：`https://your-domain.com/api/wechat-work/callback`
   - **Token**：填写 `.env` 中的 `WECHAT_WORK_TOKEN`
   - **EncodingAESKey**：点击"随机生成"，复制到 `.env` 中
4. 点击保存，企业微信会发送验证请求

### 5. 测试

1. 在企业微信中打开「小晴」应用
2. 发送消息："你好"
3. 小晴会自动回复

## 技术实现

### 架构

```
用户 → 企业微信 → 回调URL → WechatWorkController
  → WechatWorkService → ConversationService → 小晴处理
  → WechatWorkApiService → 企业微信 → 用户
```

### 核心文件

- `wechat-work.controller.ts`：处理企业微信回调
- `wechat-work.service.ts`：消息处理逻辑
- `wechat-work-api.service.ts`：调用企业微信API
- `wechat-work-crypto.service.ts`：消息加解密

## 常见问题

### Q: 回调验证失败？
A: 检查 Token 和 EncodingAESKey 是否正确配置。

### Q: 收不到消息？
A: 确保回调URL可以公网访问，检查日志是否有错误。

### Q: 如何支持图片/文件？
A: 当前只支持文本消息，后续可扩展其他消息类型。
