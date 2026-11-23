/** 24-hour clock helpers — the app never shows AM/PM. */

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Keep digits only, max 4 ("17:5" -> "175"). */
export const digitsOnly = (s: string) => s.replace(/\D/g, "").slice(0, 4);

/** While typing: "1755" -> "17:55", "9" -> "9", "93" -> "93". */
export const maskTime = (d: string) => (d.length <= 2 ? d : `${d.slice(0, 2)}:${d.slice(2)}`);

/**
 * Turn whatever was typed into a strict "HH:MM" 24-hour string.
 * "930" -> "09:30", "1755" -> "17:55", "8" -> "08:00", "2599" -> "23:59", "" -> "".
 */
export function parse24(raw: string): string {
  const d = digitsOnly(raw);
  if (!d) return "";
  let h: number;
  let m: number;
  if (d.length <= 2) {
    h = Number(d);
    m = 0;
  } else if (d.length === 3) {
    h = Number(d[0]);
    m = Number(d.slice(1));
  } else {
    h = Number(d.slice(0, 2));
    m = Number(d.slice(2));
  }
  return `${pad2(Math.min(23, h))}:${pad2(Math.min(59, m))}`;
}

/** Move a "HH:MM" string by a number of minutes, clamped to the day. */
export function shift24(value: string, minutes: number): string {
  const base = parse24(value) || "00:00";
  const [hRaw = "0", mRaw = "0"] = base.split(":");
  const total = Math.max(0, Math.min(23 * 60 + 59, Number(hRaw) * 60 + Number(mRaw) + minutes));
  return `${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`;
}

/** "HH:MM" list every `stepMinutes` across the whole day. */
export function timeSlots(stepMinutes = 15): string[] {
  const out: string[] = [];
  for (let t = 0; t < 24 * 60; t += stepMinutes) out.push(`${pad2(Math.floor(t / 60))}:${pad2(t % 60)}`);
  return out;
}

/** Current local clock as "HH:MM" (24-hour). */
export function now24(d = new Date()): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export { pad2 };
