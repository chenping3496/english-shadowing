"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (
      "serviceWorker" in navigator &&
      process.env.NODE_ENV === "production"
    ) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // 注册失败不影响主流程
      });
    }
  }, []);
  return null;
}
