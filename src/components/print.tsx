import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import JsBarcode from "jsbarcode";
import { Phone, Printer, User } from "lucide-react";
import cardFemale from "@/assets/card_female.png.asset.json";
import cardStudent from "@/assets/card_student.png.asset.json";
import cardTeacherMale from "@/assets/card_teacher_male.png.asset.json";
import cardTeacherFemale from "@/assets/card_teacher_female.png.asset.json";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import type { Settings, Student } from "@/lib/data";
import { dayMonth, sessionTitle, sheetPages } from "@/lib/schedule";

export function PrintDialog({
  open,
  onOpenChange,
  title,
  children,
  wide = false,
  toolbar,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  children: ReactNode;
  /** Large landscape documents: wider dialog, horizontally scrollable preview. */
  wide?: boolean;
  /** Extra controls shown above the preview (not printed). */
  toolbar?: ReactNode;
}) {
  const { t } = useI18n();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`max-h-[90vh] overflow-auto ${wide ? "max-w-6xl" : "max-w-3xl"}`}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {toolbar}
        <div className={`rounded-lg bg-muted p-4 ${wide ? "overflow-x-auto" : "flex justify-center"}`}>{children}</div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button variant="accent" onClick={() => window.print()}>
            <Printer /> {t("print")}
          </Button>
        </div>
        {open && mounted && createPortal(<div className="print-root">{children}</div>, document.body)}
      </DialogContent>
    </Dialog>
  );
}

export function Barcode({ value, height = 38, stretch = false }: { value: string; height?: number; stretch?: boolean }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!ref.current || !value) return;
    try {
      JsBarcode(ref.current, value, {
        format: "CODE128",
        height,
        width: 1.6,
        margin: 0,
        fontSize: 11,
        textMargin: 1,
        displayValue: !stretch,
        background: "transparent",
      });
    } catch {
      /* invalid code */
    }
    if (stretch && ref.current) {
      const w = ref.current.getAttribute("width"), h = ref.current.getAttribute("height");
      ref.current.setAttribute("viewBox", `0 0 ${parseFloat(w ?? "0")} ${parseFloat(h ?? "0")}`);
      ref.current.setAttribute("preserveAspectRatio", "none");
      ref.current.setAttribute("width", "100%");
      ref.current.setAttribute("height", "100%");
    }
  }, [value, height, stretch]);
  return <svg ref={ref} className={stretch ? "block size-full" : undefined} />;
}

function Brand({ settings }: { settings: Settings | null | undefined }) {
  const name = settings?.name?.trim() || "Beyond Words";
  return (
    <div className="flex items-center gap-2">
      {settings?.logo_url ? (
        <img src={settings.logo_url} alt="" className="size-8 rounded object-contain" />
      ) : (
        <div className="flex size-8 items-center justify-center rounded bg-accent text-sm font-black text-accent-foreground">BW</div>
      )}
      <div className="leading-tight">
        <div className="text-sm font-bold">{name}</div>
        <div className="text-[9px] opacity-80">أكاديمية · Academy</div>
      </div>
    </div>
  );
}

const CARD_INK = "oklch(0.26 0.09 262)";
const CARD_BLUE = "oklch(0.45 0.17 258)";
const pos = (l: number, t: number, w?: number, h?: number) => ({
  position: "absolute" as const,
  left: `${l}%`,
  top: `${t}%`,
  ...(w !== undefined && { width: `${w}%` }),
  ...(h !== undefined && { height: `${h}%` }),
});

function CardFrame({ bg, children }: { bg: string; children: ReactNode }) {
  return (
    <div
      dir="ltr"
      className="relative overflow-hidden rounded-[3.2mm]"
      style={{
        width: "85.6mm",
        height: "54mm",
        fontFamily: "Tajawal, Inter, sans-serif",
        backgroundImage: `url(${bg})`,
        backgroundSize: "100% 100%",
        printColorAdjust: "exact",
        WebkitPrintColorAdjust: "exact",
        color: CARD_INK,
      }}
    >
      {children}
    </div>
  );
}

type Box = [number, number, number, number];

/**
 * One data layout for every ID card (taken from the girls' student card):
 * surname / first name, serial, divider, phone rows, full-width barcode, serial on the line.
 */
function IdCardLayout({
  bg,
  photo,
  photoBox,
  lineY,
  lastName,
  firstName,
  code,
  rows,
}: {
  bg: string;
  photo?: string | null | undefined;
  photoBox: Box;
  lineY: number;
  lastName: string;
  firstName: string;
  code: string;
  rows: ReactNode[];
}) {
  return (
    <CardFrame bg={bg}>
      {photo && (
        <div style={{ ...pos(...photoBox), borderColor: CARD_BLUE }} className="overflow-hidden rounded-[2mm] border-[1.5px] bg-card">
          <img src={photo} alt="" className="size-full object-cover" />
        </div>
      )}
      <div style={pos(29.5, 29.5, 34, 15)} dir="rtl" className="flex flex-col items-end justify-start gap-[1.1mm] overflow-hidden whitespace-nowrap text-[12px] font-extrabold leading-none">
        <span>{lastName}</span>
        <span>{firstName}</span>
      </div>
      <div style={{ ...pos(29.8, 46.5), color: CARD_BLUE }} className="text-[11.5px] font-extrabold leading-none">
        {code}
      </div>
      <div style={{ ...pos(30, 53.6, 26, 0.35), background: CARD_BLUE }} />
      {rows}
      <div style={pos(22.5, lineY - 13.4, 55, 9.2)}>
        <Barcode value={code} height={40} stretch />
      </div>
      <div style={pos(0, lineY - 2.7, 100)} className="flex justify-center">
        <span className="px-[2mm] text-[8.5px] font-bold leading-none tracking-[0.35em]" style={{ background: "oklch(0.97 0.012 250)" }}>
          {code}
        </span>
      </div>
    </CardFrame>
  );
}

function PhoneRow({ top, icon, en, ar, value, big = false }: { top: number; icon: "phone" | "user"; en: string; ar: string; value: string | null | undefined; big?: boolean }) {
  const Icon = icon === "phone" ? Phone : User;
  return (
    <div key={en} style={pos(30, top)} className={`flex items-center gap-[1.2mm] font-bold leading-none tabular ${big ? "text-[11px] font-extrabold" : "text-[8.5px]"}`}>
      <Icon className={`${big ? "size-[10px]" : "size-[8px]"} fill-current`} />
      <span className={`${big ? "text-[7.5px]" : "text-[6.5px]"} font-semibold`}>
        {en} | <span dir="rtl">{ar}</span>
      </span>
      <span>{value || "/"}</span>
    </div>
  );
}

/** Student card: girls keep their original template, boys use the new one; same data layout. */
export function StudentCard({ student }: { student: Student; settings?: Settings | null | undefined }) {
  const female = (student as Student & { gender?: string }).gender === "female";
  return (
    <IdCardLayout
      bg={female ? cardFemale.url : cardStudent.url}
      photo={student.photo_url}
      photoBox={female ? [5.3, 31.3, 19.8, 35.8] : [4.2, 28.8, 21.8, 41.4]}
      lineY={female ? 84.9 : 84.7}
      lastName={student.last_name}
      firstName={student.first_name}
      code={student.code ?? ""}
      rows={[
        <PhoneRow key="s" top={56.4} icon="phone" en="Student" ar="الطالب" value={student.phone} />,
        <PhoneRow key="p" top={63.6} icon="user" en="Parent" ar="ولي الأمر" value={student.parent_phone} />,
      ]}
    />
  );
}

export type CardTeacher = { first_name: string; last_name: string; phone: string | null; gender?: string | null; code?: string | null };

/** Teacher card: male (أستاذ) / female (أستاذة) template, same layout, one larger phone row. */
export function TeacherCard({ teacher }: { teacher: CardTeacher }) {
  const female = teacher.gender === "female";
  return (
    <IdCardLayout
      bg={female ? cardTeacherFemale.url : cardTeacherMale.url}
      photoBox={female ? [4.6, 29, 21.5, 39] : [4.3, 28.3, 22.7, 42.7]}
      lineY={female ? 84.1 : 85.7}
      lastName={teacher.last_name}
      firstName={teacher.first_name}
      code={teacher.code ?? ""}
      rows={[<PhoneRow key="t" top={58} icon="phone" en="Teacher" ar={female ? "الأستاذة" : "الأستاذ"} value={teacher.phone} big />]}
    />
  );
}

function ReceiptShell({ settings, title, children }: { settings: Settings | null | undefined; title: [string, string]; children: ReactNode }) {
  return (
    <div className="w-[148mm] rounded-lg border bg-card p-6 text-card-foreground" style={{ fontFamily: "Inter, Tajawal, sans-serif" }}>
      <div className="flex items-start justify-between border-b pb-3">
        <div className="text-primary">
          <Brand settings={settings} />
          {settings?.address && <div className="mt-1 text-[10px] text-muted-foreground">{settings.address}</div>}
          {settings?.phone && <div className="text-[10px] text-muted-foreground tabular">{settings.phone}</div>}
        </div>
        <div className="text-end">
          <div className="text-base font-bold">{title[0]}</div>
          <div className="text-xs text-muted-foreground">{title[1]}</div>
        </div>
      </div>
      {children}
    </div>
  );
}

function Row({ ar, en, value }: { ar: string; en: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-dashed py-1.5 text-sm">
      <span className="text-muted-foreground">
        {en} / <span dir="rtl">{ar}</span>
      </span>
      <span className="font-semibold tabular">{value}</span>
    </div>
  );
}

const fmt = (n: number) => `${new Intl.NumberFormat("en-US").format(Math.round(n))} DZD`;

export function PaymentReceipt({
  settings,
  receiptNo,
  date,
  student,
  description,
  total,
  paid,
  previous = 0,
  remaining,
}: {
  settings: Settings | null | undefined;
  receiptNo: number | string;
  date: string;
  student: Student;
  description: string;
  /** Full price of the package. */
  total: number;
  /** Amount paid with this receipt. */
  paid: number;
  /** Already paid (or covered by credit) before this receipt. */
  previous?: number;
  /** Debt left after this receipt; computed when omitted. */
  remaining?: number;
}) {
  const left = remaining ?? Math.max(total - previous - paid, 0);
  return (
    <ReceiptShell settings={settings} title={["وصل دفع", "Payment receipt"]}>
      <div className="mt-3 space-y-0.5">
        <Row ar="رقم الوصل" en="Receipt no." value={`#${receiptNo}`} />
        <Row ar="التاريخ" en="Date" value={new Date(date).toLocaleString("en-GB")} />
        <Row ar="الطالب" en="Student" value={`${student.first_name} ${student.last_name} (${student.code})`} />
        <Row ar="البيان" en="Description" value={description} />
        <Row ar="المبلغ الإجمالي" en="Total" value={fmt(total)} />
        {previous > 0 && <Row ar="مدفوع سابقاً" en="Paid before" value={fmt(previous)} />}
        <Row ar="المدفوع بهذا الوصل" en="Paid now" value={fmt(paid)} />
        <Row ar="المتبقي (دين)" en="Balance due" value={left > 0 ? fmt(left) : `${fmt(0)} ✓`} />
      </div>
      <div className="mt-8 flex items-end justify-between text-xs text-muted-foreground">
        <div>شكراً لثقتكم · Thank you for your trust</div>
        <div className="w-32 border-t pt-1 text-center">الإمضاء · Signature</div>
      </div>
    </ReceiptShell>
  );
}

export function PayoutStatement({
  settings,
  teacherName,
  female,
  date,
  percentage,
  rows,
  share,
}: {
  settings: Settings | null | undefined;
  teacherName: string;
  female?: boolean;
  date: string;
  percentage?: number;
  rows: { student: string; group: string; sessions: string; price: number; teacherPrice?: number }[];
  share: number;
}) {
  const title = female ? "الأستاذة" : "الأستاذ";
  return (
    <ReceiptShell settings={settings} title={[`كشف حساب ${title}`, "Teacher statement"]}>
      <div className="mt-3 space-y-0.5">
        <Row ar={title} en="Teacher" value={teacherName} />
        <Row ar="التاريخ" en="Date" value={new Date(date).toLocaleDateString("en-GB")} />
      </div>
      <table className="mt-4 w-full text-xs">
        <thead>
          <tr className="border-b text-muted-foreground">
            <th className="py-1 text-start">Student / الطالب</th>
            <th className="py-1 text-start">Group / الفوج</th>
            <th className="py-1 text-center">Sessions / الحصص</th>
            <th className="py-1 text-end">Due / المستحق</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-dashed">
              <td className="py-1">{r.student}</td>
              <td className="py-1">{r.group}</td>
              <td className="py-1 text-center tabular">{r.sessions}</td>
              <td className="py-1 text-end tabular font-medium">{fmt(r.teacherPrice ?? 500)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 space-y-0.5">
        <Row ar={`إجمالي مستحقات ${title}`} en="Total payout" value={fmt(share)} />
      </div>
      <div className="mt-8 flex justify-between text-xs text-muted-foreground">
        <div className="w-32 border-t pt-1 text-center">الإدارة · Management</div>
        <div className="w-32 border-t pt-1 text-center">توقيع {title}</div>
      </div>
    </ReceiptShell>
  );
}

export type SheetStudent = { id: string; first_name: string; last_name: string; code: string | null };

const CELL = "border border-foreground/40 p-1";

function SheetHeader({
  settings,
  groupName,
  teacherName,
  teacherFemale,
  subtitle,
  periodLabel,
}: {
  settings: Settings | null | undefined;
  groupName: string;
  teacherName: string;
  teacherFemale: boolean;
  subtitle: string;
  periodLabel: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b pb-3">
      <div className="text-primary">
        <Brand settings={settings} />
      </div>
      <div className="text-center">
        <div className="text-lg font-extrabold">قائمة الحضور والغياب</div>
        <div className="text-xs text-muted-foreground">Attendance sheet · {periodLabel}</div>
      </div>
      <div className="text-start text-xs leading-relaxed">
        <div><span className="text-muted-foreground">الفوج: </span><b>{groupName}</b></div>
        <div><span className="text-muted-foreground">{teacherFemale ? "الأستاذة" : "الأستاذ"}: </span><b>{teacherName || "—"}</b></div>
        {subtitle && <div className="text-muted-foreground">{subtitle}</div>}
      </div>
    </div>
  );
}

function SheetFooter({ teacherFemale }: { teacherFemale: boolean }) {
  return (
    <div className="mt-3 flex items-end justify-between text-[11px] text-muted-foreground">
      <div>ح = حاضر · غ = غائب</div>
      <div className="flex gap-10">
        <div className="w-36 border-t pt-1 text-center">{teacherFemale ? "إمضاء الأستاذة" : "إمضاء الأستاذ"}</div>
        <div className="w-36 border-t pt-1 text-center">الإدارة</div>
      </div>
    </div>
  );
}

const markLetter = (st: string | undefined) => (st === "present" ? "ح" : st === "absent" ? "غ" : "");

/**
 * Monthly attendance sheet of a weekly group (A4 portrait): one row per student,
 * one column per session titled "الحصة الأولى" + dd/mm, cells ح (present) / غ (absent).
 */
export function AttendanceSheet({
  settings,
  groupName,
  teacherName,
  teacherFemale = false,
  subtitle,
  monthLabel,
  dates,
  students,
  marks,
}: {
  settings: Settings | null | undefined;
  groupName: string;
  teacherName: string;
  teacherFemale?: boolean;
  subtitle: string;
  monthLabel: string;
  /** One entry per session column: its recorded date YYYY-MM-DD, or null when not held yet. */
  dates: (string | null)[];
  students: SheetStudent[];
  /** `${studentId}|${date}` -> status */
  marks: Map<string, string>;
}) {
  return (
    <div dir="rtl" className="attendance-sheet-portrait mx-auto w-[194mm] bg-card p-5 text-card-foreground" style={{ fontFamily: "Tajawal, Inter, sans-serif" }}>
      <SheetHeader settings={settings} groupName={groupName} teacherName={teacherName} teacherFemale={teacherFemale} subtitle={subtitle} periodLabel={monthLabel} />
      <table className="mt-3 w-full border-collapse text-[10px]" style={{ tableLayout: "fixed" }}>
        <colgroup>
          <col style={{ width: "7mm" }} />
          <col style={{ width: "38mm" }} />
          <col style={{ width: "16mm" }} />
          {dates.map((_, i) => <col key={i} />)}
          <col style={{ width: "8mm" }} />
          <col style={{ width: "8mm" }} />
        </colgroup>
        <thead>
          <tr className="bg-muted">
            <th className={CELL}>#</th>
            <th className={`${CELL} text-start`}>الاسم واللقب</th>
            <th className={CELL}>الرمز</th>
            {dates.map((d, i) => (
              <th key={i} className={`${CELL} px-0.5 leading-tight`}>
                <div className="text-[9px] font-bold">{sessionTitle(i + 1, "ar")}</div>
                <div className="font-mono text-[10px] font-semibold text-muted-foreground" dir="ltr">{d ? dayMonth(d) : "\u00a0/\u00a0\u00a0"}</div>
              </th>
            ))}
            <th className={CELL}>ح</th>
            <th className={CELL}>غ</th>
          </tr>
        </thead>
        <tbody>
          {students.map((s, idx) => {
            const cells = dates.map((d) => markLetter(d ? marks.get(`${s.id}|${d}`) : undefined));
            return (
              <tr key={s.id} style={{ breakInside: "avoid" }}>
                <td className={`${CELL} text-center tabular`}>{idx + 1}</td>
                <td className={`${CELL} truncate font-semibold`}>{s.last_name} {s.first_name}</td>
                <td className={`${CELL} text-center font-mono text-[9px]`} dir="ltr">{s.code}</td>
                {cells.map((c, i) => (
                  <td key={i} className={`${CELL} h-7 text-center text-sm font-extrabold ${c === "غ" ? "text-destructive" : ""}`}>{c}</td>
                ))}
                <td className={`${CELL} text-center font-bold tabular`}>{cells.filter((c) => c === "ح").length}</td>
                <td className={`${CELL} text-center font-bold tabular`}>{cells.filter((c) => c === "غ").length}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <SheetFooter teacherFemale={teacherFemale} />
    </div>
  );
}

function StatusTable({ rows, start, date, statusOf }: { rows: SheetStudent[]; start: number; date: string | null; statusOf: (id: string) => string | undefined }) {
  return (
    <table className="w-full border-collapse text-[11px]" style={{ tableLayout: "fixed" }}>
      <colgroup>
        <col style={{ width: "8mm" }} />
        <col />
        <col style={{ width: "19mm" }} />
        <col style={{ width: "17mm" }} />
      </colgroup>
      <thead>
        <tr className="bg-muted">
          <th className={CELL}>#</th>
          <th className={`${CELL} text-start`}>الاسم واللقب</th>
          <th className={CELL}>الرمز</th>
          <th className={`${CELL} leading-tight`}>
            <div className="font-bold">الحالة</div>
            {date && <div className="font-mono text-[10px] font-semibold text-muted-foreground" dir="ltr">{dayMonth(date)}</div>}
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((s, i) => {
          const c = markLetter(statusOf(s.id));
          return (
            <tr key={s.id}>
              <td className={`${CELL} text-center tabular`}>{start + i + 1}</td>
              <td className={`${CELL} truncate font-semibold`}>{s.last_name} {s.first_name}</td>
              <td className={`${CELL} text-center font-mono text-[10px]`} dir="ltr">{s.code}</td>
              <td className={`${CELL} h-[9.5mm] text-center text-sm font-extrabold ${c === "غ" ? "text-destructive" : ""}`}>{c}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/**
 * One-session attendance sheet (workshops), A4 portrait: per page two tables side
 * by side — right one rows 1–20, left one continues 21–40 — with a "الحالة" column.
 */
export function SingleSessionSheet({
  settings,
  groupName,
  teacherName,
  teacherFemale = false,
  subtitle,
  dateLabel,
  date,
  students,
  statusOf,
}: {
  settings: Settings | null | undefined;
  groupName: string;
  teacherName: string;
  teacherFemale?: boolean;
  subtitle: string;
  dateLabel: string;
  date: string | null;
  students: SheetStudent[];
  statusOf: (studentId: string) => string | undefined;
}) {
  const pages = sheetPages(students);
  return (
    <div dir="rtl" className="attendance-sheet-portrait mx-auto w-[194mm] text-card-foreground" style={{ fontFamily: "Tajawal, Inter, sans-serif" }}>
      {pages.map((page, pi) => (
        <div key={pi} className="sheet-page mb-4 bg-card p-5 last:mb-0">
          <SheetHeader settings={settings} groupName={groupName} teacherName={teacherName} teacherFemale={teacherFemale} subtitle={subtitle} periodLabel={dateLabel} />
          <div className="mt-3 grid grid-cols-2 items-start gap-[4mm]">
            {page.map((col, ci) => (
              <StatusTable key={ci} rows={col.rows} start={col.start} date={date} statusOf={statusOf} />
            ))}
          </div>
          <SheetFooter teacherFemale={teacherFemale} />
        </div>
      ))}
    </div>
  );
}
