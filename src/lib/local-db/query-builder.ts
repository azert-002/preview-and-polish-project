/**
 * PostgREST / Supabase-compatible query builder executing on top of local storage.
 */

import type { DbRow } from "./types";
import {
  getTableRows,
  putTableRow,
  deleteTableRow,
  ensureSeeded,
} from "./storage";
import {
  handleAttendanceInsert,
  handleTeacherAttendanceInsert,
  handleEnrollmentInsert,
  handleStudentDelete,
} from "./triggers";
import type { QueryFilter, QueryOrder, TableName } from "./types";
import { getRandomHex } from "./crypto";

type PostgrestResponse<T> = {
  data: T | null;
  error: { message: string } | null;
  count?: number | null;
};

export class LocalQueryBuilder<T = any> {
  private tableName: TableName;
  private action: "select" | "insert" | "update" | "upsert" | "delete" = "select";
  private payload?: any;
  private upsertOptions: { onConflict?: string; ignoreDuplicates?: boolean } | undefined;
  private selectColumns = "*";
  private filters: QueryFilter[] = [];
  private orderRules: QueryOrder[] = [];
  private rangeFrom?: number;
  private rangeTo?: number;
  private limitCount?: number;
  private isSingle = false;
  private isMaybeSingle = false;
  private countMode?: "exact" | null;
  private headMode = false;

  constructor(tableName: TableName) {
    this.tableName = tableName;
  }

  select(columns = "*", options?: { count?: "exact"; head?: boolean }): this {
    this.selectColumns = columns;
    if (options?.count) this.countMode = options.count;
    if (options?.head) this.headMode = options.head;
    return this;
  }

  insert(payload: DbRow | DbRow[]): this {
    this.action = "insert";
    this.payload = payload;
    return this;
  }

  update(payload: DbRow): this {
    this.action = "update";
    this.payload = payload;
    return this;
  }

  upsert(payload: DbRow, options?: { onConflict?: string; ignoreDuplicates?: boolean }): this {
    this.action = "upsert";
    this.payload = payload;
    this.upsertOptions = options;
    return this;
  }

  delete(): this {
    this.action = "delete";
    return this;
  }

  eq(column: string, value: unknown): this {
    this.filters.push({ column, op: "eq", value });
    return this;
  }

  neq(column: string, value: unknown): this {
    this.filters.push({ column, op: "neq", value });
    return this;
  }

  gt(column: string, value: unknown): this {
    this.filters.push({ column, op: "gt", value });
    return this;
  }

  gte(column: string, value: unknown): this {
    this.filters.push({ column, op: "gte", value });
    return this;
  }

  lt(column: string, value: unknown): this {
    this.filters.push({ column, op: "lt", value });
    return this;
  }

  lte(column: string, value: unknown): this {
    this.filters.push({ column, op: "lte", value });
    return this;
  }

  in(column: string, values: unknown[]): this {
    this.filters.push({ column, op: "in", value: values });
    return this;
  }

  is(column: string, value: unknown): this {
    this.filters.push({ column, op: "is", value });
    return this;
  }

  not(column: string, op: string, value: unknown): this {
    this.filters.push({ column, op: "not", value });
    return this;
  }

  order(column: string, options?: { ascending?: boolean }): this {
    this.orderRules.push({
      column,
      ascending: options?.ascending !== false,
    });
    return this;
  }

  limit(count: number): this {
    this.limitCount = count;
    return this;
  }

  range(from: number, to: number): this {
    this.rangeFrom = from;
    this.rangeTo = to;
    return this;
  }

  single(): Promise<PostgrestResponse<T>> {
    this.isSingle = true;
    return this.execute() as unknown as Promise<PostgrestResponse<T>>;
  }

  maybeSingle(): Promise<PostgrestResponse<T>> {
    this.isMaybeSingle = true;
    return this.execute() as unknown as Promise<PostgrestResponse<T>>;
  }

  then<TResult1 = PostgrestResponse<T[]>, TResult2 = never>(
    onfulfilled?: ((value: PostgrestResponse<T[]>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return (this.execute() as unknown as Promise<PostgrestResponse<T[]>>).then(onfulfilled, onrejected);
  }

  private applyFilters(rows: DbRow[]): DbRow[] {
    return rows.filter((row) => {
      for (const f of this.filters) {
        const val = row[f.column];
        if (f.op === "eq" && val !== f.value) return false;
        if (f.op === "neq" && val === f.value) return false;
        if (f.op === "gt" && !(val! > (f.value as any))) return false;
        if (f.op === "gte" && !(val! >= (f.value as any))) return false;
        if (f.op === "lt" && !(val! < (f.value as any))) return false;
        if (f.op === "lte" && !(val! <= (f.value as any))) return false;
        if (f.op === "in" && (!Array.isArray(f.value) || !f.value.includes(val))) return false;
        if (f.op === "is" && val !== f.value) return false;
        if (f.op === "not" && val === f.value) return false;
      }
      return true;
    });
  }

  private applyOrder(rows: DbRow[]): DbRow[] {
    if (this.orderRules.length === 0) return rows;
    return [...rows].sort((a, b) => {
      for (const o of this.orderRules) {
        const valA = a[o.column];
        const valB = b[o.column];
        if (valA === valB) continue;
        if (valA === null || valA === undefined) return o.ascending ? 1 : -1;
        if (valB === null || valB === undefined) return o.ascending ? -1 : 1;
        if (valA < valB) return o.ascending ? -1 : 1;
        if (valA > valB) return o.ascending ? 1 : -1;
      }
      return 0;
    });
  }

  private async expandRelations(rows: DbRow[]): Promise<DbRow[]> {
    if (!this.selectColumns.includes(":")) return rows;

    const needsSubjects = this.selectColumns.includes("subjects(");
    const needsTeachers = this.selectColumns.includes("teachers(");
    const needsRooms = this.selectColumns.includes("rooms(");
    const needsLevels = this.selectColumns.includes("levels(");
    const needsStudents = this.selectColumns.includes("students(");
    const needsGroups = this.selectColumns.includes("groups(");

    const [subjects, teachers, rooms, levels, students, groups] = await Promise.all([
      needsSubjects ? getTableRows("subjects") : Promise.resolve([]),
      needsTeachers ? getTableRows("teachers") : Promise.resolve([]),
      needsRooms ? getTableRows("rooms") : Promise.resolve([]),
      needsLevels ? getTableRows("levels") : Promise.resolve([]),
      needsStudents ? getTableRows("students") : Promise.resolve([]),
      needsGroups ? getTableRows("groups") : Promise.resolve([]),
    ]);

    const subjectMap = new Map(subjects.map((s) => [s.id, s]));
    const teacherMap = new Map(teachers.map((t) => [t.id, t]));
    const roomMap = new Map(rooms.map((r) => [r.id, r]));
    const levelMap = new Map(levels.map((l) => [l.id, l]));
    const studentMap = new Map(students.map((s) => [s.id, s]));

    const groupMap = new Map(
      groups.map((g) => [
        g.id,
        {
          ...g,
          subject: g.subject_id ? subjectMap.get(g.subject_id) ?? null : null,
          teacher: g.teacher_id ? teacherMap.get(g.teacher_id) ?? null : null,
          room: g.room_id ? roomMap.get(g.room_id) ?? null : null,
          level: g.level_id ? levelMap.get(g.level_id) ?? null : null,
        },
      ])
    );

    return rows.map((r) => {
      const copy = { ...r };
      if (needsSubjects && "subject_id" in copy) {
        copy.subject = copy.subject_id ? subjectMap.get(copy.subject_id as string) ?? null : null;
      }
      if (needsTeachers && "teacher_id" in copy) {
        copy.teacher = copy.teacher_id ? teacherMap.get(copy.teacher_id as string) ?? null : null;
      }
      if (needsRooms && "room_id" in copy) {
        copy.room = copy.room_id ? roomMap.get(copy.room_id as string) ?? null : null;
      }
      if (needsLevels && "level_id" in copy) {
        copy.level = copy.level_id ? levelMap.get(copy.level_id as string) ?? null : null;
      }
      if (needsStudents && "student_id" in copy) {
        copy.student = copy.student_id ? studentMap.get(copy.student_id as string) ?? null : null;
      }
      if (needsGroups && "group_id" in copy) {
        copy.group = copy.group_id ? groupMap.get(copy.group_id as string) ?? null : null;
      }
      return copy;
    });
  }

  async execute(): Promise<PostgrestResponse<any>> {
    await ensureSeeded();

    if (this.action === "insert") {
      const rows = Array.isArray(this.payload) ? this.payload : [this.payload];
      const inserted: DbRow[] = [];

      for (const r of rows) {
        const copy = { ...r };
        if (!copy.id && copy.id !== 0) copy.id = getRandomHex(12);
        if (!copy.created_at) copy.created_at = new Date().toISOString();

        // Apply database defaults that PostgreSQL would handle automatically
        if (this.tableName === "students") {
          if (copy.active === undefined) copy.active = true;
          if (copy.gender === undefined) copy.gender = "male";
          // Auto-generate student code (BW-XXXX) like the original Supabase trigger
          if (!copy.code) {
            const existing = await getTableRows("students");
            const maxNum = existing.reduce((max, s) => {
              const m = String(s.code ?? "").match(/^BW-(\d+)$/);
              return m ? Math.max(max, parseInt(m[1] ?? "0", 10)) : max;
            }, 0);
            copy.code = `BW-${String(maxNum + 1).padStart(4, "0")}`;
          }
        }
        if (this.tableName === "teachers") {
          if (copy.active === undefined) copy.active = true;
          if (copy.gender === undefined) copy.gender = "male";
          if (copy.percentage === undefined) copy.percentage = 500;
          // Auto-generate teacher code (T-XXXX)
          if (!copy.code) {
            const existing = await getTableRows("teachers");
            const maxNum = existing.reduce((max, t) => {
              const m = String(t.code ?? "").match(/^T-(\d+)$/);
              return m ? Math.max(max, parseInt(m[1] ?? "0", 10)) : max;
            }, 0);
            copy.code = `T-${String(maxNum + 1).padStart(4, "0")}`;
          }
          // Auto-compute full_name if not provided
          if (!copy.full_name && copy.last_name && copy.first_name) {
            copy.full_name = `${copy.last_name} ${copy.first_name}`;
          }
        }
        if (this.tableName === "groups") {
          if (copy.active === undefined) copy.active = true;
          if (copy.day_of_week === undefined) copy.day_of_week = 0;
        }
        if (this.tableName === "enrollments") {
          if (copy.sessions_used === undefined) copy.sessions_used = 0;
        }
        if (this.tableName === "attendance") {
          if (copy.status === undefined) copy.status = "present";
          if (copy.counted === undefined) copy.counted = false;
        }
        if (this.tableName === "rooms") {
          if (copy.capacity === undefined) copy.capacity = 15;
        }

        if (this.tableName === "attendance") {
          await handleAttendanceInsert(copy);
        } else if (this.tableName === "teacher_attendance") {
          await handleTeacherAttendanceInsert(copy);
        } else if (this.tableName === "enrollments") {
          await handleEnrollmentInsert(copy);
        }

        await putTableRow(this.tableName, copy);
        inserted.push(copy);
      }

      if (this.isSingle) {
        return { data: inserted[0] ?? null, error: null };
      }
      return { data: Array.isArray(this.payload) ? inserted : inserted[0], error: null };
    }

    if (this.action === "update") {
      const all = await getTableRows(this.tableName);
      const matched = this.applyFilters(all);
      const updated: DbRow[] = [];

      for (const row of matched) {
        const next = { ...row, ...this.payload };
        await putTableRow(this.tableName, next);
        updated.push(next);
      }

      if (this.isSingle) {
        return { data: updated[0] ?? null, error: null };
      }
      return { data: updated, error: null };
    }

    if (this.action === "upsert") {
      const copy = { ...this.payload };
      if (!copy.id && copy.id !== 0) {
        if (copy.singleton) copy.id = "singleton";
        else copy.id = getRandomHex(12);
      }
      if (!copy.created_at) copy.created_at = new Date().toISOString();

      await putTableRow(this.tableName, copy);
      if (this.isSingle) {
        return { data: copy, error: null };
      }
      return { data: [copy], error: null };
    }

    if (this.action === "delete") {
      const all = await getTableRows(this.tableName);
      const matched = this.applyFilters(all);

      for (const r of matched) {
        if (this.tableName === "students" && r.id) {
          await handleStudentDelete(r.id as string);
        }
        await deleteTableRow(this.tableName, r.id as string | number);
      }

      return { data: matched, error: null };
    }

    // Default: select
    let rows = await getTableRows(this.tableName);
    rows = this.applyFilters(rows);

    const totalCount = rows.length;
    if (this.headMode) {
      return { data: null, error: null, count: totalCount };
    }

    rows = this.applyOrder(rows);

    if (this.rangeFrom !== undefined && this.rangeTo !== undefined) {
      rows = rows.slice(this.rangeFrom, this.rangeTo + 1);
    } else if (this.limitCount !== undefined) {
      rows = rows.slice(0, this.limitCount);
    }

    rows = await this.expandRelations(rows);

    if (this.isSingle) {
      if (rows.length === 0) {
        return { data: null, error: { message: "No rows found" }, count: totalCount };
      }
      return { data: rows[0], error: null, count: totalCount };
    }

    if (this.isMaybeSingle) {
      return { data: rows[0] ?? null, error: null, count: totalCount };
    }

    return { data: rows, error: null, count: totalCount };
  }
}
