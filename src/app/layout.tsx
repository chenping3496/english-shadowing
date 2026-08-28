import type { Metadata, Viewport } from "next";
import { Chakra_Petch, Archivo, JetBrains_Mono } from "next/font/google";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import "./globals.css";

/*
 * ── 设计契约（声音实验室 / Shadowing Booth）──
 * SEED: booth-0
 * THESIS: 把每次开口当作一次录音。拒绝语言 App 的鲜艳游戏化套路，用暗色棚内环境把注意力收在「声音」本身。
 * OWN-WORLD: 深炭黑棚内(近黑暖调) + 琥珀橙信号色；波形与 VU 表是视觉主轴，评分用仪表盘呈现；
 *            分数与时间码一律等宽字，仿佛设备读数；卡片是深一阶面板而非亮白卡片。
 * STORY: 学习者进来先看到「今天要录哪几句」，跟读时见波形、录完见仪表盘评分，30 天里 streak 与评分趋势是唯一进度语言。
 * FIRST VIEWPORT: 顶部小字品牌 + 今日任务概览，中央是待跟读句子与一个「开始跟读」主操作，底部四项导航(今日/跟读/拍照/进度)。
 * FORM: 声音实验室(录音棚/广播台)。
 * FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
 */

const chakra = Chakra_Petch({
  variable: "--font-chakra",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
});

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "跟读训练 · Shadowing Booth",
  description:
    "用英剧美剧片段做影子跟读，30 天练出流利口语。逐句精练、连续跟读、拍照识物，每天 15 分钟。",
  applicationName: "Shadowing Booth",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "跟读训练",
  },
};

export const viewport: Viewport = {
  themeColor: "#0d0b09",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="zh-CN"
      className={`${chakra.variable} ${archivo.variable} ${jetbrains.variable} h-full`}
    >
      <body className="min-h-full bg-booth-950 text-ink-50 antialiased">
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
