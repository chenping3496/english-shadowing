# 部署到 CloudStudio（腾讯云）— 核心版

目标：把**核心版**（无登录，纯前端 + 少量 API 代理）跑到 CloudStudio，拿到一个公网 `https` 链接，让任何人随时打开体验。

## 前置要求

- 一个腾讯云 / 微信账号，登录 https://cloudstudio.net
- 本机的 `english-shadowing` 里有你自己的 `.env.local`（复制密钥用）

## 步骤

### 1. 新建工作空间（导入本仓库的 mvp 分支）

1. 打开 https://cloudstudio.net ，登录
2. 「新建工作空间」→ 选「从 Git 仓库导入」
3. 仓库地址填：`https://github.com/chenping3496/english-shadowing.git`
4. **分支选 `mvp`**（= 核心版 + 本部署辅助文件）
5. 运行时/环境选 **Node.js**（版本 20 或更高，参考根目录 `.nvmrc`）
6. 等它创建完成、打开工作空间

> ⚠️ 选「持久化工作空间」（绑定到你账号），别用临时/体验空间，否则文件会被清掉。

### 2. 安装依赖

打开内置终端，执行：

```bash
npm install
```

> 会下载 `@ffmpeg-installer/ffmpeg` 的二进制，国内可能慢，耐心等。

### 3. 配置密钥

```bash
cp env.example .env.local
```

然后用编辑器打开 `.env.local`，把三个密钥填进去：

- `VISION_API_KEY`（阿里云百炼的 `sk-...`）
- `BILI_SESSDATA`（bilibili 的 `SESSDATA` cookie）
- `BILI_BUVID3`（bilibili 的 `buvid3` cookie）

> 密钥只保存在你的工作空间里；`.env.local` 已被 gitignore，不会回传 GitHub。

### 4. 启动

```bash
npm run dev
```

看到 `Ready` 即成功。（想更省资源可改用 `npm run build && npm start`，但首次构建较慢。）

### 5. 开放端口、拿公网链接

1. 在 CloudStudio 界面找到「端口 / Ports」面板
2. 找到 `3000`，把它设为「公开 / Public」
3. 复制生成的公网 `https://...` 链接，发给任何人即可打开

## 注意事项

- **闲置休眠**：免费工作空间长时间没人访问会休眠，别人打开时会自动唤醒（要等几十秒）。想 24h 稳定在线，以后可走香港 Lighthouse 部署（Phase 5）。
- **bilibili cookie 会过期**：`SESSDATA` 一般几周~几个月过期，过期后「bilibili 素材」功能失效，但拍照识物、跟读、复习不受影响。
- **数据在浏览器**：核心版学习记录存在每个访客自己的浏览器里（IndexedDB），不落服务器，服务器重启不丢。
