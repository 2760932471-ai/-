# AI数字员工协作工作台 · V0.3

按慕雅居方案V2.4建设岗位员工与能力装配：12类岗位模板、134项规划能力目录、10个可执行代码Skill、4名默认试点员工。支持真实后端持久化、群聊、团队目标、模型接入与有上限的执行循环。

**当前默认是规则试运行。模型适配已实现，但尚未用用户账号完成真实模型验证；店铺业务写入未接通。**

## 从这里开始

- [数字员工建设与使用说明](docs/数字员工能力建设_V0.3.md)：点击行为、异常、能力范围及模型接入。
- [项目交接与需求结论](PROJECT_CONTEXT.md)：在本地新会话继续工作的上下文。
- [本地使用说明](docs/本地使用与会话说明.md)：克隆、打开文件和聊天记录的区别。
- [网址预览部署](docs/网址预览部署.md)：GitHub Pages一次性设置。

```sh
git clone --branch main https://github.com/2760932471-ai/-.git ai-workbench
cd ai-workbench
npm start
```

Node.js 22+。规则运行无需第三方依赖；可选本机Codex接入另装官方SDK。Windows可双击`start-platform.cmd`，macOS/Linux执行`bash start-platform.sh`，启动脚本读取`.env`。默认端口3000，本机地址仅供运行服务的同一台电脑访问。

## 先体验

用浏览器打开`deliverables/ai-platform-preview.html`，或者启用仓库`gh-pages`分支的Pages站点。单文件预览内嵌样式和逻辑，可以创建员工、筛选能力、测试Skill、执行团队规则任务；不调用真实模型，数据只存当前浏览器。

![当前数字员工界面](deliverables/workforce-employees.png)

推荐：数字员工 → 查看四名规则员工 → 新建“为角阀准备上新资料” → 填写资料 → 确认计划 → 查看员工逐步交付。能力中心会区分规划中、部分实现和已实现限定能力。

## 使用 ChatGPT Plus / Pro 订阅

订阅额度不能直接当成API余额。可在**自己的电脑**用ChatGPT登录官方Codex，再通过本平台的本机桥接调用套餐内Codex配额：

```sh
npm install -g @openai/codex
codex
npm run setup:codex
```

`codex`启动后选择 **Sign in with ChatGPT**。项目`.env`中设置`ENABLE_CODEX_LOCAL=1`和私有的`PLATFORM_TOKEN`，再用启动脚本运行服务。开启桥接后服务只绑定127.0.0.1。

进入“能力中心 → 模型连接”，添加“本机Codex”，测试通过后装配到员工。模型名可留空使用Codex默认模型。**GitHub Pages不能使用此接入；登录、额度和真实调用尚需在你本机验证。**

另一条路线是配置OpenAI兼容API的HTTPS地址、模型标识和服务器密钥变量名，使用独立API额度。两种方式都不需要在聊天中发送密钥或账号凭证。

## 运行机制与限制

- 新建目标保留自然语言输入、成员选择和范围确认；业务类型推荐仍为关键词规则。
- 团队成员按用户确认的列表顺序交接成果；各模型员工内部按目标选择已装配Skill，不是自主跨岗位规划。
- 所有当前Skill只读输入。模型不能任意联网、执行代码、覆盖输入事实或发布商品。
- 缺资料等待补录，失败可重试，旧版本结果丢弃，运行记录保存输入、配置版本、轨迹与成果。
- 角色权限、多用户、事件感知、真实业务连接与完整方案仍待建设。
- `.data/platform.json`原子保存，适用于当前单进程开发版；运行数据和`.env`不提交Git。

## 开发与发布

```sh
npm run check
npm test
npm run demo
npm run pack
npm run deploy:preview
```

`demo`更新当前预览；`pack`需要Python3并生成`deliverables/ai-platform-0.3.0.zip`；`deploy:preview`只向gh-pages发布HTML及.nojekyll。推送成功不等于Pages站点已经构建上线。

`src/workforce/`包含能力目录、Skill、员工配置、模型/API/Codex适配、执行循环与团队任务。`public/workforce.js`为员工和能力中心界面。旧版规则与模拟发布保留兼容，V0.2说明及PRD中未实现条款不能当作本版已交付能力。
