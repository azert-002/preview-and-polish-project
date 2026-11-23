import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Eye, EyeOff, Languages, Loader2, Lock, ShieldCheck, User } from "lucide-react";
import { notifyError } from "@/lib/errors";
import { supabase, isLocalDbMode } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { authPassword, loginEmail } from "@/lib/username";
import { isDefaultDirectorLogin } from "@/lib/director-setup";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Beyond Words" },
      { name: "description", content: "Sign in to the Beyond Words academy management system." },
      { property: "og:title", content: "Sign in — Beyond Words" },
      { property: "og:description", content: "Staff access to the Beyond Words academy system." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

const inputCls =
  "h-12 w-full rounded-xl border border-ink-foreground/15 bg-ink-foreground/5 ps-11 pe-11 text-base text-ink-foreground outline-none transition placeholder:text-ink-muted/70 focus:border-saffron focus:ring-2 focus:ring-saffron/30";

function AuthPage() {
  const { t, toggle, lang } = useI18n();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard", replace: true });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) navigate({ to: "/dashboard", replace: true });
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: loginEmail(username),
        password: authPassword(password),
      });
      if (error) throw error;
      navigate({ to: "/dashboard", replace: true });
    } catch (err) {
      notifyError(err instanceof Error ? err.message : "INVALID_LOGIN");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-ink-gradient p-12 text-ink-foreground lg:flex">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-saffron text-lg font-black text-accent-foreground">BW</div>
          <span className="text-xl font-bold">Beyond Words</span>
        </div>
        <div>
          <p className="text-4xl font-bold leading-tight">
            أكاديمية تُدار بذكاء.
            <br />
            <span className="text-saffron">An academy, run beautifully.</span>
          </p>
          <p className="mt-4 max-w-md text-ink-muted">
            الطلاب، الحضور بالباركود، أجور الأساتذة والمالية — في مكان واحد وباللغتين.
          </p>
        </div>
        <div className="text-sm text-ink-muted">Support · Languages · Workshops</div>
        <div className="pointer-events-none absolute -bottom-32 -end-32 size-96 rounded-full border-[40px] border-saffron/20" />
      </div>

      <div className="flex flex-col p-6">
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={toggle}>
            <Languages /> {lang === "ar" ? "English" : "العربية"}
          </Button>
        </div>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-8">
          <h1 className="text-3xl font-bold text-foreground">{t("signIn")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("loginIntro")}</p>
          {isLocalDbMode() && (
            <div className="mt-3 inline-flex items-center gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
              <ShieldCheck className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span>{t("localDbActive")}</span>
            </div>
          )}

          <form onSubmit={submit} autoComplete="off" className="mt-6 space-y-5 rounded-2xl border-t-4 border-saffron bg-ink p-6 text-ink-foreground shadow-card">
            <div className="space-y-2">
              <Label htmlFor="login-username" className="text-sm font-semibold text-ink-foreground">{t("username")}</Label>
              <div className="relative">
                <User className="pointer-events-none absolute start-4 top-1/2 size-[18px] -translate-y-1/2 text-ink-muted" />
                <input
                  id="login-username"
                  className={inputCls}
                  dir="ltr"
                  required
                  name="bw-login-user"
                  autoComplete="off"
                  data-lpignore="true"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="login-password" className="text-sm font-semibold text-ink-foreground">{t("password")}</Label>
              <div className="relative">
                <Lock className="pointer-events-none absolute start-4 top-1/2 size-[18px] -translate-y-1/2 text-ink-muted" />
                <input
                  id="login-password"
                  className={cn(inputCls, !show && "text-secure")}
                  dir="ltr"
                  type="text"
                  required
                  maxLength={72}
                  name="bw-login-key"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  data-lpignore="true"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <Button
                  type="button" variant="ghost" size="icon"
                  className="absolute end-2 top-1/2 size-8 -translate-y-1/2 text-ink-muted hover:text-ink-foreground"
                  aria-label={show ? t("hidePassword") : t("showPassword")}
                  onClick={() => setShow(!show)}
                >
                  {show ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-ink-muted">
              <span>{t("firstTimeLogin")}</span>
              <button
                type="button"
                onClick={() => { setUsername("admin"); setPassword("admin"); }}
                className="font-medium text-saffron underline hover:text-saffron/80"
              >
                {t("autofill")} (admin / admin)
              </button>
            </div>

            <Button type="submit" variant="accent" className="min-h-12 w-full whitespace-normal rounded-xl text-base shadow-lg" disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : null}
              {t("signIn")}
              {!busy && <ArrowRight className="rtl:rotate-180" />}
            </Button>

            <p className="flex items-center justify-center gap-1.5 text-xs text-ink-muted">
              <ShieldCheck className="size-4 text-saffron" /> {t("dataProtected")}
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
