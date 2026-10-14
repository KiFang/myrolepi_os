import { useRef, useState } from "react";
import type { GameMap, MapMarker } from "../../core";
import { resolveSrc } from "../assets";
import { useLang } from "../lang";

export const MARKER_COLORS = ["#e5484d", "#f5a524", "#e9c46a", "#46a758", "#3e8ef7", "#9b6bf2", "#d6409f", "#8b8d98"];
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

interface Props {
  map: GameMap;
  /** в режиме правки метки можно двигать, а клик по карте (при adding) ставит новую */
  editable?: boolean;
  adding?: boolean;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  onAdd?: (x: number, y: number) => void;
  onMove?: (id: string, x: number, y: number) => void;
  /** клик по метке вне режима правки: перейти к сцене, герою или заметке */
  onOpen?: (marker: MapMarker) => void;
}

/** Карта с метками: картинка и булавки поверх неё. Координаты меток — доли размера картинки. */
export function MapCanvas({ map, editable, adding, selectedId, onSelect, onAdd, onMove, onOpen }: Props) {
  const { t } = useLang();
  const box = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ id: string; x: number; y: number; moved: boolean } | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  // последнее положение при перетаскивании хранится и в ссылке: событие отпускания может прийти раньше перерисовки
  const dragRef = useRef<{ id: string; x: number; y: number; moved: boolean } | null>(null);
  const setDragBoth = (d: { id: string; x: number; y: number; moved: boolean } | null) => { dragRef.current = d; setDrag(d); };

  const toRatio = (e: { clientX: number; clientY: number }) => {
    const r = box.current!.getBoundingClientRect();
    return { x: clamp01((e.clientX - r.left) / r.width), y: clamp01((e.clientY - r.top) / r.height) };
  };
  const linked = (m: MapMarker) => !!(m.sceneId || m.entityId || m.noteId);

  return (
    <div className={"map-canvas" + (adding ? " adding" : "")} ref={box}
      onClick={(e) => { if (!editable || (e.target as HTMLElement).closest(".map-marker")) return; if (adding) { const p = toRatio(e); onAdd?.(p.x, p.y); } else onSelect?.(null); }}>
      <img src={resolveSrc(map.image)} alt={map.name} draggable={false} />
      {map.markers.map((m) => {
        const pos = drag?.id === m.id ? drag : m;
        return (
          <button key={m.id} type="button"
            className={"map-marker" + (selectedId === m.id ? " selected" : "") + (linked(m) ? " linked" : "") + (drag?.id === m.id ? " dragging" : "")}
            style={{ left: `${pos.x * 100}%`, top: `${pos.y * 100}%`, ["--pin" as string]: m.color ?? MARKER_COLORS[0] }}
            title={m.label || t("map.markerUnnamed")} aria-label={m.label || t("map.markerUnnamed")} data-marker={m.id}
            onPointerDown={(e) => {
              if (!editable) return;
              e.currentTarget.setPointerCapture(e.pointerId);
              start.current = { x: e.clientX, y: e.clientY };
              setDragBoth({ id: m.id, x: m.x, y: m.y, moved: false });
            }}
            onPointerMove={(e) => {
              const cur = dragRef.current;
              if (!editable || !cur || cur.id !== m.id || !start.current) return;
              const moved = cur.moved || Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 4;
              if (moved) setDragBoth({ id: m.id, ...toRatio(e), moved: true });
            }}
            onPointerUp={() => {
              if (!editable) return;
              const cur = dragRef.current;
              if (cur?.id === m.id && cur.moved) onMove?.(m.id, cur.x, cur.y);
              else onSelect?.(m.id);
              setDragBoth(null);
              start.current = null;
            }}
            onPointerCancel={() => { setDragBoth(null); start.current = null; }}
            onClick={(e) => { e.stopPropagation(); if (!editable) onOpen?.(m); }}
            onKeyDown={(e) => {
              if (!editable) return;
              const step = e.shiftKey ? 0.05 : 0.01;
              const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
              if (d) { e.preventDefault(); onMove?.(m.id, clamp01(m.x + d[0]), clamp01(m.y + d[1])); }
              else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect?.(m.id); }
            }}>
            <svg width="26" height="32" viewBox="0 0 26 32" aria-hidden="true"><path d="M13 31S2 20.5 2 12.5a11 11 0 0 1 22 0C24 20.5 13 31 13 31z" fill="var(--pin)" stroke="rgba(0,0,0,.55)" strokeWidth="1.5" /><circle cx="13" cy="12.5" r="4" fill="rgba(255,255,255,.92)" /></svg>
            {m.label && <span className="map-label">{m.label}</span>}
          </button>
        );
      })}
    </div>
  );
}
