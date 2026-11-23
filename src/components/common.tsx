import { useState, type ReactNode } from "react";
import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { digitsOnly, maskTime, parse24, shift24 } from "@/lib/time";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-foreground md:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ title, actions, children, className }: { title?: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-xl border bg-card shadow-card", className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-2 border-b px-5 py-3">
          {title && <h2 className="font-semibold text-foreground">{title}</h2>}
          {actions}
        </div>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function StatCard({
  label,
  value,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  icon: LucideIcon;
  tone?: "default" | "accent" | "success" | "warning";
}) {
  const toneCls = {
    default: "bg-secondary text-primary",
    accent: "bg-accent/25 text-foreground",
    success: "bg-success/15 text-success",
    warning: "bg-warning/20 text-warning",
  }[tone];
  return (
    <div className="flex items-center gap-4 rounded-xl border bg-card p-5 shadow-card">
      <div className={cn("flex size-12 items-center justify-center rounded-xl", toneCls)}>
        <Icon className="size-6" />
      </div>
      <div className="min-w-0">
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className="tabular truncate text-2xl font-bold text-foreground">{value}</div>
      </div>
    </div>
  );
}

export function Pill({
  tone = "default",
  children,
  className,
  title,
  dir,
}: {
  tone?: "default" | "success" | "warning" | "danger" | "accent";
  children: ReactNode;
  className?: string;
  title?: string;
  dir?: "rtl" | "ltr" | "auto";
}) {
  const cls = {
    default: "bg-secondary text-secondary-foreground",
    success: "bg-success/15 text-success",
    warning: "bg-warning/20 text-warning",
    danger: "bg-destructive/15 text-destructive",
    accent: "bg-accent/30 text-foreground",
  }[tone];
  return (
    <span title={title} dir={dir} className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", cls, className)}>
      {children}
    </span>
  );
}

export function Field({
  label,
  children,
  className,
  labelClassName,
}: {
  label: string;
  children: ReactNode;
  className?: string;
  labelClassName?: string;
}) {
  return (
    <div data-field className={cn("space-y-1.5", className)}>
      <Label data-field-label className={cn("text-xs font-medium text-muted-foreground", labelClassName)}>
        {label}
      </Label>
      {children}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="py-10 text-center text-sm text-muted-foreground">{children}</div>;
}

export function SessionBar({ used, total }: { used: number; total: number }) {
  const pct = total ? Math.min(100, (used / total) * 100) : 0;
  const left = total - used;
  const tone = left <= 0 ? "bg-destructive" : left <= 1 ? "bg-warning" : "bg-success";
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", tone)} style={{ width: `${pct}%` }} />
      </div>
      <span className="tabular text-xs text-muted-foreground">
        {used}/{total}
      </span>
    </div>
  );
}

export const selectCls =
  "flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

/**
 * A 24-hour time box for manual typing only: type digits ("930" -> 09:30,
 * "2300" -> 23:00) and the colon is added automatically; the value is
 * normalized on blur/Enter. Arrow keys step by 15 minutes. Never shows AM/PM.
 */
export function TimeField({
  value,
  onChange,
  placeholder = "--:--",
  ariaLabel,
  className,
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  id?: string;
}) {
  const [typed, setTyped] = useState<string | null>(null);
  const shown = typed != null ? maskTime(typed) : value;

  function commit() {
    if (typed == null) return;
    onChange(parse24(typed));
    setTyped(null);
  }

  return (
    <Input
      id={id}
      aria-label={ariaLabel}
      inputMode="numeric"
      autoComplete="off"
      placeholder={placeholder}
      value={shown}
      className={cn("tabular", className)}
      onChange={(e) => setTyped(digitsOnly(e.target.value))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          onChange(shift24(typed != null ? parse24(typed) : value, 15));
          setTyped(null);
        } else if (e.key === "ArrowDown") {
          e.preventDefault();
          onChange(shift24(typed != null ? parse24(typed) : value, -15));
          setTyped(null);
        }
      }}
    />
  );
}
