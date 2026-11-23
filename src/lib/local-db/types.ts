// Database table types and schema definitions for the local protected offline database.

export type Role = "admin" | "staff";

export interface LocalUser {
  id: string;
  email: string;
  username: string;
  passwordHash: string;
  salt: string;
  role: Role;
  createdAt: string;
  lastSignInAt: string | null;
}

export interface LocalSession {
  user: {
    id: string;
    email: string;
    user_metadata: { username: string };
    app_metadata: { role: Role };
  };
  access_token: string;
  token_type: string;
  expires_at: number;
}

export type TableName =
  | "academy_setup"
  | "settings"
  | "user_roles"
  | "subjects"
  | "levels"
  | "rooms"
  | "teachers"
  | "groups"
  | "students"
  | "enrollments"
  | "attendance"
  | "teacher_attendance"
  | "payments"
  | "expenses"
  | "payouts"
  | "waiting_list"
  | "_local_users";

export interface QueryFilter {
  column: string;
  op: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in" | "is" | "not";
  value: unknown;
}

export const DEFAULT_DIRECTOR_ID = "00000000-0000-4000-8000-000000000001";

export interface QueryOrder {
  column: string;
  ascending: boolean;
}

export const BACKUP_FORMAT = "beyond-words-backup";
export const BACKUP_VERSION = 1;

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

export type BackupRow = Record<string, unknown>;
export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  exported_at: string;
  tables: Record<(typeof BACKUP_TABLES)[number], BackupRow[]>;
}


/** Rows in the offline store are schemaless JSON objects; typed views live in `@/integrations/supabase/types`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DbRow = any;
