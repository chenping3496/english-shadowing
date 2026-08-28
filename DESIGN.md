# DESIGN — 声音实验室 / Shadowing Booth

> 视觉世界：把每次开口当作一次录音。拒绝语言 App 的鲜艳游戏化套路，用暗色棚内环境把注意力收在「声音」本身。

## 一句话世界观

学习者进来先看到「今天要录哪几句」；跟读时见波形、录完见仪表盘评分；30 天里 streak 与评分趋势是唯一进度语言。数字与时间码一律等宽，仿佛设备读数。

## 设计 token

### 颜色（`src/app/globals.css` `@theme`）

| 变量 | 值 | 用途 |
|---|---|---|
| `--color-booth-950` | `#0d0b09` | 页面底色（近黑暖调） |
| `--color-booth-900` | `#14110e` | 卡片面板底 |
| `--color-booth-850` | `#1a1713` | 输入框/内嵌面板底 |
| `--color-booth-800` | `#211d18` | 次级面板/进度轨道 |
| `--color-booth-700` | `#2b251e` | 描边/分隔 |
| `--color-booth-600` | `#3a322a` | 描边 hover / 图标 |
| `--color-ink-50…500` | 暖墨阶 | 文字层级（50 主文字 → 500 占位/弱化） |
| `--color-signal` | `#ff8c42` | 琥珀橙信号色（主操作/激活） |
| `--color-signal-strong` | `#ff6a1e` | 主操作 hover |
| `--color-signal-dim` | `#ff8c4224` | 信号色淡底 |
| `--color-rec` | `#ff4d3d` | 失误/漏读（评分低） |
| `--color-good` | `#7fd8a0` | 达标（评分高） |
| `--color-warn` | `#ffc94d` | 勉强/警示 |

评分语义：≥85 绿（good）· 60–84 黄（warn）· <60 红（rec）。

### 字体

- `--font-display`：Chakra Petch（数字/标题，设备感）→ `font-display`
- `--font-sans`：Archivo（正文）+ 中文回退 PingFang/雅黑 → 默认
- `--font-mono`：JetBrains Mono（时间码/元信息读数）→ `font-mono`

数字统一用 `.tabular`（等宽表格数字）或 `font-mono`，营造「仪表盘读数」。

## 视觉母题

- **波形 / VU 表**：跟读中实时波形（`animate-pulse` 交错延迟的竖条）、连续天数用 7 根竖条（`wave-bar` utility）。
- **评分仪表盘**：大号等宽数字，圆环/色块承载，分数即结果。
- **卡片 = 深一阶面板**（`bg-booth-900` + `border-booth-700`），不是亮白卡片。

## 布局与组件规范

- 手机优先：所有页面 `max-w-md` 居中（AppShell 内）；跟读/复习页 `mx-auto max-w-md`。
- 底部导航（AppShell）：今日/跟读/拍照/进度，SVG 线性图标，激活态琥珀橙 + 实心锚点。
- 主操作：`rounded-full bg-signal text-booth-950`；次操作：描边 `border-booth-600`；危险/评分按语义色描边。
- 圆角语言：卡片 `rounded-2xl`，输入/按钮 `rounded-xl`，胶囊 `rounded-full`。
- 深色主题：`color-scheme: dark`，浏览器控件（选区、焦点、滚动条）同步染色。

## 页面清单

| 路由 | 模式 | 说明 |
|---|---|---|
| `/` | 今日看板 | streak、last7、待复习/今日句数、主操作 |
| `/library` | 素材库 | 本地音视频 + .srt/粘贴、YouTube 链接，双 Tab |
| `/practice` `/practice/[id]` | 跟读 | 逐句精练：听→跟读→评分→下一句 |
| `/review` | 复习 | FSRS 间隔复习：关键词复述→显示答案→4 级自评 |
| `/snap` | 拍照识物 | 拍/选图→视觉识别→英文表达→加入 SRS |
| `/progress` | 进度 | 评分趋势(近14天)+概览 |

## 图标

`scripts/gen-icons.mjs` 无依赖生成：`public/icon-192.png`、`public/icon-512.png`（manifest）、`src/app/icon.png`（favicon）、`src/app/apple-icon.png`（iOS）。波形母题 + 深炭黑圆角底，重新生成改脚本后 `node scripts/gen-icons.mjs`。
