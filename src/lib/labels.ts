import type { GroupFull } from "@/lib/data";

type Pick = (ar: string | null | undefined, en: string | null | undefined) => string;

export function subjectName(g: GroupFull | null | undefined, pick: Pick) {
  return g?.subject ? pick(g.subject.name_ar, g.subject.name_en) : "—";
}

export function groupLabel(g: GroupFull | null | undefined, pick?: Pick) {
  if (!g) return "—";
  if (g.name?.trim()) return g.name.trim();
  const sub = g.subject ? (pick ? pick(g.subject.name_ar, g.subject.name_en) : g.subject.name_ar ?? g.subject.name_en ?? "") : "";
  const lvl = g.level ? g.level.code : "";
  const parts = [sub, lvl].filter(Boolean);
  return parts.join(" · ") || "—";
}

import type { TKey } from "@/lib/i18n";

const AGE_GROUP_KEYS: Record<string, TKey> = {
  "5-8": "ag_5_8",
  "9-10": "ag_9_10",
  "11-13": "ag_11_13",
  "14-16": "ag_14_16",
  "17+": "ag_17",
};

/** Dictionary key for an age category ("" / null → no category). */
export function ageGroupKey(g: string | null | undefined): TKey | null {
  return g ? AGE_GROUP_KEYS[g] ?? null : null;
}
