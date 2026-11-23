/**
 * Local Supabase-compatible Client.
 * Drop-in offline provider powering Beyond Words without internet connection.
 */

import type { DbRow } from "./types";
import { LocalQueryBuilder } from "./query-builder";
import { localAuth } from "./auth";
import type { TableName } from "./types";
import { getTableRows, clearTable, putTableRow } from "./storage";
import { BACKUP_TABLES, type BackupFile, BACKUP_FORMAT, BACKUP_VERSION } from "./types";

export const localSupabase = {
  from(table: TableName) {
    return new LocalQueryBuilder(table);
  },

  auth: localAuth,

  async rpc(functionName: string, args: DbRow = {}) {
    if (functionName === "has_role") {
      const userId = args._user_id as string;
      const role = args._role as string;
      const roles = await getTableRows<{ user_id: string; role: string }>("user_roles");
      const has = roles.some((r) => r.user_id === userId && r.role === role);
      return { data: has, error: null };
    }

    if (functionName === "is_staff") {
      const userId = args._user_id as string;
      const roles = await getTableRows<{ user_id: string; role: string }>("user_roles");
      const isStaff = roles.some((r) => r.user_id === userId && (r.role === "staff" || r.role === "admin"));
      return { data: isStaff, error: null };
    }

    if (functionName === "director_setup_open") {
      const setup = await getTableRows("academy_setup");
      return { data: setup.length === 0, error: null };
    }

    return { data: null, error: { message: `Function ${functionName} not implemented in local mode` } };
  },

  /** Direct local backup export */
  async exportLocalData(): Promise<BackupFile> {
    const tables = {} as BackupFile["tables"];
    for (const t of BACKUP_TABLES) {
      tables[t] = (await getTableRows(t as TableName)) as any;
    }
    return {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exported_at: new Date().toISOString(),
      tables,
    };
  },

  /** Direct local backup restore */
  async restoreLocalData(backup: BackupFile): Promise<void> {
    for (const t of [...BACKUP_TABLES].reverse()) {
      await clearTable(t as TableName);
    }
    for (const t of BACKUP_TABLES) {
      const rows = backup.tables[t] || [];
      for (const r of rows) {
        await putTableRow(t as TableName, r);
      }
    }
  },
};

