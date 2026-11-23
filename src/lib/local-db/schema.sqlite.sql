-- ===========================================================================
-- Beyond Words Academy - Local SQLite Database Schema
-- Ready for Desktop App (Tauri / Electron)
-- ===========================================================================

PRAGMA foreign_keys = ON;

-- 1. Academy Setup Singleton
CREATE TABLE IF NOT EXISTS academy_setup (
  singleton BOOLEAN PRIMARY KEY DEFAULT 1 CHECK (singleton = 1),
  director_id TEXT NOT NULL,
  completed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 2. Academy General Settings
CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  name TEXT NOT NULL DEFAULT 'Beyond Words',
  institution_type TEXT NOT NULL DEFAULT 'academy',
  sessions_per_month INTEGER NOT NULL DEFAULT 8,
  kids_sessions_per_month INTEGER NOT NULL DEFAULT 9,
  kids_monthly_price NUMERIC NOT NULL DEFAULT 4500,
  kids_quarter_price NUMERIC NOT NULL DEFAULT 12000,
  kids_semester_price NUMERIC NOT NULL DEFAULT 20000,
  support_price NUMERIC NOT NULL DEFAULT 1500,
  default_teacher_pct NUMERIC NOT NULL DEFAULT 500,
  workshop_price NUMERIC NOT NULL DEFAULT 500,
  workshop_teacher_amount NUMERIC NOT NULL DEFAULT 300,
  phone TEXT,
  address TEXT,
  logo_url TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 3. Local Users & Auth
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'staff')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_sign_in_at TEXT
);

-- 4. User Roles (matches Supabase user_roles)
CREATE TABLE IF NOT EXISTS user_roles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'staff')),
  UNIQUE(user_id, role)
);

-- 5. Subjects
CREATE TABLE IF NOT EXISTS subjects (
  id TEXT PRIMARY KEY,
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL,
  activities TEXT NOT NULL DEFAULT '["levels"]', -- JSON array
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 6. Levels
CREATE TABLE IF NOT EXISTS levels (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  price NUMERIC NOT NULL DEFAULT 0,
  package_price NUMERIC DEFAULT NULL,
  sessions INTEGER NOT NULL DEFAULT 8,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 7. Rooms
CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL,
  capacity INTEGER NOT NULL DEFAULT 15,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 8. Teachers
CREATE TABLE IF NOT EXISTS teachers (
  id TEXT PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  full_name TEXT NOT NULL,
  gender TEXT NOT NULL DEFAULT 'male' CHECK (gender IN ('male', 'female')),
  phone TEXT,
  percentage NUMERIC NOT NULL DEFAULT 50,
  code TEXT,
  notes TEXT,
  active BOOLEAN NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 9. Groups
CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  activity TEXT NOT NULL,
  audience TEXT NOT NULL DEFAULT 'kids' CHECK (audience IN ('kids', 'adults')),
  age_group TEXT,
  subject_id TEXT REFERENCES subjects(id) ON DELETE SET NULL,
  teacher_id TEXT REFERENCES teachers(id) ON DELETE SET NULL,
  level_id TEXT REFERENCES levels(id) ON DELETE SET NULL,
  room_id TEXT REFERENCES rooms(id) ON DELETE SET NULL,
  day_of_week INTEGER,
  start_time TEXT,
  end_time TEXT,
  max_students INTEGER NOT NULL DEFAULT 15,
  price NUMERIC,
  teacher_pct NUMERIC,
  workshop_date TEXT,
  active BOOLEAN NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 10. Students
CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  gender TEXT NOT NULL DEFAULT 'male' CHECK (gender IN ('male', 'female')),
  age_group TEXT,
  birth_date TEXT,
  phone TEXT,
  parent_phone TEXT,
  code TEXT,
  photo_url TEXT,
  notes TEXT,
  active BOOLEAN NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 11. Enrollments
CREATE TABLE IF NOT EXISTS enrollments (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  plan TEXT NOT NULL DEFAULT 'monthly',
  price NUMERIC NOT NULL DEFAULT 0,
  sessions_total INTEGER NOT NULL DEFAULT 8,
  sessions_used INTEGER NOT NULL DEFAULT 0,
  payout_id TEXT REFERENCES payouts(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 12. Attendance
CREATE TABLE IF NOT EXISTS attendance (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  enrollment_id TEXT NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'present' CHECK (status IN ('present', 'absent')),
  counted BOOLEAN NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 13. Teacher Attendance (Check-in)
CREATE TABLE IF NOT EXISTS teacher_attendance (
  id TEXT PRIMARY KEY,
  teacher_id TEXT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 14. Payments
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  enrollment_id TEXT REFERENCES enrollments(id) ON DELETE SET NULL,
  amount NUMERIC NOT NULL,
  method TEXT NOT NULL DEFAULT 'cash',
  receipt_no INTEGER,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 15. Expenses
CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL DEFAULT 'general',
  amount NUMERIC NOT NULL,
  description TEXT,
  spent_on TEXT NOT NULL DEFAULT (date('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 16. Payouts
CREATE TABLE IF NOT EXISTS payouts (
  id TEXT PRIMARY KEY,
  teacher_id TEXT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  percentage NUMERIC NOT NULL,
  total_revenue NUMERIC NOT NULL DEFAULT 0,
  students_count INTEGER NOT NULL DEFAULT 0,
  details TEXT, -- JSON details
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 17. Waiting List
CREATE TABLE IF NOT EXISTS waiting_list (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  activity TEXT NOT NULL,
  subject_id TEXT REFERENCES subjects(id) ON DELETE SET NULL,
  group_id TEXT REFERENCES groups(id) ON DELETE SET NULL,
  level_id TEXT REFERENCES levels(id) ON DELETE SET NULL,
  age_group TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- SQLite Indexes for performance
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_attendance_group ON attendance(group_id, created_at);
CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance(student_id);
CREATE INDEX IF NOT EXISTS idx_teacher_att_group ON teacher_attendance(group_id, created_at);
CREATE INDEX IF NOT EXISTS idx_enrollments_student ON enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_group ON enrollments(group_id);
CREATE INDEX IF NOT EXISTS idx_payments_student ON payments(student_id);
CREATE INDEX IF NOT EXISTS idx_waiting_student ON waiting_list(student_id);

-- ---------------------------------------------------------------------------
-- SQLite Triggers: Emulating the Golden Attendance Rule
-- ---------------------------------------------------------------------------

-- Trigger: When student attendance is inserted, check if teacher attended today
CREATE TRIGGER IF NOT EXISTS trg_attendance_insert
AFTER INSERT ON attendance
FOR EACH ROW
WHEN (
  EXISTS (
    SELECT 1 FROM teacher_attendance
    WHERE group_id = NEW.group_id
      AND date(created_at) = date(NEW.created_at)
  )
)
BEGIN
  UPDATE attendance SET counted = 1 WHERE id = NEW.id;
  UPDATE enrollments SET sessions_used = sessions_used + 1 WHERE id = NEW.enrollment_id;
END;

-- Trigger: When teacher checks in, count and deduct uncounted student sessions for today
CREATE TRIGGER IF NOT EXISTS trg_teacher_checkin
AFTER INSERT ON teacher_attendance
FOR EACH ROW
BEGIN
  -- Increment sessions_used for enrollments with uncounted attendance today
  UPDATE enrollments
  SET sessions_used = sessions_used + 1
  WHERE id IN (
    SELECT enrollment_id FROM attendance
    WHERE group_id = NEW.group_id
      AND counted = 0
      AND date(created_at) = date(NEW.created_at)
  );

  -- Mark attendances as counted
  UPDATE attendance
  SET counted = 1
  WHERE group_id = NEW.group_id
    AND counted = 0
    AND date(created_at) = date(NEW.created_at);
END;

