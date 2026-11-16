# Codespaces 免平台 Token 启动

V0.18.1 在 `CODESPACES=true` 时自动使用 Codespaces 访问方式。不需要填写或同步 `PLATFORM_TOKEN`，即使 `.env`、Codespaces Secrets 或浏览器里仍有旧值，也不会拦截请求。网页会自动清除本次浏览器会话保存的旧平台 Token。

## 现有 Codespace 更新

1. 在正在运行 Node 服务的终端按 **Ctrl+C**，停止旧进程。
2. 在仓库目录执行：

   ```bash
   git pull --ff-only origin main
   npm start
   ```

3. 看到启动输出 `access: codespaces`。在 **Ports / 端口** 面板保持 3000 的可见性为 **Private / 私有**，点击打开浏览器并刷新。访问由 GitHub 的 Codespaces 登录保护，应用不再二次要求 Token；不要把这个免登录端口设为 Public。

无需重新创建工作空间，无需删除 `.data` 或清空浏览器数据。旧 `PLATFORM_TOKEN` 可以删除，也可以保留：Codespaces 模式会忽略它。`npm start`、`npm run dev`、启动脚本和 `node src/server.js` 现在都读取项目根目录的 `.env`；同名宿主环境变量仍优先，修改凭证后需重启服务。

## 验证

在另一个终端执行（如果修改了 PORT，替换 3000）：

```bash
curl -s http://127.0.0.1:3000/api/health
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/api/workspaces
```

第一条应包含 `"authenticationRequired":false` 和 `"accessMode":"codespaces"`；第二条应返回 `200`，无需 Authorization 请求头。

若仍返回 401，检查第一条的 `accessMode`。缺少该字段说明仍在运行旧代码；`token` 表示服务没有识别为 Codespaces。确认更新的是当前启动服务所在仓库，停止旧终端里的 Node，再从 Codespaces 终端运行 `npm start`。如果启动显示 `EADDRINUSE`，端口仍被旧进程占用，应先停止旧服务。

## 图片、店铺和模型

- 生图只检查图片服务密钥及服务配置，不再检查平台 Token。仍需在服务器安全设置 `IMAGE_SECRET_GEMINI`，允许 Google API 域名，并在页面保存、启用图片服务。图片 API 的权限、额度或 429 等错误与平台登录无关。
- 店铺上下架仍需店铺授权令牌、应用凭证、操作确认与回查，取消的是额外的平台 Token 门槛。
- 本机 Codex 桥接仍需 `ENABLE_CODEX_LOCAL=1`、官方 SDK 与自己的 ChatGPT 登录；启用时服务只监听 127.0.0.1。
- Codespaces 以外：没有平台 Token 时默认只监听本机；已配置 Token 的公网部署保留鉴权，避免已有公网服务意外开放。

本次自动化测试使用模拟 Gemini 与店铺接口，不代表已验证用户账号的真实权限或额度。
