# 🕵️ 揪出人类

6 个选手里混着一个**人类**，AI 审问官轮番发问、最后投票揪人——既能纯 AI 自动开局当观赛短视频，也能**你本人亲自潜入**和 AI 斗智。

## 两种玩法

- **🤖 纯 AI 局（观赛）**：随机指定一个 AI 扮演"潜伏的人类"，其余 AI 当审问官找出它。全自动，适合录视频。
- **🙋 真人参战**：你被随机安排到某个座位，混进 AI 堆里。轮到你时在底部输入框作答、投票时点一个座位。AI 们要把你揪出来，你要骗过它们。

> 设计上把"座位"抽象成一个可替换的应答源：AI 座位用模型应答，真人座位用输入框应答，游戏流程完全一致——所以真人模式就是把某个座位的应答源换成你。

## 流程

1. 开场：宣布"N 人中混进了 1 个人类"。
2. **两轮审问**：每轮抛一个专挑"人味/AI 味"的问题（如"不许用计算器，357×48 估个大概""最近一次想哭是因为啥"），所有座位依次作答。全程只显示"N 号"，模型名藏到揭晓。
3. **投票**：每个 AI 审问官投出它认为最像真人的座位并给理由；真人（目标）也投一票把怀疑引开。
4. **揭晓**：亮出谁是人类、是否被揪出，以及每个座位背后的真实模型。

胜负：多数票指向真人 → 揪出成功（审问方赢）；否则 → 人类潜伏成功。

## 部署到 Netlify

1. 推到 GitHub → Netlify 导入（自带 netlify.toml）。
2. Environment variables 里加 .env.example 里的变量：ACCESS_PASSWORD + PLAYER_1_* ~ PLAYER_6_*（BASE_URL / API_KEY / MODEL / DISPLAY_NAME）。**这 24 个模型变量与谁是卧底/戏精现场/辩论赛完全一致，直接照搬。**
3. Deploy。构建若因密钥扫描失败，加 SECRETS_SCAN_ENABLED=false。

槽位↔模型默认映射：1=智谱 2=DeepSeek 3=千问 4=Kimi 5=豆包 6=MiniMax。

## 本地开发

\`\`\`bash
npm install
cp .env.example .env.local
npm run dev
\`\`\`

## 技术栈

Next.js 14（App Router）+ React 18 + Tailwind 3。后端 app/api/human/route.js 是 Edge Function 代理。前端 components/HumanHunt.jsx：真人输入通过"异步循环 await 一个由提交按钮兑现的 Promise"实现暂停/续跑。
