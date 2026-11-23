let ctx: AudioContext | null = null;

function tone(freq: number, start: number, duration: number, type: OscillatorType = "sine") {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, ctx.currentTime + start);
  gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(ctx.currentTime + start);
  osc.stop(ctx.currentTime + start + duration + 0.02);
}

export function beep(kind: "ok" | "warn" | "error" = "ok") {
  if (typeof window === "undefined") return;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  ctx ??= new AC();
  if (kind === "ok") tone(1046, 0, 0.12);
  if (kind === "warn") {
    tone(660, 0, 0.14, "triangle");
    tone(660, 0.2, 0.14, "triangle");
  }
  if (kind === "error") {
    tone(220, 0, 0.25, "square");
    tone(180, 0.3, 0.35, "square");
  }
}
