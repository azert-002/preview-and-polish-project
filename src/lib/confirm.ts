/** Promise-based, app-wide confirmation dialog (rendered by <ConfirmHost />). */
export type ConfirmOptions = {
  title?: string;
  message: string;
  hint?: string;
  confirmLabel?: string;
  tone?: "danger" | "warning";
};
export type ConfirmRequest = ConfirmOptions & { resolve: (ok: boolean) => void };

let current: ConfirmRequest | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function confirmAction(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    if (listeners.size === 0) {
      resolve(window.confirm(opts.message));
      return;
    }
    current?.resolve(false);
    current = { ...opts, resolve };
    emit();
  });
}

export function settleConfirm(ok: boolean) {
  const req = current;
  current = null;
  req?.resolve(ok);
  emit();
}

export const confirmStore = {
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  get: () => current,
};
