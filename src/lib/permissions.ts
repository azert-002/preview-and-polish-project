/**
 * Who can see what. Two roles: the director (admin) has every permission;
 * the secretary (staff) works with students, groups, attendance and the
 * timetable but never sees money totals, payroll, finance or settings.
 */
export type Role = "admin" | "staff";

/** Pages only the director may open. */
export const ADMIN_ONLY_PATHS = ["/payroll", "/finance", "/settings"] as const;

export function canAccessPath(role: Role | null | undefined, path: string): boolean {
  if (!role) return false;
  if (role === "admin") return true;
  return !ADMIN_ONLY_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
}

/** The dashboard's monthly income card. */
export function canSeeIncome(role: Role | null | undefined): boolean {
  return role === "admin";
}

export function canManageUsers(role: Role | null | undefined): boolean {
  return role === "admin";
}
