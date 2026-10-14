import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

/** Выпадающая панель под кнопкой: закрывается по Esc и по клику снаружи. */
export function Popover({ label, icon, className, children, align = "right", title }: { label: ReactNode; icon?: ReactNode; className?: string; children: (close: () => void) => ReactNode; align?: "left" | "right"; title?: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc, true);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc, true); };
  }, [open]);
  return (
    <div className="popover" ref={box}>
      <button className={"ws-with-icon " + (className ?? "")} aria-expanded={open} aria-haspopup="true" title={title} onClick={() => setOpen((v) => !v)}>{icon}{label}</button>
      {open && <div className={"popover-panel " + align} role="dialog">{children(() => setOpen(false))}</div>}
    </div>
  );
}
