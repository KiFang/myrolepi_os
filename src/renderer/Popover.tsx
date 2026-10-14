import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

/** Выпадающая панель под кнопкой: закрывается по Esc и по клику снаружи. */
export function Popover({ label, icon, className, children, align = "right", title }: { label: ReactNode; icon?: ReactNode; className?: string; children: (close: () => void) => ReactNode; align?: "left" | "right"; title?: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; maxHeight: number } | null>(null);
  // панель крепится к окну (position: fixed), чтобы её не обрезали прокручиваемые области и нижняя панель
  useLayoutEffect(() => {
    if (!open || !box.current) { setPos(null); return; }
    const r = box.current.getBoundingClientRect();
    const below = window.innerHeight - r.bottom - 16;
    const above = r.top - 16;
    const up = below < 320 && above > below; // внизу тесно — раскрываем вверх
    const width = Math.min(420, window.innerWidth - 16);
    const wanted = align === "right" && r.right - width >= 8 ? r.right - width : r.left;
    const side = { left: Math.min(Math.max(8, wanted), window.innerWidth - width - 8) }; // панель всегда целиком в окне
    setPos(up ? { bottom: window.innerHeight - r.top + 6, ...side, maxHeight: Math.min(above, 560) } : { top: r.bottom + 6, ...side, maxHeight: Math.max(200, Math.min(below, 560)) });
  }, [open, align]);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("resize", close);
    return () => window.removeEventListener("resize", close);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { const n = e.target as Node; if (!box.current?.contains(n) && !panel.current?.contains(n)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc, true);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc, true); };
  }, [open]);
  return (
    <div className="popover" ref={box}>
      <button className={"ws-with-icon " + (className ?? "")} aria-expanded={open} aria-haspopup="true" title={title} onClick={() => setOpen((v) => !v)}>{icon}{label}</button>
      {open && pos && createPortal(<div className="popover-panel" ref={panel} style={pos} role="dialog">{children(() => setOpen(false))}</div>, box.current?.closest(".workspace") ?? document.body)}
    </div>
  );
}
