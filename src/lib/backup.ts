import { supabase } from "@/integrations/supabase/client";

export const BACKUP_FORMAT = "beyond-words-backup";
export const BACKUP_VERSION = 1;

// Insert order respects foreign keys; delete order is the reverse.
export const BACKUP_TABLES = [
  "settings",
  "subjects",
  "rooms",
  "levels",
  "teachers",
  "groups",
  "students",
  "waiting_list",
  "payouts",
  "enrollments",
  "attendance",
  "teacher_attendance",
  "payments",
  "expenses",
] as const;

type Row = Record<string, unknown>;
export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  exported_at: string;
  tables: Record<(typeof BACKUP_TABLES)[number], Row[]>;
}

// The generated client is typed per table; backup works across all tables generically.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as unknown as { from: (t: string) => any };

async function fetchAll(table: string): Promise<Row[]> {
  const out: Row[] = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    const { data, error } = await db.from(table).select("*").range(from, from + size - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data as Row[]));
    if (!data || data.length < size) break;
  }
  return out;
}

export async function exportBackup(): Promise<BackupFile> {
  const tables = {} as BackupFile["tables"];
  for (const t of BACKUP_TABLES) tables[t] = await fetchAll(t);
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exported_at: new Date().toISOString(), tables };
}

/** Integrity check before anything is replaced. */
export function validateBackup(raw: unknown): BackupFile {
  const b = raw as Partial<BackupFile>;
  if (!b || b.format !== BACKUP_FORMAT || typeof b.version !== "number" || !b.tables) throw new Error("format");
  // Backups made before teacher check-in existed have no teacher_attendance table.
  if (!Array.isArray(b.tables.teacher_attendance)) b.tables.teacher_attendance = [];
  // Backups made before the waiting list existed have no waiting_list table.
  if (!Array.isArray(b.tables.waiting_list)) b.tables.waiting_list = [];
  for (const t of BACKUP_TABLES) {
    const rows = b.tables[t];
    if (!Array.isArray(rows)) throw new Error(`missing ${t}`);
    for (const r of rows) if (!r || typeof r !== "object" || !("id" in r)) throw new Error(`bad row in ${t}`);
  }
  const ids = (t: (typeof BACKUP_TABLES)[number]) => new Set(b.tables![t].map((r) => r["id"]));
  const students = ids("students");
  const groups = ids("groups");
  for (const e of b.tables.enrollments) {
    if (!students.has(e["student_id"]) || !groups.has(e["group_id"])) throw new Error("broken enrollment reference");
  }
  return b as BackupFile;
}

async function insertChunks(table: string, rows: Row[]) {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from(table).insert(rows.slice(i, i + 500));
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

export async function restoreBackup(b: BackupFile) {
  // wipe (reverse dependency order), settings is a singleton and gets upserted
  for (const t of [...BACKUP_TABLES].reverse()) {
    if (t === "settings") continue;
    const { error } = await db.from(t).delete().not("id", "is", null);
    if (error) throw new Error(`${t}: ${error.message}`);
  }
  if (b.tables.settings[0]) {
    const { error } = await db.from("settings").upsert(b.tables.settings[0]);
    if (error) throw new Error(`settings: ${error.message}`);
  }
  for (const t of BACKUP_TABLES) {
    if (t === "settings") continue;
    if (t === "enrollments") {
      // attendance re-insert re-consumes sessions, so start at 0 and restore exact counts after
      await insertChunks(t, b.tables.enrollments.map((r) => ({ ...r, sessions_used: 0 })));
      continue;
    }
    await insertChunks(t, b.tables[t]);
  }
  for (const e of b.tables.enrollments) {
    const { error } = await db.from("enrollments").update({ sessions_used: e["sessions_used"] }).eq("id", e["id"]);
    if (error) throw new Error(`enrollments: ${error.message}`);
  }
  // Insert triggers recompute "counted"; put back the exact flags from the backup (old backups: counted).
  for (const flag of [true, false]) {
    const ids = b.tables.attendance.filter((a) => (a["counted"] ?? true) === flag).map((a) => a["id"]);
    for (let i = 0; i < ids.length; i += 200) {
      const { error } = await db.from("attendance").update({ counted: flag }).in("id", ids.slice(i, i + 200));
      if (error) throw new Error(`attendance: ${error.message}`);
    }
  }
}
