# 企业微信智能机器人接入指南

## 方案说明

使用企业微信**智能机器人**（长连接方式），比传统企业应用更简单：

✅ **不需要公网URL**（使用长连接，本地就能跑）
✅ **配置超简单**（只需要 Bot ID 和 Secret）
✅ **支持主动推送**（可以主动发消息给用户）

## 配置步骤

### 第一步：创建智能机器人（3分钟）

1. 打开企业微信客户端
2. 进入「工作台」→「智能机器人」
3. 点击「创建机器人」
4. 选择「API模式」
5. 选择「长连接」方式
6. 填写机器人信息：
   - 名称：小晴
   - 头像：上传图片
7. 创建后，记录：
   - **Bot ID**
   - **Secret**

### 第二步：配置环境变量

在 `backend/.env` 文件中添加：

```bash
WECHAT_WORK_BOT_ID=你的Bot_ID
WECHAT_WORK_BOT_SECRET=你的Secret
```

### 第三步：启动服务

```bash
cd backend
npm run start:dev
```

启动后，后端会自动连接到企业微信智能机器人。

### 第四步：测试

1. 在企业微信中找到「小晴」机器人
2. 发送消息："你好"
3. 小晴会自动回复

## 技术实现

### 架构

```
用户 → 企业微信 ←→ WebSocket长连接 ←→ 小晴后端
```

### 核心文件

- `wechat-work-bot-client.service.ts`：WebSocket 长连接客户端
- `wechat-work-bot.service.ts`：消息处理逻辑
- `wechat-work-bot.module.ts`：模块定义

### 特点

- 使用 WebSocket 长连接，不需要公网 URL
- 自动重连机制
- 支持主动推送消息

## 常见问题

### Q: 连接失败？
A: 检查 Bot ID 和 Secret 是否正确。

### Q: 收不到消息？
A: 查看后端日志，确认 WebSocket 已连接。

### Q: 如何主动推送消息？
A: 调用 `WechatWorkBotClient.sendMessage(userId, content)` 即可。
