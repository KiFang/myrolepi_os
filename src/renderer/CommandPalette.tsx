import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./icons";
import { useLang } from "./lang";

export interface PaletteCommand {
  id: string;
  title: string;
  /** подзаголовок: раздел или плагин */
  group?: string;
  keywords?: string;
  icon?: string;
  run: () => void | Promise<void>;
}

/** Палитра команд (Ctrl+K): поиск по названию и ключевым словам, управление стрелками. */
export function CommandPalette({ open, onClose, commands }: { open: boolean; onClose: () => void; commands: PaletteCommand[] }) {
  const { t } = useLang();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) { setQuery(""); setIndex(0); setTimeout(() => input.current?.focus(), 0); }
  }, [open]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    const words = q.split(/\s+/);
    return commands.filter((c) => { const hay = `${c.title} ${c.group ?? ""} ${c.keywords ?? ""}`.toLowerCase(); return words.every((w) => hay.includes(w)); });
  }, [commands, query]);

  // Esc закрывает палитру, даже если фокус ещё не успел попасть в поле поиска
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); onClose(); } };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open, onClose]);
  useEffect(() => { setIndex(0); }, [query]);
  useEffect(() => { list.current?.querySelector(".active")?.scrollIntoView({ block: "nearest" }); }, [index]);

  if (!open) return null;
  const run = (c?: PaletteCommand) => { if (!c) return; onClose(); void c.run(); };
  return (
    <div className="palette-backdrop" onMouseDown={onClose}>
      <div className="palette" role="dialog" aria-modal="true" aria-label={t("palette.title")} onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") { e.preventDefault(); onClose(); }
          else if (e.key === "ArrowDown") { e.preventDefault(); setIndex((i) => Math.min(shown.length - 1, i + 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setIndex((i) => Math.max(0, i - 1)); }
          else if (e.key === "Enter") { e.preventDefault(); run(shown[index]); }
        }}>
        <div className="palette-search"><Icon name="search" size={17} />
          <input ref={input} value={query} placeholder={t("palette.placeholder")} aria-label={t("palette.placeholder")} onChange={(e) => setQuery(e.target.value)} />
          <kbd>Esc</kbd>
        </div>
        <div className="palette-list" ref={list} role="listbox">
          {!shown.length && <div className="palette-empty">{t("palette.none")}</div>}
          {shown.map((c, i) => (
            <button key={c.id} role="option" aria-selected={i === index} className={"palette-item" + (i === index ? " active" : "")} onMouseMove={() => setIndex(i)} onClick={() => run(c)}>
              <Icon name={c.icon ?? "command"} size={16} /><span className="palette-title">{c.title}</span>{c.group && <span className="palette-group">{c.group}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
