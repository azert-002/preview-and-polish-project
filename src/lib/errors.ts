import { toast } from "sonner";
import { bilingual } from "./i18n";

/** Turns raw server/network error text into a clear bilingual message. */
const RULES: { test: RegExp; ar: string; en: string }[] = [
  { test: /FORBIDDEN/, ar: "هذا الإجراء خاص بالمدير.", en: "Only the director can do this." },
  { test: /SELF_CHANGE/, ar: "لا يمكنك تغيير صلاحية حسابك أو حذفه بنفسك.", en: "You can't change or delete your own account." },
  { test: /LAST_ADMIN/, ar: "يجب أن يبقى مدير واحد على الأقل.", en: "At least one director must remain." },
  { test: /weak|easy to guess|pwned|compromised/i, ar: "كلمة المرور ضعيفة أو شائعة جداً، اختر كلمة مرور أقوى (حروف وأرقام ورموز).", en: "This password is too weak or common; choose a stronger one." },
  { test: /USERNAME_EXISTS/, ar: "اسم المستخدم هذا مستعمل لحساب آخر.", en: "This username is already used by another account." },
  { test: /USERNAME_INVALID/, ar: "اسم المستخدم: حروف لاتينية وأرقام فقط (يُسمح بـ . - _)، من 2 إلى 32 حرفاً.", en: "Username: latin letters and digits only (. - _ allowed), 2 to 32 characters." },
  { test: /WRONG_PASSWORD/, ar: "كلمة المرور الحالية غير صحيحة.", en: "The current password is incorrect." },
  { test: /SAME_PASSWORD/, ar: "كلمة المرور الجديدة مطابقة للحالية، اختر كلمة مختلفة.", en: "The new password is the same as the current one." },
  { test: /PASSWORD_MISMATCH/, ar: "تأكيد كلمة المرور غير مطابق.", en: "The password confirmation doesn't match." },
  { test: /invalid login credentials/i, ar: "اسم المستخدم أو كلمة المرور غير صحيحة.", en: "Incorrect username or password." },
  { test: /email not confirmed/i, ar: "هذا الحساب غير مفعّل بعد. راجع المدير.", en: "This account isn't active yet. Ask the director." },
  { test: /already registered|already exists|user_already_exists/i, ar: "اسم المستخدم هذا مستعمل لحساب آخر.", en: "This username is already used by another account." },
  { test: /password.*(at least|should be)/i, ar: "كلمة المرور قصيرة جداً (6 أحرف على الأقل).", en: "Password is too short (at least 6 characters)." },
  { test: /rate limit|too many requests/i, ar: "محاولات كثيرة. انتظر قليلاً ثم أعد المحاولة.", en: "Too many attempts. Please wait a moment and try again." },
  { test: /failed to fetch|network|load failed/i, ar: "تعذّر الاتصال بالإنترنت. تحقق من الاتصال ثم أعد المحاولة.", en: "Couldn't reach the server. Check your connection and try again." },
  { test: /duplicate key|unique constraint/i, ar: "هذه القيمة موجودة مسبقاً.", en: "This value already exists." },
  { test: /foreign key|violates.*constraint.*references|still referenced/i, ar: "لا يمكن الحذف لأن هذا العنصر مرتبط ببيانات أخرى.", en: "Can't delete this because other records depend on it." },
  { test: /row-level security|permission denied/i, ar: "لا تملك صلاحية تنفيذ هذا الإجراء.", en: "You don't have permission to do this." },
];

const lang = () => (typeof document !== "undefined" && document.documentElement.lang === "en" ? "en" : "ar");

export function friendlyError(message: string | undefined | null): string {
  const l = lang();
  const msg = message ?? "";
  if (msg.includes("SETUP_CLOSED")) return bilingual("setupClosedError")[l];
  if (msg.includes("SETUP_UNAVAILABLE")) return bilingual("setupUnavailable")[l];
  if (msg.includes("PASSWORD_WEAK")) return bilingual("setupPasswordWeak")[l];
  if (msg.includes("PASSWORD_TOO_SHORT")) return bilingual("setupPasswordShort")[l];
  if (msg.includes("SETUP_RATE_LIMIT")) return bilingual("setupRateLimit")[l];
  const rule = RULES.find((r) => r.test.test(msg));
  if (rule) return rule[l];
  return msg || (l === "ar" ? "حدث خطأ غير متوقع." : "An unexpected error occurred.");
}

export function notifyError(message: string | undefined | null) {
  const l = lang();
  toast.error(l === "ar" ? "تعذّر إتمام العملية" : "Couldn't complete that", { description: friendlyError(message) });
}
