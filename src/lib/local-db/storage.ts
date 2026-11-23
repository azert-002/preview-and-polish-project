/**
 * Persistent IndexedDB Storage Engine for Beyond Words Local Protected Database.
 * Runs 100% offline in browser, with encryption and automated seed data.
 */

import type { DbRow } from "./types";
import { hashPassword, getRandomHex } from "./crypto";
import { type LocalUser, type TableName, DEFAULT_DIRECTOR_ID } from "./types";
import { DEFAULT_DIRECTOR_PASSWORD } from "@/lib/director-setup";
import { DIRECTOR_USERNAME, loginEmail, authPassword } from "@/lib/username";

const DB_NAME = "BeyondWords_LocalDB";
const DB_VERSION = 1;
const ALL_TABLES: TableName[] = [
  "academy_setup",
  "settings",
  "user_roles",
  "subjects",
  "levels",
  "rooms",
  "teachers",
  "groups",
  "students",
  "enrollments",
  "attendance",
  "teacher_attendance",
  "payments",
  "expenses",
  "payouts",
  "waiting_list",
  "_local_users",
];

// In-memory fallback for SSR or environments without IndexedDB
const memoryStore = new Map<TableName, Map<string, DbRow>>();
for (const t of ALL_TABLES) {
  memoryStore.set(t, new Map());
}

let dbPromise: Promise<IDBDatabase> | null = null;

function hasIndexedDB(): boolean {
  return typeof window !== "undefined" && typeof window.indexedDB !== "undefined";
}

export function openLocalDB(): Promise<IDBDatabase> {
  if (!hasIndexedDB()) {
    return Promise.reject(new Error("IndexedDB is not supported in this environment"));
  }

  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const req = window.indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      for (const table of ALL_TABLES) {
        if (!db.objectStoreNames.contains(table)) {
          db.createObjectStore(table, { keyPath: "id" });
        }
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };
  });

  return dbPromise;
}

/**
 * Reads all rows from a table.
 */
export async function getTableRows<T = DbRow>(table: TableName): Promise<T[]> {
  if (!hasIndexedDB()) {
    const mem = memoryStore.get(table) ?? new Map();
    return Array.from(mem.values()) as unknown as T[];
  }

  const db = await openLocalDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(table, "readonly");
    const store = tx.objectStore(table);
    const req = store.getAll();

    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Saves or updates a row by primary key (id).
 */
export async function putTableRow(table: TableName, row: DbRow): Promise<void> {
  if (!row.id && row.id !== 0) {
    row.id = getRandomHex(12);
  }

  if (!hasIndexedDB()) {
    memoryStore.get(table)?.set(String(row.id), row);
    return;
  }

  const db = await openLocalDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(table, "readwrite");
    const store = tx.objectStore(table);
    const req = store.put(row);

    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * Deletes a row by primary key.
 */
export async function deleteTableRow(table: TableName, id: string | number): Promise<void> {
  if (!hasIndexedDB()) {
    memoryStore.get(table)?.delete(String(id));
    return;
  }

  const db = await openLocalDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(table, "readwrite");
    const store = tx.objectStore(table);
    const req = store.delete(id);

    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * Clears an entire table.
 */
export async function clearTable(table: TableName): Promise<void> {
  if (!hasIndexedDB()) {
    memoryStore.get(table)?.clear();
    return;
  }

  const db = await openLocalDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(table, "readwrite");
    const store = tx.objectStore(table);
    const req = store.clear();

    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

let isSeeded = false;
let seedPromise: Promise<void> | null = null;
const CLEAN_SEED_FLAG = "beyond_words_clean_reset_v10";

export function resetSeededFlag() {
  isSeeded = false;
  seedPromise = null;
}

/**
 * Clears all tables and reseeds the pristine default database.
 */
export async function clearAllDatabase(): Promise<void> {
  for (const t of ALL_TABLES) {
    await clearTable(t);
  }
  resetSeededFlag();
  await ensureSeeded();
}

/**
 * Seeds default data if database is fresh.
 */
export async function ensureSeeded(): Promise<void> {
  if (isSeeded) return;
  if (seedPromise) return seedPromise;
  seedPromise = doEnsureSeeded().finally(() => {
    seedPromise = null;
  });
  return seedPromise;
}

async function doEnsureSeeded(): Promise<void> {
  if (isSeeded) return;
  try {
    // One-time automatic clean reset requested by user to wipe duplicate/dirty test data
    if (typeof window !== "undefined" && window.localStorage) {
      if (!window.localStorage.getItem(CLEAN_SEED_FLAG)) {
        for (const t of ALL_TABLES) {
          await clearTable(t);
        }
        window.localStorage.setItem(CLEAN_SEED_FLAG, "true");
      }
    }

    const users = await getTableRows<LocalUser>("_local_users");
    const roles = await getTableRows<{ user_id: string; role: string }>("user_roles");
    // Seed the built-in director only while the academy has no director at all;
    // never recreate a deleted "admin" account while another director exists.
    const directorExists = users.some((u) => u.username === DIRECTOR_USERNAME) || roles.some((r) => r.role === "admin");
    if (!directorExists) {
      // 1. Create Default Director Account
      const directorId = DEFAULT_DIRECTOR_ID;
      const salt = getRandomHex(16);
      const passwordHash = await hashPassword(authPassword(DEFAULT_DIRECTOR_PASSWORD), salt);
      const director: LocalUser = {
        id: directorId,
        username: DIRECTOR_USERNAME,
        email: loginEmail(DIRECTOR_USERNAME),
        passwordHash,
        salt,
        role: "admin",
        createdAt: new Date().toISOString(),
        lastSignInAt: null,
      };
      await putTableRow("_local_users", director as unknown as DbRow);

      // 2. Setup user role
      await putTableRow("user_roles", {
        id: "role_director_admin",
        user_id: directorId,
        role: "admin",
      });

      // 3. Mark academy setup
      await putTableRow("academy_setup", {
        id: "singleton",
        singleton: true,
        director_id: directorId,
        completed_at: new Date().toISOString(),
      });
    }

    const settings = await getTableRows<DbRow>("settings");
    if (settings.length === 0) {
      await putTableRow("settings", {
        id: 1,
        name: "Beyond Words",
        institution_type: "academy",
        sessions_per_month: 8,
        kids_sessions_per_month: 9,
        kids_monthly_price: 4500,
        kids_quarter_price: 12000,
        kids_semester_price: 20000,
        support_price: 1500,
        default_teacher_pct: 500,
        workshop_price: 500,
        workshop_teacher_amount: 300,
        phone: "",
        address: "",
        logo_url: null,
        updated_at: new Date().toISOString(),
      });
    } else {
      const s = settings[0];
      let changed = false;
      if (s.support_price === 2500 || s.support_price === undefined) {
        s.support_price = 1500;
        changed = true;
      }
      if (s.kids_quarter_price === 9000 || s.kids_quarter_price === 4000 || s.kids_quarter_price === undefined) {
        s.kids_quarter_price = 12000;
        changed = true;
      }
      if (s.kids_semester_price === undefined || s.kids_semester_price === null) {
        s.kids_semester_price = 20000;
        changed = true;
      }
      if (s.kids_sessions_per_month === undefined || s.kids_sessions_per_month === null || s.kids_sessions_per_month === 8) {
        s.kids_sessions_per_month = 9;
        changed = true;
      }
      if (s.default_teacher_pct === 50 || s.default_teacher_pct === undefined) {
        s.default_teacher_pct = 500;
        changed = true;
      }
      if (s.workshop_price === undefined || s.workshop_price === null) {
        s.workshop_price = 500;
        changed = true;
      }
      if (s.workshop_teacher_amount === undefined || s.workshop_teacher_amount === null) {
        s.workshop_teacher_amount = 300;
        changed = true;
      }
      if (changed) {
        s.updated_at = new Date().toISOString();
        await putTableRow("settings", s);
      }
    }

    const targetLevels = [
      { code: "A0", price: 3000, package_price: null, sessions: 8, sort: 1 },
      { code: "A1", price: 4000, package_price: 15000, sessions: 30, sort: 2 },
      { code: "A2", price: 4000, package_price: 15000, sessions: 30, sort: 3 },
      { code: "A2+", price: 4000, package_price: 15000, sessions: 30, sort: 4 },
    ];

    const levels = await getTableRows<DbRow>("levels");
    const hasDuplicatesOrLegacy =
      levels.length !== 4 ||
      levels.some((l) => l.price === 6000 || l.price === 6500) ||
      !targetLevels.every((t) => levels.some((l) => l.code === t.code));

    if (hasDuplicatesOrLegacy) {
      await clearTable("levels");
      for (const lvl of targetLevels) {
        await putTableRow("levels", { id: getRandomHex(12), ...lvl, created_at: new Date().toISOString() });
      }
    }

    const targetRooms = [
      { id: "room_1", name_ar: "القاعة 1", name_en: "Room 1", capacity: 15, notes: null },
      { id: "room_2", name_ar: "القاعة 2", name_en: "Room 2", capacity: 15, notes: null },
      { id: "room_3", name_ar: "القاعة 3", name_en: "Room 3", capacity: 15, notes: null },
      { id: "room_4", name_ar: "القاعة 4", name_en: "Room 4", capacity: 15, notes: null },
    ];

    const rooms = await getTableRows<DbRow>("rooms");
    const hasRoomDuplicates =
      rooms.length !== 4 ||
      new Set(rooms.map((r) => r.name_ar)).size !== 4 ||
      !targetRooms.every((t) => rooms.some((r) => r.name_ar === t.name_ar));

    if (hasRoomDuplicates) {
      await clearTable("rooms");
      const baseTime = Date.now() - 10000;
      for (let i = 0; i < targetRooms.length; i++) {
        await putTableRow("rooms", {
          ...targetRooms[i],
          created_at: new Date(baseTime + (i + 1) * 1000).toISOString(),
        });
      }
    }

    const targetSubjects = [
      { id: "subj_en", name_ar: "الإنجليزية", name_en: "EN", activities: ["levels"] },
      { id: "subj_fr", name_ar: "الفرنسية", name_en: "FR", activities: ["levels"] },
      { id: "subj_de", name_ar: "الألمانية", name_en: "DE", activities: ["levels"] },
    ];

    const subjects = await getTableRows<DbRow>("subjects");
    const needsSubjectReset =
      subjects.length !== 3 ||
      subjects.some((s) => !Array.isArray(s.activities) || s.activities.length !== 1 || s.activities[0] !== "levels") ||
      !targetSubjects.every((t) => subjects.some((s) => s.name_ar === t.name_ar));

    if (needsSubjectReset) {
      await clearTable("subjects");
      const baseSubjTime = Date.now() - 10000;
      for (let i = 0; i < targetSubjects.length; i++) {
        await putTableRow("subjects", {
          ...targetSubjects[i],
          created_at: new Date(baseSubjTime + (i + 1) * 1000).toISOString(),
        });
      }
    }

    // Auto-assign BW-XXXX codes and active: true to any students missing them
    const students = await getTableRows<DbRow>("students");
    let maxCode = students.reduce((max, s) => {
      const m = String(s.code ?? "").match(/^BW-(\d+)$/);
      return m ? Math.max(max, parseInt(m[1] ?? "0", 10)) : max;
    }, 0);
    for (const s of students) {
      let changed = false;
      if (!s.code) {
        maxCode++;
        s.code = `BW-${String(maxCode).padStart(4, "0")}`;
        changed = true;
      }
      if (s.active === undefined) {
        s.active = true;
        changed = true;
      }
      if (changed) {
        await putTableRow("students", s);
      }
    }

    // Auto-assign T-XXXX codes and active: true to any teachers missing them
    const teachers = await getTableRows<DbRow>("teachers");
    let maxTeacherCode = teachers.reduce((max, t) => {
      const m = String(t.code ?? "").match(/^T-(\d+)$/);
      return m ? Math.max(max, parseInt(m[1] ?? "0", 10)) : max;
    }, 0);
    for (const t of teachers) {
      let changed = false;
      if (!t.code) {
        maxTeacherCode++;
        t.code = `T-${String(maxTeacherCode).padStart(4, "0")}`;
        changed = true;
      }
      if (t.active === undefined) {
        t.active = true;
        changed = true;
      }
      if (t.percentage === 50 || t.percentage === undefined || t.percentage === null) {
        t.percentage = 500;
        changed = true;
      }
      if (changed) {
        await putTableRow("teachers", t);
      }
    }

    // Auto-assign active: true to any groups missing it
    const groups = await getTableRows<DbRow>("groups");
    for (const g of groups) {
      if (g.active === undefined) {
        g.active = true;
        await putTableRow("groups", g);
      }
    }

    // Clean up any orphaned child records from previously deleted students
    const validStudentIds = new Set(students.map((s) => s.id as string));
    for (const tbl of ["waiting_list", "enrollments", "attendance", "payments"] as const) {
      const rows = await getTableRows<DbRow>(tbl);
      for (const r of rows) {
        if (!r.student_id || !validStudentIds.has(r.student_id as string)) {
          await deleteTableRow(tbl, r.id as string | number);
        }
      }
    }

    isSeeded = true;
  } catch (err) {
    console.warn("[LocalDB] Seed check warning:", err);
  }
}

