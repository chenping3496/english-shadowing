// MediaRecorder 录音封装（跟读用）
// 替代 Web Speech：安卓 Chrome / 微信内置浏览器下 Web Speech 依赖 Google 语音服务（被墙），
// 识别不出内容。改为本地录音 → 上传后端 → 阿里 ASR。

export interface RecorderCallbacks {
  onStop: (blob: Blob) => void;
  onError: (message: string) => void;
}

/** 浏览器是否支持录音 */
export function recordingSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia
  );
}

function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  for (const c of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(c)) return c;
    } catch {
      // 某些环境 isTypeSupported 抛异常，忽略
    }
  }
  return "";
}

/** 根据 mime 推断文件扩展名（后端 ffmpeg 转码用） */
export function audioExtFromMime(mime: string): string {
  if (mime.includes("mp4")) return "m4a";
  if (mime.includes("ogg")) return "ogg";
  return "webm";
}

/**
 * 开始录音，返回停止函数（点「结束录音」或超时自动停止时调用）。
 * maxSec 秒后自动停止并触发 onStop。
 */
export function startRecording(
  cb: RecorderCallbacks,
  maxSec = 30,
): (() => void) | null {
  if (!recordingSupported()) {
    cb.onError("当前浏览器不支持录音");
    return null;
  }

  let mediaRecorder: MediaRecorder | null = null;
  let chunks: Blob[] = [];
  let timer: number | null = null;
  let finished = false;

  const finish = () => {
    if (finished) return;
    finished = true;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    try {
      mediaRecorder?.stop();
    } catch {
      // 忽略
    }
  };

  (async () => {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      cb.onError(
        e instanceof DOMException && e.name === "NotAllowedError"
          ? "麦克风权限被拒绝，请在浏览器设置中允许"
          : "无法访问麦克风",
      );
      return;
    }
    if (finished) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }

    const mime = pickMimeType();
    try {
      mediaRecorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    } catch {
      mediaRecorder = new MediaRecorder(stream);
    }

    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };
    mediaRecorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunks, {
        type: mediaRecorder?.mimeType || mime || "audio/webm",
      });
      if (blob.size > 0) cb.onStop(blob);
      else cb.onError("录音为空，请重试");
    };
    mediaRecorder.start(250);
    timer = window.setTimeout(finish, maxSec * 1000);
  })();

  return finish;
}
