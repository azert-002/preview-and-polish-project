// Pure business rules for Beyond Words (pricing, packages, payroll).

export type Activity = "support" | "levels" | "workshop";
export type Audience = "kids" | "adults";
export type PlanKind = "monthly" | "quarter" | "semester" | "four_months" | "single";

export const ADULT_AGE = 17;

export function ageOn(birth: string | null | undefined, ref: Date = new Date()): number | null {
  if (!birth) return null;
  const b = new Date(birth);
  if (Number.isNaN(b.getTime())) return null;
  let age = ref.getFullYear() - b.getFullYear();
  const m = ref.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < b.getDate())) age--;
  return age;
}

export function audienceFor(birth: string | null | undefined, ref?: Date): Audience {
  const a = ageOn(birth, ref);
  return a != null && a >= ADULT_AGE ? "adults" : "kids";
}

export interface PricingSettings {
  support_price: number;
  sessions_per_month: number;
  kids_sessions_per_month?: number;
  kids_monthly_price: number;
  kids_quarter_price: number;
  kids_semester_price?: number;
}

export interface PackageBlock {
  sessions: number;
  price: number;
}

export interface PackagePlan {
  plan: PlanKind;
  blocks: PackageBlock[];
  total: number;
}

/** Split an amount into n integer parts that sum exactly to the total. */
export function splitAmount(total: number, n: number): number[] {
  const base = Math.floor(total / n);
  const rest = Math.round(total - base * n);
  return Array.from({ length: n }, (_, i) => base + (i < rest ? 1 : 0));
}

/**
 * Builds the session package(s) for an enrollment.
 * - Kids packages (3 months = 24 sessions @ 12,000 DZD; 6 months = 48 sessions @ 20,000 DZD)
 *   are stored as 8-session blocks so teacher is paid per completed 8 sessions.
 * - Adult levels (A0 = 3,000 DZD monthly; A1/A2/A2+ = 4,000 DZD monthly or 15,000 DZD for 4 months / 30 sessions).
 *   The 4-month (30 session) package is split into 4 blocks (8, 8, 8, 6 sessions).
 */
export function buildPackage(opts: {
  activity: Activity;
  audience: Audience;
  plan: PlanKind;
  settings: PricingSettings;
  level?: { price: number; sessions: number; package_price?: number | null; code?: string } | null;
  workshopPrice?: number | null;
}): PackagePlan {
  const { activity, audience, settings, plan } = opts;
  const spm = settings.sessions_per_month || 8;

  if (activity === "workshop") {
    const price = Number(opts.workshopPrice ?? 0);
    return { plan: "single", blocks: [{ sessions: 1, price }], total: price };
  }

  // Adults: A0 (3000 / month, 8 sessions), A1/A2/A2+ (4000 / month, or 15000 for 4 months / 30 sessions)
  if (audience === "adults") {
    if (activity === "support") {
      const price = Number(settings.support_price);
      return { plan: "monthly", blocks: [{ sessions: spm, price }], total: price };
    }

    const levelPrice = Number(opts.level?.price ?? 4000);
    const packagePrice = Number(opts.level?.package_price ?? 0);
    const totalSessions = Number(opts.level?.sessions ?? 30);

    // 4-month package / full level (30 sessions as one whole level)
    if (plan === "four_months" || (plan !== "monthly" && (packagePrice > 0 || totalSessions >= 30))) {
      const total = packagePrice > 0 ? packagePrice : 15000;
      const sessions = totalSessions > 0 ? totalSessions : 30;
      return { plan: "four_months", blocks: [{ sessions, price: total }], total };
    }

    // Monthly for adults (A0 = 3000, A1/A2/A2+ = 4000)
    const monthlyPrice = levelPrice > 0 ? levelPrice : 3000;
    return {
      plan: "monthly",
      blocks: [{ sessions: spm, price: monthlyPrice }],
      total: monthlyPrice,
    };
  }

  // Kids: 5 categories for support & levels (9 sessions/month: 3 months = 27 sessions @ 12000, 6 months = 54 sessions @ 20000)
  const kidsSpm = Number(settings.kids_sessions_per_month ?? 9);

  if (plan === "semester") {
    const total = Number(settings.kids_semester_price ?? 20000);
    return {
      plan: "semester",
      blocks: [{ sessions: kidsSpm * 6, price: total }],
      total,
    };
  }

  if (plan === "quarter") {
    const total = Number(settings.kids_quarter_price ?? 12000);
    return {
      plan: "quarter",
      blocks: [{ sessions: kidsSpm * 3, price: total }],
      total,
    };
  }

  // Monthly for kids
  const price = activity === "support"
    ? Number(settings.support_price)
    : Number(settings.kids_monthly_price ?? 4500);
  return { plan: "monthly", blocks: [{ sessions: kidsSpm, price }], total: price };
}

export interface PayrollEnrollment {
  sessions_used: number;
  sessions_total: number;
  price: number;
  payout_id: string | null;
}

export function remainingSessions(e: { sessions_used?: number | null; sessions_total?: number | null } | null | undefined) {
  if (!e) return 0;
  const total = Number(e.sessions_total ?? 0);
  const used = Number(e.sessions_used ?? 0);
  return Math.max(total - used, 0);
}

/**
 * Students counted as registered in a group: everyone enrolled in a one-day workshop
 * (even after attending its single session), otherwise those with sessions left.
 */
export function groupStudentIds(
  activity: string | null | undefined,
  enrollments: { student_id: string; sessions_used: number; sessions_total: number }[],
) {
  const list = activity === "workshop" ? enrollments : enrollments.filter((e) => remainingSessions(e) > 0);
  return new Set(list.map((e) => e.student_id));
}

/**
 * Golden rule: the teacher earns a fixed amount per student (default 500 DZD monthly
 * for support and levels/languages, 300 DZD for daily workshops, or customized per teacher/group)
 * only for packages/blocks that were fully consumed (whether present or absent).
 * Incomplete packages roll over ("deferred").
 * Daily workshops are 1-session packages, so they become payable as soon as that session is completed.
 */
export function splitPayroll<T extends PayrollEnrollment>(
  enrollments: T[],
  defaultAmount: number = 500,
  amountFor?: (e: T) => number,
) {
  const unpaid = enrollments.filter((e) => !e.payout_id);
  const eligible = unpaid.filter((e) => e.sessions_used >= e.sessions_total);
  const deferred = unpaid.filter((e) => e.sessions_used < e.sessions_total);
  const revenue = eligible.reduce((s, e) => s + Number(e.price), 0);
  const share = eligible.reduce((s, e) => {
    const amt = amountFor ? Number(amountFor(e)) : Number(defaultAmount);
    return s + amt;
  }, 0);
  const effectiveAmount = eligible.length > 0 ? Math.round(share / eligible.length) : Number(defaultAmount);
  const effectivePct = revenue > 0 ? Math.round((share / revenue) * 1000) / 10 : 0;
  return { eligible, deferred, revenue, share, effectiveAmount, effectivePct };
}

// ---------------------------------------------------------------------------
// Student account (debts / credit)
// ---------------------------------------------------------------------------

export interface LedgerEnrollment {
  id: string;
  group_id: string;
  created_at: string;
  price: number | string;
}

export interface LedgerPayment {
  id: string;
  enrollment_id: string | null;
  amount: number | string;
  created_at: string;
}

export interface LedgerBundle<E extends LedgerEnrollment> {
  /** Stable key: one package = blocks inserted together for the same group. */
  key: string;
  enrollments: E[];
  /** Enrollment id that new payments for this package are linked to. */
  firstId: string;
  createdAt: string;
  price: number;
  /** Payments recorded directly against this package (may exceed price). */
  paidDirect: number;
  /** Part of the price covered by the student's credit (unlinked/extra money). */
  fromCredit: number;
  /** What the student still owes for this package. */
  remaining: number;
}

export interface StudentLedger<E extends LedgerEnrollment, P extends LedgerPayment> {
  bundles: LedgerBundle<E>[];
  /** Payments that are not attached to any existing package (e.g. its group was deleted). */
  unlinked: P[];
  due: number;
  paid: number;
  /** Total the student still owes. */
  debt: number;
  /** Money paid beyond everything owed (in the student's favour). */
  credit: number;
}

const money2 = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
const byDate = (a: { created_at?: string | null }, b: { created_at?: string | null }) =>
  (a?.created_at ?? "").localeCompare(b?.created_at ?? "");

export function bundleKey(e: { group_id?: string | null; created_at?: string | null }) {
  return `${e?.group_id ?? ""}|${e?.created_at ?? ""}`;
}

/**
 * Builds a student's account. Payments count toward the package they were
 * recorded for; extra money and payments without a package become credit,
 * which automatically covers the oldest unpaid packages first.
 * Invariant: due - paid === debt - credit.
 */
export function studentLedger<E extends LedgerEnrollment, P extends LedgerPayment>(
  enrollments: E[],
  payments: P[],
): StudentLedger<E, P> {
  const bundles: LedgerBundle<E>[] = [];
  const byKey = new Map<string, LedgerBundle<E>>();
  const byEnrollment = new Map<string, LedgerBundle<E>>();

  const safeEnrollments = (enrollments || []).filter(Boolean);
  const safePayments = (payments || []).filter(Boolean);

  for (const e of [...safeEnrollments].sort(byDate)) {
    const key = bundleKey(e);
    let b = byKey.get(key);
    if (!b) {
      b = { key, enrollments: [], firstId: e.id, createdAt: e.created_at ?? new Date().toISOString(), price: 0, paidDirect: 0, fromCredit: 0, remaining: 0 };
      byKey.set(key, b);
      bundles.push(b);
    }
    b.enrollments.push(e);
    b.price = money2(b.price + Number(e.price ?? 0));
    byEnrollment.set(e.id, b);
  }

  const unlinked: P[] = [];
  let pool = 0;
  for (const p of [...safePayments].sort(byDate)) {
    const b = p.enrollment_id ? byEnrollment.get(p.enrollment_id) : undefined;
    if (b) b.paidDirect = money2(b.paidDirect + Number(p.amount ?? 0));
    else {
      unlinked.push(p);
      pool = money2(pool + Number(p.amount ?? 0));
    }
  }

  for (const b of bundles) pool = money2(pool + Math.max(b.paidDirect - b.price, 0));
  for (const b of bundles) {
    const need = Math.max(money2(b.price - b.paidDirect), 0);
    const use = Math.min(need, pool);
    b.fromCredit = use;
    pool = money2(pool - use);
    b.remaining = money2(need - use);
  }

  const due = money2(bundles.reduce((s, b) => s + b.price, 0));
  const paid = money2(safePayments.reduce((s, p) => s + Number(p.amount ?? 0), 0));
  const debt = money2(bundles.reduce((s, b) => s + b.remaining, 0));
  return { bundles, unlinked, due, paid, debt, credit: pool };
}

export type PaymentError = "invalidAmount" | "exceedsDebt" | null;

/** A debt payment must be a positive amount no larger than what is still owed. */
export function validatePayment(amount: number, remaining: number): PaymentError {
  if (!Number.isFinite(amount) || amount <= 0) return "invalidAmount";
  if (amount > remaining + 0.001) return "exceedsDebt";
  return null;
}

/** Totals to print on a receipt: package price, paid before this receipt, and what is left after it. */
export function receiptFigures<E extends LedgerEnrollment, P extends LedgerPayment>(
  payment: P,
  enrollments: E[],
  payments: P[],
) {
  const amount = Number(payment.amount);
  const ledger = studentLedger(enrollments, []);
  const bundle = ledger.bundles.find((b) => b.enrollments.some((e) => e.id === payment.enrollment_id));
  if (!bundle) return { total: amount, previous: 0, remaining: 0 };
  const ids = new Set(bundle.enrollments.map((e) => e.id));
  const sorted = payments.filter((p) => p.enrollment_id && ids.has(p.enrollment_id)).sort(byDate);
  const idx = sorted.findIndex((p) => p.id === payment.id);
  const previous = money2(sorted.slice(0, Math.max(idx, 0)).reduce((s, p) => s + Number(p.amount), 0));
  return { total: bundle.price, previous, remaining: Math.max(money2(bundle.price - previous - amount), 0) };
}

// ---------------------------------------------------------------------------
// Group capacity, age categories and waiting list
// ---------------------------------------------------------------------------

/** Every group holds at most this many students. */
export const GROUP_CAPACITY = 15;
/** Waiting students needed (same activity, subject and age category) to open a new group. */
export const WAITLIST_READY = 8;

export const AGE_GROUPS = [
  { key: "5-8", min: 5, max: 8 },
  { key: "9-10", min: 9, max: 10 },
  { key: "11-13", min: 11, max: 13 },
  { key: "14-16", min: 14, max: 16 },
  { key: "17+", min: 17, max: null },
] as const;
export type AgeGroup = (typeof AGE_GROUPS)[number]["key"];

export function isAgeGroup(v: unknown): v is AgeGroup {
  return AGE_GROUPS.some((g) => g.key === v);
}

/** Age category of a student from the birth date (null when unknown or under 5). */
export function ageGroupFor(birth: string | null | undefined, ref?: Date): AgeGroup | null {
  const a = ageOn(birth, ref);
  if (a == null) return null;
  return AGE_GROUPS.find((g) => a >= g.min && (g.max == null || a <= g.max))?.key ?? null;
}

/** A student's age category: the one chosen on the form, else derived from an old birth date. */
export function studentAgeGroup(s: { age_group?: string | null; birth_date?: string | null } | null | undefined): AgeGroup | null {
  if (!s) return null;
  return isAgeGroup(s.age_group) ? s.age_group : ageGroupFor(s.birth_date);
}

/** Pricing audience implied by a group's age category (17+ pays adult prices). */
export function audienceForAgeGroup(g: string | null | undefined): Audience {
  return g === "17+" ? "adults" : "kids";
}

/**
 * Can this student join the group? Students already counted in it (renewing a package)
 * are always allowed; anyone else is refused once the group holds GROUP_CAPACITY students.
 */
export function groupSeat(
  activity: string | null | undefined,
  groupEnrollments: { student_id: string; sessions_used: number; sessions_total: number }[],
  studentId: string,
) {
  const ids = groupStudentIds(activity, groupEnrollments);
  const renewal = ids.has(studentId);
  const count = ids.size;
  const full = !renewal && count >= GROUP_CAPACITY;
  return { count, renewal, full, left: Math.max(GROUP_CAPACITY - count, 0) };
}

export function waitlistKey(e: { activity: string; subject_id: string | null; age_group: string | null; level_id?: string | null }) {
  return `${e.activity}|${e.subject_id ?? ""}|${e.age_group ?? ""}|${e.level_id ?? ""}`;
}

/** Waiting students bucketed by activity + subject + age category + level; a bucket of WAITLIST_READY is ready to open. */
export function waitlistBuckets<T extends { activity: string; subject_id: string | null; age_group: string | null; level_id?: string | null; created_at?: string | null; student_id?: string | null; student?: unknown }>(
  entries: T[],
) {
  const map = new Map<string, T[]>();
  const validEntries = entries.filter((e) => {
    if ("student" in e && e.student === null) return false;
    if ("student_id" in e && !e.student_id) return false;
    return true;
  });
  for (const e of [...validEntries].sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""))) {
    const k = waitlistKey(e);
    map.set(k, [...(map.get(k) ?? []), e]);
  }
  return [...map.entries()]
    .map(([key, list]) => ({ key, entries: list, count: list.length, ready: list.length >= WAITLIST_READY }))
    .sort((a, b) => Number(b.ready) - Number(a.ready) || b.count - a.count);
}

export interface AutoGroupNameParams {
  subjectName?: string | null;
  ageGroup?: string | null;
  levelCode?: string | null;
  activity?: string | null;
  existingNames?: (string | null | undefined)[] | null;
}

/**
 * Builds an automatic group name based on subject + level/age-group.
 * E.g.: "الإنجليزية · A1" for adults with level code,
 * "الإنجليزية · 9-10" for kids by age category,
 * "الرياضيات · ورشة" for workshops.
 * If the resulting name collides with an existing group, appends (2), (3), etc.
 */
export function buildAutoGroupName({
  subjectName,
  ageGroup,
  levelCode,
  activity,
  existingNames,
}: AutoGroupNameParams): string {
  const sub = subjectName?.trim() || "";
  if (!sub) return "";

  let descriptor = "";
  if (levelCode?.trim()) {
    descriptor = levelCode.trim();
  } else if (ageGroup?.trim()) {
    descriptor = ageGroup.trim();
  } else if (activity === "workshop") {
    descriptor = "ورشة";
  }

  const base = descriptor ? `${sub} · ${descriptor}` : sub;
  if (!existingNames || existingNames.length === 0) return base;

  const existingSet = new Set(
    existingNames
      .map((n) => n?.trim().toLowerCase())
      .filter((n): n is string => Boolean(n)),
  );

  if (!existingSet.has(base.toLowerCase())) return base;

  let counter = 2;
  while (existingSet.has(`${base} (${counter})`.toLowerCase())) {
    counter++;
  }
  return `${base} (${counter})`;
}

