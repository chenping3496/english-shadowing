import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @ffmpeg-installer/ffmpeg 的 index.js 用动态 require 按平台选二进制，
  // 需走原生 Node require（且其 optionalDependencies 会按部署平台安装对应 ffmpeg 二进制）
  serverExternalPackages: ["@ffmpeg-installer/ffmpeg"],
};

export default nextConfig;
