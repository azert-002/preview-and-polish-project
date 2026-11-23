import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard,
  ScanLine,
  Users,
  BookOpen,
  Wallet,
  Receipt,
  Settings as SettingsIcon,
  LogOut,
  Languages,
  Wifi,
  WifiOff,
  ShieldAlert,
  CalendarClock,
  UserCog,
  Hourglass,
  ShieldCheck,
} from "lucide-react";
import { supabase, isLocalDbMode } from "@/integrations/supabase/client";
import { useI18n, type TKey } from "@/lib/i18n";
import { useMyRole, useMyUsername, useSettings } from "@/lib/data";
import { MyAccountDialog } from "@/components/ChangePasswordForm";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { canAccessPath } from "@/lib/permissions";

const NAV: { to: "/dashboard" | "/scan" | "/timetable" | "/students" | "/waiting" | "/academics" | "/payroll" | "/finance" | "/settings"; key: TKey; icon: typeof Users }[] = [
  { to: "/dashboard", key: "dashboard", icon: LayoutDashboard },
  { to: "/scan", key: "scan", icon: ScanLine },
  { to: "/timetable", key: "timetable", icon: CalendarClock },
  { to: "/students", key: "students", icon: Users },
  { to: "/waiting", key: "waitingList", icon: Hourglass },
  { to: "/academics", key: "academics", icon: BookOpen },
  { to: "/payroll", key: "payroll", icon: Wallet },
  { to: "/finance", key: "finance", icon: Receipt },
  { to: "/settings", key: "settings", icon: SettingsIcon },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { t, toggle, lang, fmtDate } = useI18n();
  const { data: settings } = useSettings();
  const { data: role, isLoading: roleLoading } = useMyRole();
  const { data: username = "" } = useMyUsername();
  const [accountOpen, setAccountOpen] = useState(false);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [online, setOnline] = useState(true);
  const [today, setToday] = useState<Date | null>(null);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const nav = NAV.filter((n) => canAccessPath(role, n.to));

  useEffect(() => {
    setToday(new Date());
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  const name = settings?.name?.trim() || "Beyond Words";

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const navLink = (item: (typeof NAV)[number], compact = false) => (
    <Link
      key={item.to}
      to={item.to}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        compact && "shrink-0 py-2",
      )}
      activeProps={{ className: "bg-sidebar-accent text-sidebar-primary" }}
    >
      <item.icon className="size-[18px]" />
      <span>{t(item.key)}</span>
    </Link>
  );

  return (
    <div className="flex min-h-screen bg-background">
      {accountOpen && <MyAccountDialog open={accountOpen} onOpenChange={setAccountOpen} username={username} />}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-sidebar p-4 lg:flex">
        <div className="mb-8 flex items-center gap-3 px-2">
          {settings?.logo_url ? (
            <img src={settings.logo_url} alt="" className="size-10 rounded-lg bg-card object-contain p-1" />
          ) : (
            <div className="flex size-10 items-center justify-center rounded-lg bg-sidebar-primary text-base font-black text-sidebar-primary-foreground">
              BW
            </div>
          )}
          <div className="min-w-0">
            <div className="truncate font-bold text-sidebar-accent-foreground">{name}</div>
            <div className="text-xs text-ink-muted">{t("tagline")}</div>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-1">{nav.map((n) => navLink(n))}</nav>
        <button
          onClick={() => setAccountOpen(true)}
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-start text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <UserCog className="size-[18px] shrink-0" />
          <span className="min-w-0">
            <span className="block">{t("myAccount")}</span>
            {username && <span className="block truncate text-xs text-ink-muted" dir="ltr">{username}</span>}
          </span>
        </button>
        <button
          onClick={signOut}
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <LogOut className="size-[18px]" /> {t("signOut")}
        </button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur">
          <div className="flex h-16 items-center gap-3 px-4 md:px-8">
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold text-foreground lg:hidden">{name}</div>
              <div className="text-xs text-muted-foreground tabular">{today ? fmtDate(today) : ""}</div>
            </div>
            <span
              className={cn(
                "hidden items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium sm:inline-flex",
                online ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive",
              )}
            >
              {online ? <Wifi className="size-3.5" /> : <WifiOff className="size-3.5" />}
              {online ? t("connected") : t("offline")}
            </span>
            {isLocalDbMode() && (
              <span
                className="hidden items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 sm:inline-flex"
                title={t("localDbActive")}
              >
                <ShieldCheck className="size-3.5" />
                {t("localDbBadge")}
              </span>
            )}
            <Button variant="outline" size="sm" onClick={toggle} className="gap-1.5">
              <Languages /> {lang === "ar" ? "English" : "العربية"}
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setAccountOpen(true)} className="lg:hidden" aria-label={t("myAccount")}>
              <UserCog />
            </Button>
            <Button variant="ghost" size="icon" onClick={signOut} className="lg:hidden" aria-label={t("signOut")}>
              <LogOut />
            </Button>
          </div>
          <nav className="flex gap-1 overflow-x-auto bg-sidebar px-3 py-2 lg:hidden">{nav.map((n) => navLink(n, true))}</nav>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 p-4 md:p-8">
          {!roleLoading && !role ? (
            <div className="mx-auto mt-20 max-w-md rounded-xl border bg-card p-8 text-center shadow-card">
              <ShieldAlert className="mx-auto mb-3 size-10 text-warning" />
              <p className="text-foreground">{t("noAccess")}</p>
            </div>
          ) : !roleLoading && !canAccessPath(role, pathname) ? (
            <div className="mx-auto mt-20 max-w-md rounded-xl border bg-card p-8 text-center shadow-card">
              <ShieldAlert className="mx-auto mb-3 size-10 text-warning" />
              <p className="mb-4 text-foreground">{t("adminOnlyPage")}</p>
              <Button asChild variant="outline">
                <Link to="/dashboard">{t("dashboard")}</Link>
              </Button>
            </div>
          ) : roleLoading ? null : (
            children
          )}
        </main>
      </div>
    </div>
  );
}
