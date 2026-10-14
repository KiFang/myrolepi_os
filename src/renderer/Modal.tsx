import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { Icon } from "./icons";
import { useLang } from "./lang";

/** Окно поверх страницы: Esc и клик по фону закрывают, фокус уходит внутрь окна. */
export function Modal({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const { t } = useLang();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    box.current?.querySelector<HTMLElement>("input, select, button.ws-primary, button")?.focus();
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", esc, true);
    return () => { window.removeEventListener("keydown", esc, true); prev?.focus?.(); };
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className={"modal" + (wide ? " wide" : "")} ref={box} role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head"><b>{title}</b><button className="ws-icon-button" aria-label={t("modal.close")} title={t("modal.close")} onClick={onClose}><Icon name="close" /></button></div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}
