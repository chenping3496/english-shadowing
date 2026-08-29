"use client";

// 发音工具：优先走阿里 DashScope TTS（/api/tts，微信/安卓内核里可靠发声），
// 失败时降级到浏览器 speechSynthesis。
async function playTts(text: string): Promise<boolean> {
  try {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { audio?: string };
    if (!data.audio) return false;
    const audio = new Audio(data.audio);
    await audio.play();
    return true;
  } catch {
    return false;
  }
}

function playFallback(text: string): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    u.rate = 0.9;
    window.speechSynthesis.speak(u);
  } catch {
    // 忽略
  }
}

/** 朗读文本：TTS 成功则用之，失败自动降级。 */
export async function speak(text: string): Promise<void> {
  if (!text) return;
  const ok = await playTts(text);
  if (!ok) playFallback(text);
}
