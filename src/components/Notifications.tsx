import { useEffect, useRef, useSyncExternalStore } from "react";
import { Toaster, toast } from "sonner";
import { AlertTriangle, CheckCircle2, Info, Loader2, Trash2, XCircle } from "lucide-react";
import { useI18n, type TKey } from "@/lib/i18n";
import { confirmStore, settleConfirm } from "@/lib/confirm";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";

/* ---------- Centered toasts ---------- */

export function AppToaster() {
  const { dir, t } = useI18n();
  return (
    <Toaster
      position="top-center"
      dir={dir}
      closeButton
      duration={3800}
      gap={10}
      visibleToasts={3}
      style={{ "--width": "min(440px, calc(100vw - 32px))" } as React.CSSProperties}
      icons={{
        success: <CheckCircle2 className="size-5" />,
        error: <XCircle className="size-5" />,
        warning: <AlertTriangle className="size-5" />,
        info: <Info className="size-5" />,
        loading: <Loader2 className="size-5 animate-spin" />,
      }}
      toastOptions={{
        unstyled: true,
        closeButtonAriaLabel: t("close"),
        classNames: {
          toast: "app-toast",
          icon: "app-toast-icon",
          content: "app-toast-content",
          title: "app-toast-title",
          description: "app-toast-desc",
          closeButton: "app-toast-close",
          actionButton: "app-toast-action",
          success: "app-toast-success",
          error: "app-toast-error",
          warning: "app-toast-warning",
          info: "app-toast-info",
          loading: "app-toast-info",
        },
      }}
    />
  );
}

/* ---------- Form field validation → centered notice ---------- */

type Msg = { key: TKey; n?: string | number };

function messageFor(el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): Msg {
  const v = el.validity;
  if (v.valueMissing) return { key: el instanceof HTMLSelectElement || (el as HTMLInputElement).type === "file" ? "vRequiredChoice" : "vRequired" };
  if (v.typeMismatch) return { key: (el as HTMLInputElement).type === "email" ? "vEmail" : "vType" };
  if (v.tooShort) return { key: "vTooShort", n: (el as HTMLInputElement).minLength };
  if (v.tooLong) return { key: "vTooLong", n: (el as HTMLInputElement).maxLength };
  if (v.rangeUnderflow) return { key: "vMin", n: (el as HTMLInputElement).min };
  if (v.rangeOverflow) return { key: "vMax", n: (el as HTMLInputElement).max };
  if (v.stepMismatch) return { key: "vStep" };
  if (v.patternMismatch) return { key: "vPattern" };
  return { key: "vType" };
}

function labelFor(el: HTMLElement): string | null {
  const fromField = el.closest("[data-field]")?.querySelector("[data-field-label]")?.textContent;
  const byFor = el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.textContent : null;
  const txt = fromField || byFor || el.getAttribute("aria-label") || el.getAttribute("placeholder");
  return txt?.trim() || null;
}

export function FormValidationNotices() {
  const { t } = useI18n();
  const tRef = useRef(t);
  tRef.current = t;

  useEffect(() => {
    let handled = false;

    const notifyInvalid = (el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement) => {
      el.setAttribute("aria-invalid", "true");
      el.setAttribute("data-auto-invalid", "");
      if (handled) return;
      handled = true;
      setTimeout(() => (handled = false), 150);
      const tr = tRef.current;
      const { key, n } = messageFor(el);
      const label = labelFor(el) ?? tr("vThisField");
      const text = tr(key).replace("{label}", label).replace("{n}", String(n ?? ""));
      toast.warning(tr("vTitle"), { id: "form-validation", description: text });
      // Defer focus slightly to avoid triggering Chrome's native tooltip on synchronous focus
      setTimeout(() => {
        try {
          el.focus({ preventScroll: true });
          el.scrollIntoView({ block: "center", behavior: "smooth" });
        } catch {}
      }, 40);
    };

    const onInvalid = (e: Event) => {
      // Strictly prevent browser's native bubble tooltip across all browsers
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      const el = e.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
      if (el && "validity" in el) {
        notifyInvalid(el);
      }
    };

    const onSubmit = (e: Event) => {
      const form = e.target as HTMLFormElement;
      if (!form || !(form instanceof HTMLFormElement)) return;
      // Pre-check validity before browser triggers its native constraint validation UI
      if (!form.noValidate && !form.checkValidity()) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        const first = Array.from(form.elements).find(
          (el) => (el as HTMLInputElement).validity && !(el as HTMLInputElement).validity.valid,
        ) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | undefined;
        if (first) {
          notifyInvalid(first);
        }
      }
    };

    const onEdit = (e: Event) => {
      const el = e.target as HTMLElement;
      if (el?.hasAttribute?.("data-auto-invalid")) {
        el.removeAttribute("aria-invalid");
        el.removeAttribute("data-auto-invalid");
      }
    };

    document.addEventListener("invalid", onInvalid, true);
    document.addEventListener("submit", onSubmit, true);
    document.addEventListener("input", onEdit, true);
    document.addEventListener("change", onEdit, true);

    return () => {
      document.removeEventListener("invalid", onInvalid, true);
      document.removeEventListener("submit", onSubmit, true);
      document.removeEventListener("input", onEdit, true);
      document.removeEventListener("change", onEdit, true);
    };
  }, []);

  return null;
}

/* ---------- Centered confirmation dialog ---------- */

export function ConfirmHost() {
  const { t } = useI18n();
  const req = useSyncExternalStore(confirmStore.subscribe, confirmStore.get, () => null);
  const tone = req?.tone ?? "danger";
  const Icon = tone === "danger" ? Trash2 : AlertTriangle;

  return (
    <AlertDialog open={!!req} onOpenChange={(o) => !o && settleConfirm(false)}>
      <AlertDialogContent className="w-[calc(100vw-32px)] max-w-md gap-0 overflow-hidden rounded-2xl border-0 p-0 shadow-toast sm:rounded-2xl">
        <div className="flex flex-col items-center px-6 pb-5 pt-7 text-center">
          <div
            className={cn(
              "mb-4 flex size-14 items-center justify-center rounded-full ring-8",
              tone === "danger" ? "bg-destructive/12 text-destructive ring-destructive/5" : "bg-warning/15 text-warning ring-warning/5",
            )}
          >
            <Icon className="size-6" />
          </div>
          <AlertDialogTitle className="text-lg font-bold text-foreground">{req?.title ?? t("confirmTitle")}</AlertDialogTitle>
          <AlertDialogDescription className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {req?.message}
            {req?.hint && <span className="mt-1 block text-xs">{req.hint}</span>}
          </AlertDialogDescription>
        </div>
        <div className="flex gap-2 border-t bg-muted/50 px-6 py-4">
          <AlertDialogCancel className="mt-0 flex-1">{t("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            className={cn(buttonVariants({ variant: tone === "danger" ? "destructive" : "default" }), "flex-1")}
            onClick={() => settleConfirm(true)}
          >
            {req?.confirmLabel ?? t("confirmBtn")}
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
