# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

delegated: Next.js 16 (App Router) + TypeScript + Tailwind CSS v4 + Dexie (IndexedDB) + ts-fsrs；纯前端优先，极简后端仅 Next.js API 路由（视觉代理 + YouTube 字幕）。理由：已定「Web/PWA + 手机浏览器可用」+「纯前端优先 + 极简后端」，Next.js 单框架覆盖前后端、ts-fsrs 零依赖可跑在浏览器、Dexie 承载本地 IndexedDB。

## Users

中文母语、英语中高级水平但「开口困难」的学习者，界面中文。个人自用工具（自己 + 小范围种子用户），单机本地、暂无多用户。以手机浏览器为主要使用场景。

## Product Purpose

用英剧美剧真实片段 + 影子跟读（Shadowing）+ 英文环境塑造，在 30 天一期里实现「开口流利」。成功 = 用户每天稳定完成 15–20 分钟短会话并持续 30 天，口语由「不敢开口」到「能顺畅跟读复述」。

## Positioning

三合一机制，相邻产品难以复制：真实影视片段做素材（而非人工例句）、Shadowing 逐句精练 + 连续跟读两阶段、拍照识物把身边环境变成英文表达并自动进入 SRS 复习——以「开口」为唯一导向，区别于背单词 App 与网课。

## Operating Context

每日学习会话 15–20 分钟：热身(SRS 复习) → 逐句精练(播→跟读→评分) → 连续影子跟读 → 拍照识物(环境塑造) → 收尾(更新 streak/评分趋势)。30 天一期。素材来自用户本地导入音视频 + YouTube 链接；用户数据全存本地（localStorage/IndexedDB），无账号体系。

## Capabilities and Constraints

- 素材导入：本地音视频 + YouTube 链接（不抓取侵权内容，仅个人学习）
- 字幕：本地 .srt + YouTube 官方/自动字幕 + Whisper 转写兜底
- 跟读粒度：逐句精练 + 连续影子跟读两阶段
- i+1 分级：半自动（手动选水平 + 系统自动打难度标签）
- 复述评判：关键词提示 + 转写相似度参考 + 自我确认
- SRS 单位：句子为主 + 发音易错点单独成卡（ts-fsrs）
- 口音：美音为主
- 语音评分：MVP 用 Web Speech API（转写文本 vs 目标句比对）；Whisper 逐词置信度评分放 v2（需本地后端）
- 拍照识物：快照式 → 云端多模态视觉 API 识别物体 → 给出地道英文表达 → 自动进 SRS
- 进度看板（最简）：连续天数(streak) + 评分趋势
- 30 天一期
- 待定：视觉 API 供应商（用户暂无任何 key，默认 claude-sonnet-5，做成薄代理可换）

## Brand Commitments

无既定品牌名、logo 或视觉资产（个人工具，greenfield）。

## Evidence on Hand

无（greenfield，无真实素材、用户数据或案例）。后续工作不得虚构用户数量、评分准确率、学习效果等商业/事实性数据。

## Product Principles

1. 开口优先：一切功能服务于「让用户开口说出来」，评分与复述都围绕口语输出。
2. 可理解输入 i+1：素材难度始终略高于当前水平，保持挑战但可达成。
3. 真实素材：用影视剧真实对话，而非教材式例句。
4. 习惯驱动：短会话 + 30 天周期 + streak，用低门槛高频次养成习惯。
5. 本地隐私优先：用户学习数据留在本地，减少云端依赖。

## Accessibility & Inclusion

移动端触屏为主、界面全中文；需在手机浏览器（iOS Safari / Android Chrome）顺畅可用；语音交互需麦克风授权与 HTTPS。
