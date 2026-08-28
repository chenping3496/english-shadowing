// Web Speech API 封装（跟读识别）

export interface SpeechCallbacks {
  onInterim: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (message: string) => void;
  onEnd: () => void;
}

/** 浏览器是否支持语音识别 */
export function speechSupported(): boolean {
  if (typeof window === "undefined") return false;
  const SR =
    (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition ??
    (window as unknown as { webkitSpeechRecognition?: unknown })
      .webkitSpeechRecognition;
  return !!SR;
}

/**
 * 开始一次跟读识别（单句，英文）。返回停止函数，便于手动结束。
 */
export function startRecognition(cb: SpeechCallbacks): (() => void) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  if (!SR) {
    cb.onError("当前浏览器不支持语音识别，请使用 Chrome");
    return null;
  }

  const rec = new SR();
  rec.lang = "en-US";
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;

  rec.onresult = (e: SpeechRecognitionEvent) => {
    let interim = "";
    let final = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const res = e.results[i];
      if (res.isFinal) final += res[0].transcript;
      else interim += res[0].transcript;
    }
    if (final) cb.onFinal(final.trim());
    if (interim) cb.onInterim(interim.trim());
  };
  rec.onerror = (e: SpeechRecognitionErrorEvent) => {
    if (e.error === "no-speech") cb.onError("没有听到声音，请再试一次");
    else if (e.error === "not-allowed")
      cb.onError("麦克风权限被拒绝，请在浏览器设置中允许");
    else cb.onError(`识别出错：${e.error}`);
  };
  rec.onend = () => cb.onEnd();

  try {
    rec.start();
  } catch {
    cb.onError("无法启动识别");
    return null;
  }
  return () => rec.stop();
}

// 最小化类型声明（避免依赖 DOM lib 之外的语音类型）
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

interface SpeechRecognitionEvent {
  resultIndex: number;
  results: {
    length: number;
    [i: number]: {
      isFinal: boolean;
      0: { transcript: string };
    };
  };
}

interface SpeechRecognitionErrorEvent {
  error: string;
}
