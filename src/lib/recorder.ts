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
      // 显式请求高质量：单声道 + 尽量 48kHz（用 ideal 避免设备不支持时直接 OverconstrainedError）
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: { ideal: 48000 },
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
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
    // 128kbps：默认 opus 码率太低（约 20-32kbps）导致录音发糊，显式提码率
    const recorderOpts: MediaRecorderOptions = { audioBitsPerSecond: 128000 };
    if (mime) recorderOpts.mimeType = mime;
    try {
      mediaRecorder = new MediaRecorder(stream, recorderOpts);
    } catch {
      mediaRecorder = new MediaRecorder(stream, { audioBitsPerSecond: 128000 });
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
