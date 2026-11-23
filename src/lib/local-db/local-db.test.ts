import { describe, it, expect, beforeEach } from "vitest";
import { hashPassword, verifyPassword, encryptData, decryptData } from "./crypto";
import { localSupabase } from "./local-client";
import { clearTable, getTableRows, resetSeededFlag } from "./storage";
import { DEFAULT_DIRECTOR_PASSWORD } from "@/lib/director-setup";
import { DIRECTOR_USERNAME, loginEmail } from "@/lib/username";

describe("Local Protected Database Suite", () => {
  beforeEach(async () => {
    resetSeededFlag();
    // Clear in-memory / test collections
    const tables = [
      "settings", "user_roles", "subjects", "levels", "rooms",
      "teachers", "groups", "students", "enrollments", "attendance",
      "teacher_attendance", "payments", "expenses", "payouts", "waiting_list", "_local_users",
    ] as const;
    for (const t of tables) {
      await clearTable(t as any);
    }
  });

  describe("Security & Cryptography", () => {
    it("hashes passwords with PBKDF2 and verifies them correctly", async () => {
      const password = "mySecretPassword123";
      const salt = "randomSalt123456";
      const hash = await hashPassword(password, salt);

      expect(hash).toBeDefined();
      expect(hash.length).toBe(64); // 256 bits = 64 hex chars

      const isMatch = await verifyPassword(password, salt, hash);
      expect(isMatch).toBe(true);

      const isWrong = await verifyPassword("wrongPassword", salt, hash);
      expect(isWrong).toBe(false);
    });

    it("encrypts and decrypts sensitive data at rest using AES-256-GCM", async () => {
      const confidential = {
        studentPhone: "0555123456",
        parentPhone: "0666123456",
        paidAmount: 7000,
      };

      const encrypted = await encryptData(confidential);
      expect(typeof encrypted).toBe("string");
      expect(encrypted).not.toContain("0555123456");

      const decrypted = await decryptData<typeof confidential>(encrypted);
      expect(decrypted).toEqual(confidential);
    });
  });

  describe("Authentication & Auto-Seeding", () => {
    it("auto-seeds the director account and allows sign in with default credentials", async () => {
      const email = loginEmail(DIRECTOR_USERNAME);
      const res = await localSupabase.auth.signInWithPassword({
        email,
        password: DEFAULT_DIRECTOR_PASSWORD,
      });

      expect(res.error).toBeNull();
      expect(res.data.user).toBeDefined();
      expect(res.data.session?.user.user_metadata.username).toBe(DIRECTOR_USERNAME);

      const sessionRes = await localSupabase.auth.getSession();
      expect(sessionRes.data.session?.user.email).toBe(email);
    });

    it("rejects invalid passwords", async () => {
      const email = loginEmail(DIRECTOR_USERNAME);
      const res = await localSupabase.auth.signInWithPassword({
        email,
        password: "IncorrectPassword",
      });

      expect(res.error).toBeDefined();
      expect(res.data.user).toBeNull();
    });
  });

  describe("Queries & Business Triggers", () => {
    it("handles CRUD operations and filtering", async () => {
      // 1. Insert teacher
      const { data: teacher } = await localSupabase.from("teachers").insert({
        first_name: "Karim",
        last_name: "Amrani",
        full_name: "Karim Amrani",
        gender: "male",
        percentage: 50,
      }).select().single();

      expect(teacher.id).toBeDefined();
      expect(teacher.full_name).toBe("Karim Amrani");

      // 2. Query with filter
      const { data: found } = await localSupabase.from("teachers").select("*").eq("id", teacher.id);
      expect(found).toHaveLength(1);
      expect(found![0].full_name).toBe("Karim Amrani");

      // 3. Update
      await localSupabase.from("teachers").update({ percentage: 55 }).eq("id", teacher.id);
      const { data: updated } = await localSupabase.from("teachers").select("*").eq("id", teacher.id).single();
      expect(updated.percentage).toBe(55);

      // 4. Delete
      await localSupabase.from("teachers").delete().eq("id", teacher.id);
      const { data: afterDel } = await localSupabase.from("teachers").select("*").eq("id", teacher.id);
      expect(afterDel).toHaveLength(0);
    });

    it("emulates the golden attendance rule: attendance stays uncounted until teacher checks in", async () => {
      // Create student, group, enrollment
      const { data: student } = await localSupabase.from("students").insert({
        first_name: "Amina",
        last_name: "Benali",
        gender: "female",
      }).select().single();

      const { data: teacher } = await localSupabase.from("teachers").insert({
        first_name: "Nadia",
        last_name: "Saidi",
        full_name: "Nadia Saidi",
        gender: "female",
      }).select().single();

      const { data: group } = await localSupabase.from("groups").insert({
        name: "English Kids A1",
        activity: "levels",
        teacher_id: teacher.id,
      }).select().single();

      const { data: enrollment } = await localSupabase.from("enrollments").insert({
        student_id: student.id,
        group_id: group.id,
        sessions_total: 8,
        sessions_used: 0,
        price: 3500,
      }).select().single();

      // Step 1: Student attends BEFORE teacher arrives
      const { data: att } = await localSupabase.from("attendance").insert({
        student_id: student.id,
        group_id: group.id,
        enrollment_id: enrollment.id,
        status: "present",
      }).select("counted").single();

      // Golden Rule: Teacher not checked in yet -> counted must be FALSE
      expect(att.counted).toBe(false);

      // Enrollment sessions_used must still be 0
      const { data: enrBefore } = await localSupabase.from("enrollments").select("*").eq("id", enrollment.id).single();
      expect(enrBefore.sessions_used).toBe(0);

      // Step 2: Teacher arrives and checks in
      await localSupabase.from("teacher_attendance").insert({
        teacher_id: teacher.id,
        group_id: group.id,
      });

      // Golden Rule Trigger: Now attendance must automatically become counted = TRUE
      const { data: attAfter } = await localSupabase.from("attendance").select("*").eq("student_id", student.id).single();
      expect(attAfter.counted).toBe(true);

      // And enrollment sessions_used must now be incremented to 1
      const { data: enrAfter } = await localSupabase.from("enrollments").select("*").eq("id", enrollment.id).single();
      expect(enrAfter.sessions_used).toBe(1);
    });

    it("deleting a student cascade deletes waiting_list, enrollments, attendance, and payments with no trace", async () => {
      const { data: student } = await localSupabase.from("students").insert({
        first_name: "محمد",
        last_name: "علي",
        gender: "male",
      }).select().single();

      await localSupabase.from("waiting_list").insert({
        student_id: student.id,
        activity: "support",
      });

      await localSupabase.from("enrollments").insert({
        student_id: student.id,
        sessions_total: 8,
        sessions_used: 0,
        price: 1500,
      });

      await localSupabase.from("attendance").insert({
        student_id: student.id,
        status: "present",
      });

      await localSupabase.from("payments").insert({
        student_id: student.id,
        amount: 1500,
        receipt_no: 101,
      });

      const { data: wlBefore } = await localSupabase.from("waiting_list").select("*").eq("student_id", student.id);
      expect(wlBefore!.length).toBe(1);

      await localSupabase.from("students").delete().eq("id", student.id);

      const { data: wlAfter } = await localSupabase.from("waiting_list").select("*").eq("student_id", student.id);
      expect(wlAfter!.length).toBe(0);

      const { data: enrAfter } = await localSupabase.from("enrollments").select("*").eq("student_id", student.id);
      expect(enrAfter!.length).toBe(0);

      const { data: attAfter } = await localSupabase.from("attendance").select("*").eq("student_id", student.id);
      expect(attAfter!.length).toBe(0);

      const { data: payAfter } = await localSupabase.from("payments").select("*").eq("student_id", student.id);
      expect(payAfter!.length).toBe(0);
    });
  });

  describe("Backup Export & Restore", () => {
    it("exports and restores data cleanly", async () => {
      await localSupabase.from("rooms").insert({
        name_ar: "قاعة الاختبار",
        name_en: "Test Room",
        capacity: 20,
      });

      const backup = await localSupabase.exportLocalData();
      expect(backup.tables.rooms.length).toBeGreaterThan(0);

      // Clear table
      await clearTable("rooms");
      const { data: empty } = await localSupabase.from("rooms").select("*");
      expect(empty!.length).toBe(0);

      // Restore from backup
      await localSupabase.restoreLocalData(backup);
      const { data: restored } = await localSupabase.from("rooms").select("*");
      expect(restored!.length).toBeGreaterThan(0);
    });
  });
});

