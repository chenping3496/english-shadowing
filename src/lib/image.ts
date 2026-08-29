"use client";

// 图片去重缓存 + 缩略图工具（纯前端，无第三方依赖）。
// 说明：不用 crypto.subtle（需要 https/localhost 安全上下文，局域网 http 下不可用），
// 改纯 JS FNV-1a 对 base64 全量哈希，作为「重复拍同一张图」的兜底去重 key。

/** 对图片 data URL 算一个稳定的去重哈希（长度 + FNV-1a 32-bit，十六进制）。 */
export function hashImage(dataUrl: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < dataUrl.length; i++) {
    h ^= dataUrl.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return dataUrl.length.toString(36) + "-" + (h >>> 0).toString(36);
}

/** 把图片压缩成小缩略图（JPEG data URL），用于历史列表展示，避免存原图撑爆 IndexedDB。 */
export function makeThumb(dataUrl: string, maxW = 320): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, maxW / img.width);
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("无法创建 canvas"));
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.72));
      } catch (e) {
        reject(e instanceof Error ? e : new Error("缩略图生成失败"));
      }
    };
    img.onerror = () => reject(new Error("图片加载失败"));
    img.src = dataUrl;
  });
}
