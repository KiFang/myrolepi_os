import { useRef, useState } from "react";
import type { CardBlock, FieldDef } from "../../core";
import { loc } from "../../core";
import { BLOCK_KINDS, CardRenderer, cardRows } from "../cards/CardRenderer";
import type { Geo } from "../cards/CardRenderer";
import { CARD_CELL, CARD_COLS, CARD_THEMES } from "../cards/themes";
import { putImage } from "../assets";
import { Icon } from "../icons";
import { useLang } from "../lang";
import type { PluginRegistry } from "../plugin-host";
import { rename } from "../workspace-model";
import { HelpLink, Input } from "./inputs";
import type { SystemEditorState } from "./SystemEditor";

interface Drag { id: string; mode: "move" | "resize"; px: number; py: number; orig: Geo; cur: Geo }

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Холст конструктора: блоки перетаскиваются и растягиваются по сетке, изменение сохраняется одной правкой (одна отмена). */
export function CardDesigner({ ed, registry }: { ed: SystemEditorState; registry: PluginRegistry }) {
  const { t, label, lang } = useLang();
  const { system, type, view } = ed;
  const [drag, setDrag] = useState<Drag | null>(null);
  const moved = useRef(false);
  if (!system || !type || !view) return null;
  const extraKinds = Object.keys(registry.blocks);

  const start = (e: React.PointerEvent, b: CardBlock, mode: Drag["mode"]) => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const geo = { x: b.x, y: b.y, w: b.w, h: b.h };
    moved.current = false;
    ed.setBlockId(b.id);
    setDrag({ id: b.id, mode, px: e.clientX, py: e.clientY, orig: geo, cur: geo });
  };
  const move = (e: React.PointerEvent) => {
    if (!drag) return;
    const dx = Math.round((e.clientX - drag.px) / CARD_CELL);
    const dy = Math.round((e.clientY - drag.py) / CARD_CELL);
    const o = drag.orig;
    const cur = drag.mode === "move"
      ? { ...o, x: clamp(o.x + dx, 0, CARD_COLS - o.w), y: Math.max(0, o.y + dy) }
      : { ...o, w: clamp(o.w + dx, 1, CARD_COLS - o.x), h: Math.max(1, o.h + dy) };
    if (cur.x !== drag.cur.x || cur.y !== drag.cur.y || cur.w !== drag.cur.w || cur.h !== drag.cur.h) { moved.current = true; setDrag({ ...drag, cur }); }
  };
  const end = () => {
    if (drag && moved.current) ed.updateBlock(drag.id, drag.cur);
    setDrag(null);
  };
  const geometry = drag ? { [drag.id]: drag.cur } : undefined;
  const values = ed.computed?.values ?? {};

  return (
    <>
      <div className="ws-view-tabs">
        {type.cardViews.map((v, i) => (
          <button key={v.id} className={i === ed.viewIndex ? "active" : ""} onClick={() => ed.setViewIndex(i)}>{label(v.name) || t("ws.untitled")}</button>
        ))}
        <button className="ws-with-icon" onClick={ed.addView}><Icon name="plus" />{t("ws.addView")}</button>
      </div>
      <p className="ws-hint ws-hint-tight">{t("ws.cardsHint")} <HelpLink topic="cards" /></p>
      <div className="ws-palette">
        <span className="muted">{t("ws.addBlock")}:</span>
        {[...BLOCK_KINDS, ...extraKinds].map((k) => (
          <button key={k} className="ws-with-icon" onClick={() => ed.addBlock(k)}><Icon name="plus" size={13} />{(BLOCK_KINDS as readonly string[]).includes(k) ? t(`blk.${k}`) : loc(registry.blocks[k].label, lang) || k}</button>
        ))}
      </div>
      <div className="ws-card-stage" onPointerDown={() => ed.setBlockId(null)}>
        <div className="ws-card-wrap" style={{ height: cardRows(view, 10, geometry) * CARD_CELL }}>
          <CardRenderer
            type={type}
            view={view}
            name={label(type.label)}
            values={values}
            registry={registry}
            geometry={geometry}
            minRows={10}
            overlay={(b, g) => (
              <div
                key={"o" + b.id}
                className={"ws-block-overlay" + (ed.blockId === b.id ? " selected" : "")}
                style={{ left: g.x * CARD_CELL, top: g.y * CARD_CELL, width: g.w * CARD_CELL, height: g.h * CARD_CELL }}
                onPointerDown={(e) => start(e, b, "move")}
                onPointerMove={move}
                onPointerUp={end}
              >
                {ed.blockId === b.id && <span className="ws-resize-handle" onPointerDown={(e) => start(e, b, "resize")} onPointerMove={move} onPointerUp={end} />}
              </div>
            )}
          />
          <div className="ws-grid-lines" style={{ backgroundSize: `${CARD_CELL}px ${CARD_CELL}px` }} />
        </div>
      </div>
    </>
  );
}

function FieldSelect({ title, fields, value, onChange }: { title: string; fields: FieldDef[]; value?: string; onChange: (id: string | undefined) => void }) {
  const { t, label } = useLang();
  return (
    <label className="ws-control">
      <span>{title}</span>
      <select value={value ?? ""} onChange={(e) => onChange(e.target.value || undefined)}>
        <option value="">{t("ws.chooseField")}</option>
        {fields.map((f) => <option key={f.id} value={f.id}>{label(f.label)}</option>)}
      </select>
    </label>
  );
}

/** Правая панель в режиме карточек: настройки вида и выбранного блока. */
export function CardInspector({ ed }: { ed: SystemEditorState }) {
  const { t, label, lang } = useLang();
  const { type, view, block } = ed;
  if (!type || !view) return null;
  const bg = view.background ?? {};
  const setBg = (patch: Partial<NonNullable<typeof view.background>>) => ed.updateView((v) => ({ ...v, background: { ...v.background, ...patch } }));
  const pickImage = async (file?: File) => {
    if (!file) return;
    const r = await putImage(file);
    if (r.ok) setBg({ image: r.ref });
    else window.alert(t(r.code === "too-big" ? "ws.imageTooBig" : r.code === "bad-type" ? "ws.imageBadType" : "ws.imageFailed"));
  };
  const setProp = (patch: Record<string, unknown>) => block && ed.updateBlock(block.id, { props: { ...block.props, ...patch } });
  const resourceFields = type.fields.filter((f) => f.type === "resource" || f.type === "number");
  return (
    <>
      <div className="ws-property-group">{t("ws.groupView")}</div>
      <Input title={t("ws.viewName")} value={label(view.name)} onChange={(v) => ed.updateView((x) => ({ ...x, name: rename(x.name, v, lang) }))} />
      <label className="ws-control">
        <span>{t("ws.cardTheme")}</span>
        <select value={view.theme ?? "night"} onChange={(e) => ed.updateView((v) => ({ ...v, theme: e.target.value }))}>
          {CARD_THEMES.map((th) => <option key={th.id} value={th.id}>{loc(th.name, lang)}</option>)}
        </select>
      </label>
      <div className="ws-inline ws-color-row">
        <label className="ws-control"><span>{t("ws.bgColor")}</span><input type="color" value={bg.color ?? "#1d2230"} onChange={(e) => setBg({ color: e.target.value })} /></label>
        <button disabled={!bg.color} onClick={() => setBg({ color: undefined })}>{t("ws.reset")}</button>
      </div>
      <label className="ws-control">
        <span>{t("ws.bgImage")}</span>
        <input type="file" accept="image/*" onChange={(e) => { void pickImage(e.target.files?.[0]); e.target.value = ""; }} />
      </label>
      {bg.image && (
        <>
          <label className="ws-control">
            <span>{t("ws.bgFit")}</span>
            <select value={bg.fit ?? "cover"} onChange={(e) => setBg({ fit: e.target.value as "cover" | "contain" | "tile" })}>
              <option value="cover">{t("ws.fitCover")}</option><option value="contain">{t("ws.fitContain")}</option><option value="tile">{t("ws.fitTile")}</option>
            </select>
          </label>
          <label className="ws-control"><span>{t("ws.bgOpacity")}</span><input type="range" min={0.1} max={1} step={0.05} value={bg.opacity ?? 1} onChange={(e) => setBg({ opacity: Number(e.target.value) })} /></label>
          <button onClick={() => setBg({ image: undefined })}>{t("ws.removeImage")}</button>
        </>
      )}
      {type.cardViews.length > 1 && (
        <button className="ws-danger ws-with-icon" onClick={() => window.confirm(t("ws.deleteViewConfirm", { name: label(view.name) })) && ed.removeView()}><Icon name="trash" />{t("ws.deleteView")}</button>
      )}

      {block ? (
        <>
          <div className="ws-property-group">{t("ws.groupBlock")}: {t(`blk.${block.kind}`)}</div>
          {(block.kind === "field" || block.kind === "bar" || block.kind === "image") && (
            <FieldSelect title={t("ws.blockField")} fields={block.kind === "bar" ? resourceFields : block.kind === "image" ? type.fields.filter((f) => f.type === "image") : type.fields} value={block.field} onChange={(field) => ed.updateBlock(block.id, { field })} />
          )}
          {(block.kind === "field" || block.kind === "bar") && (
            <label className="ws-checkbox"><input type="checkbox" checked={block.props?.showLabel !== false} onChange={(e) => setProp({ showLabel: e.target.checked })} />{t("ws.showLabel")}</label>
          )}
          {block.kind === "bar" && (
            <>
              <FieldSelect title={t("ws.barMaxField")} fields={resourceFields} value={block.props?.maxField as string | undefined} onChange={(maxField) => setProp({ maxField })} />
              <Input title={t("ws.barMax")} type="number" value={String(block.props?.max ?? "")} onChange={(v) => setProp({ max: v === "" ? undefined : Number(v) })} />
            </>
          )}
          {block.kind === "text" && (
            <Input title={t("ws.blockText")} multiline value={loc(block.props?.text as string | Record<string, string>, lang)} onChange={(v) => setProp({ text: rename(block.props?.text as string | Record<string, string>, v, lang) })} />
          )}
          {block.kind === "heading" && (
            <label className="ws-control">
              <span>{t("ws.headingSize")}</span>
              <select value={block.props?.size === "l" ? "l" : "m"} onChange={(e) => setProp({ size: e.target.value })}><option value="m">{t("ws.sizeMedium")}</option><option value="l">{t("ws.sizeLarge")}</option></select>
            </label>
          )}
          <div className="ws-inline">
            {(["x", "y", "w", "h"] as const).map((k) => (
              <Input key={k} title={t(`ws.geo.${k}`)} type="number" min={k === "w" || k === "h" ? 1 : 0} value={block[k]} onChange={(v) => ed.updateBlock(block.id, { [k]: Math.max(k === "w" || k === "h" ? 1 : 0, Math.round(Number(v) || 0)) })} />
            ))}
          </div>
          <button className="ws-danger ws-with-icon" onClick={ed.removeBlock}><Icon name="trash" />{t("ws.deleteBlock")}</button>
        </>
      ) : (
        <p className="ws-hint">{t("ws.pickBlock")}</p>
      )}
    </>
  );
}
