import { Fragment } from "react";
import type { CSSProperties } from "react";
import type { ActionDef, CardBlock, CardView, EntityType, FieldDef } from "../../core";
import { loc } from "../../core";
import { resolveSrc } from "../assets";
import { useLang } from "../lang";
import type { PluginRegistry } from "../plugin-host";
import { CARD_CELL, CARD_COLS, cardTheme } from "./themes";
import { sanitizeHtml } from "./sanitize";

export const BLOCK_KINDS = ["heading", "field", "text", "divider", "image", "bar", "actions"] as const;

export interface Geo { x: number; y: number; w: number; h: number }

export function cardRows(view: CardView, min = 1, geometry?: Record<string, Geo>): number {
  return Math.max(min, ...view.blocks.map((b) => (geometry?.[b.id]?.y ?? b.y) + (geometry?.[b.id]?.h ?? b.h)));
}

function formatValue(field: FieldDef | undefined, value: unknown, lang: string): string {
  if (value === null || value === undefined || value === "") return "—";
  if (field?.type === "boolean") return value ? "✓" : "—";
  if (field?.type === "select") return loc(field.options?.find((o) => o.value === value)?.label, lang) || String(value);
  if (field?.type === "resource" && value && typeof value === "object") {
    const r = value as { current?: number; max?: number };
    return r.max !== undefined ? `${r.current ?? 0} / ${r.max}` : String(r.current ?? 0);
  }
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function barNumbers(field: FieldDef | undefined, value: unknown, block: CardBlock, values: Record<string, unknown>) {
  const obj = value && typeof value === "object" ? (value as { current?: number; max?: number }) : undefined;
  const current = Number(obj ? obj.current : value) || 0;
  const maxField = typeof block.props?.maxField === "string" ? Number(values[block.props.maxField]) : NaN;
  const max = Number(obj?.max ?? (Number.isFinite(maxField) ? maxField : (block.props?.max ?? field?.max ?? 100))) || 100;
  return { current, max, pct: Math.max(0, Math.min(100, (current / max) * 100)) };
}

interface Props {
  type: EntityType;
  view: CardView;
  name: string;
  /** вычисленные значения параметров */
  values: Record<string, unknown>;
  registry: PluginRegistry;
  /** если задан — блок «Действия» кликабелен */
  onRun?: (action: ActionDef) => void;
  selectedBlock?: string | null;
  /** слой поверх блока (режим конструктора: рамка выделения, ручка размера) */
  overlay?: (block: CardBlock, geo: Geo) => JSX.Element | null;
  /** временная геометрия блоков во время перетаскивания */
  geometry?: Record<string, Geo>;
  minRows?: number;
}

/** Рисует карточку по виду (CardView). Один и тот же код — в конструкторе, галерее и листе героя. */
export function CardRenderer({ type, view, name, values, registry, onRun, overlay, geometry, minRows = 1 }: Props) {
  const { lang } = useLang();
  const theme = cardTheme(view.theme);
  const bg = view.background ?? {};
  const rows = cardRows(view, minRows, geometry);
  const vars = { "--c-bg": bg.color || theme.bg, "--c-fg": theme.fg, "--c-accent": theme.accent, "--c-border": theme.border, width: CARD_COLS * CARD_CELL, height: rows * CARD_CELL } as CSSProperties;
  const field = (id?: string) => type.fields.find((f) => f.id === id);
  const fit = bg.fit ?? "cover";

  const body = (b: CardBlock): JSX.Element => {
    const f = field(b.field);
    const showLabel = b.props?.showLabel !== false;
    switch (b.kind) {
      case "heading":
        return <div className={"rpi-heading" + (b.props?.size === "l" ? " large" : "")}>{name}</div>;
      case "field":
        return (
          <div className="rpi-field">
            {showLabel && <span className="rpi-label">{f ? loc(f.label, lang) : "?"}</span>}
            <span className="rpi-value">{formatValue(f, f ? values[f.id] : undefined, lang)}</span>
          </div>
        );
      case "text":
        return <div className="rpi-text">{loc(b.props?.text as string | Record<string, string>, lang)}</div>;
      case "divider":
        return <hr className="rpi-divider" />;
      case "image": {
        const src = resolveSrc((f && typeof values[f.id] === "string" && (values[f.id] as string)) || (typeof b.props?.src === "string" ? b.props.src : ""));
        return src ? <img className="rpi-image" src={src} alt="" /> : <div className="rpi-image empty">▣</div>;
      }
      case "bar": {
        const n = barNumbers(f, f ? values[f.id] : undefined, b, values);
        return (
          <div className="rpi-bar">
            <div className="rpi-bar-top">{showLabel && <span className="rpi-label">{f ? loc(f.label, lang) : "?"}</span>}<span className="rpi-value">{n.current} / {n.max}</span></div>
            <div className="rpi-bar-track"><i style={{ width: `${n.pct}%` }} /></div>
          </div>
        );
      }
      case "actions":
        return (
          <div className="rpi-actions">
            {(type.actions ?? []).map((a) => (
              <button key={a.id} disabled={!onRun} onClick={() => onRun?.(a)}>{loc(a.label, lang)}</button>
            ))}
          </div>
        );
      default: {
        const plugin = registry.blocks[b.kind];
        if (!plugin) return <div className="rpi-text muted">{b.kind}</div>;
        let html = "";
        try {
          const out = plugin.render({ values, props: b.props ?? {}, lang });
          html = typeof out === "string" ? out : out.outerHTML;
        } catch (e) {
          html = `<span>${(e as Error).message.replace(/</g, "&lt;")}</span>`;
        }
        return <div className="rpi-plugin" dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }} />;
      }
    }
  };

  return (
    <div className="rpi-card" style={vars}>
      <div className="rpi-card-bg" style={{ backgroundImage: bg.image ? `url("${resolveSrc(bg.image)}")` : undefined, backgroundSize: fit === "tile" ? "auto" : fit, backgroundRepeat: fit === "tile" ? "repeat" : "no-repeat", backgroundPosition: "center", opacity: bg.image ? (bg.opacity ?? 1) : 0 }} />
      {view.blocks.map((b) => {
        const g = geometry?.[b.id] ?? { x: b.x, y: b.y, w: b.w, h: b.h };
        return (
          <Fragment key={b.id}>
            <div className={`rpi-block kind-${b.kind}`} style={{ left: g.x * CARD_CELL, top: g.y * CARD_CELL, width: g.w * CARD_CELL, height: g.h * CARD_CELL }}>{body(b)}</div>
            {overlay?.(b, g)}
          </Fragment>
        );
      })}
    </div>
  );
}
