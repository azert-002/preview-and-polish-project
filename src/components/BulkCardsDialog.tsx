import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Printer } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type Item = { id: string; label: string; sub?: string | null };

/** Pick several people (or all) and print their ID cards in one go. */
export function BulkCardsDialog<T extends Item>({
  open, onOpenChange, title, items, render,
}: { open: boolean; onOpenChange: (o: boolean) => void; title: string; items: T[]; render: (item: T) => ReactNode }) {
  const { t } = useI18n();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => { if (open) setSel(new Set(items.map((i) => i.id))); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const all = items.length > 0 && sel.size === items.length;
  const chosen = items.filter((i) => sel.has(i.id));
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-auto">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <label className="flex items-center gap-2 border-b pb-2 font-medium">
          <input type="checkbox" className="size-4 accent-[var(--color-primary)]" checked={all} onChange={() => setSel(all ? new Set() : new Set(items.map((i) => i.id)))} />
          {t("selectAll")} <span className="text-xs text-muted-foreground">({sel.size}/{items.length})</span>
        </label>
        <ul className="max-h-[50vh] divide-y overflow-auto">
          {items.map((i) => (
            <li key={i.id}>
              <label className="flex cursor-pointer items-center gap-2 px-1 py-2 hover:bg-muted/50">
                <input type="checkbox" className="size-4" checked={sel.has(i.id)} onChange={() => toggle(i.id)} />
                <span className="flex-1">{i.label}</span>
                {i.sub && <span className="font-mono text-xs text-muted-foreground">{i.sub}</span>}
              </label>
            </li>
          ))}
        </ul>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("cancel")}</Button>
          <Button variant="accent" disabled={chosen.length === 0} onClick={() => window.print()}>
            <Printer /> {t("print")} ({chosen.length})
          </Button>
        </div>
        {open && mounted && createPortal(
          <div className="print-root">
            <div className="bulk-cards">{chosen.map((i) => <div key={i.id} className="bulk-card">{render(i)}</div>)}</div>
          </div>,
          document.body,
        )}
      </DialogContent>
    </Dialog>
  );
}
