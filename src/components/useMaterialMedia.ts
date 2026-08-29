"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { db } from "@/lib/db";
import type { Material } from "@/lib/types";

export type MediaKind = "audio" | "video" | null;

export interface MaterialMedia {
  mediaKind: MediaKind;
  mediaSrc: string | null;
  mediaError: string;
  playing: boolean;
  setMediaRef: (el: HTMLMediaElement | null) => void;
  /** 媒体元素 onPause 事件处理器（用户手动暂停时同步状态） */
  onPause: () => void;
  /** 播放 [startSec, endSec] 区间，自动暂停 */
  playSegment: (startSec: number, endSec: number) => void;
  /** 暂停当前媒体（原句/视频） */
  stop: () => void;
}

/**
 * 素材媒体加载 + 区间播放（跟读 / 复习共用）：
 * - 本地素材：audioBlob → object URL（<audio>）
 * - B 站：优先 videoBlob 缓存 → 否则 /api/bilibili/play 直连 + 后台下载缓存
 * - 共享素材：sourceUrl（/api/media 或 COS 预签名地址）直连流式播放
 * - YouTube：无媒体（调用方自行处理纯文本朗读）
 */
export function useMaterialMedia(material: Material | null): MaterialMedia {
  const [mediaKind, setMediaKind] = useState<MediaKind>(null);
  const [mediaSrc, setMediaSrc] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState("");
  const [playing, setPlaying] = useState(false);
  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const endTimer = useRef<number | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  // 本地素材：用 Blob 生成 object URL
  useEffect(() => {
    if (material?.audioBlob) {
      objectUrlRef.current = URL.createObjectURL(material.audioBlob);
      setMediaSrc(objectUrlRef.current);
      setMediaKind("audio");
    }
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, [material]);

  // B 站素材：优先本地缓存，否则直连播放并后台下载缓存
  useEffect(() => {
    if (material?.type !== "bilibili") return;
    let cancelled = false;

    if (material.videoBlob) {
      const url = URL.createObjectURL(material.videoBlob);
      objectUrlRef.current = url;
      setMediaSrc(url);
      setMediaKind("video");
      setMediaError("");
      return () => {
        URL.revokeObjectURL(url);
        if (objectUrlRef.current === url) objectUrlRef.current = null;
      };
    }

    (async () => {
      try {
        const res = await fetch("/api/bilibili/play", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ input: material.sourceUrl ?? "" }),
        });
        const data = await res.json();
        if (!res.ok || !data.playUrl) {
          if (!cancelled) {
            setMediaError(data.error ?? "无法获取视频播放地址");
            setMediaKind(null);
          }
          return;
        }
        if (cancelled) return;
        setMediaSrc(data.playUrl);
        setMediaKind("video");
        setMediaError("");

        // 后台下载缓存（失败/过大则保持在线播放，不影响本次播放）
        try {
          const dl = await fetch("/api/bilibili/download", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ input: material.sourceUrl ?? "" }),
          });
          if (dl.ok) {
            const blob = await dl.blob();
            if (!cancelled && blob.size > 0) {
              await db.materials.update(material.id, { videoBlob: blob });
            }
          }
        } catch {
          // 缓存失败静默忽略，保留在线播放
        }
      } catch {
        if (!cancelled) {
          setMediaError("网络错误，无法获取视频");
          setMediaKind(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [material]);

  // 共享素材：直接流式播放服务端视频（本地磁盘或 COS 预签名地址）
  useEffect(() => {
    if (material?.type !== "shared") return;
    if (material.sourceUrl) {
      setMediaSrc(material.sourceUrl);
      setMediaKind("video");
      setMediaError("");
    } else {
      setMediaSrc(null);
      setMediaKind(null);
      setMediaError("共享视频地址缺失");
    }
  }, [material]);

  const playSegment = useCallback((startSec: number, endSec: number) => {
    const el = mediaRef.current;
    if (!el) return;
    const start = () => {
      try {
        el.currentTime = startSec;
        setPlaying(true);
        const p = el.play();
        if (p) p.catch(() => setPlaying(false));
        if (endTimer.current) clearTimeout(endTimer.current);
        endTimer.current = window.setTimeout(() => {
          el.pause();
          setPlaying(false);
        }, Math.max(600, (endSec - startSec) * 1000 + 300));
      } catch {
        setPlaying(false);
      }
    };
    if (el.readyState >= 1) start();
    else el.addEventListener("loadedmetadata", start, { once: true });
  }, []);

  const stop = useCallback(() => {
    try {
      mediaRef.current?.pause();
    } catch {
      // 忽略
    }
    if (endTimer.current) {
      clearTimeout(endTimer.current);
      endTimer.current = null;
    }
    setPlaying(false);
  }, []);

  const setMediaRef = useCallback((el: HTMLMediaElement | null) => {
    mediaRef.current = el;
  }, []);

  const onPause = useCallback(() => setPlaying(false), []);

  useEffect(() => {
    return () => {
      if (endTimer.current) clearTimeout(endTimer.current);
      try {
        mediaRef.current?.pause();
      } catch {
        // 忽略
      }
    };
  }, []);

  return {
    mediaKind,
    mediaSrc,
    mediaError,
    playing,
    setMediaRef,
    onPause,
    playSegment,
    stop,
  };
}
