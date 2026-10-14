import { useEffect, useState } from "react";
import { Icon } from "../icons";
import { useLang } from "../lang";
import type { CampaignEditorState } from "./CampaignEditor";
import { Input } from "./inputs";

/** Заметки мастера: поиск и связи с героями и другими заметками (материал мира кампании). */
export function CampaignNotes({ ed }: { ed: CampaignEditorState }) {
  const { t } = useLang();
  const { campaign } = ed;
  const [query, setQuery] = useState("");
  useEffect(() => { if (ed.focusNote) document.getElementById(`note-${ed.focusNote}`)?.scrollIntoView({ block: "center", behavior: "smooth" }); }, [ed.focusNote]);
  if (!campaign) return null;
  const q = query.trim().toLowerCase();
  const notes = campaign.notes.filter((n) => !q || n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q));
  const nameOf = (id: string) => campaign.entities.find((e) => e.id === id)?.name ?? campaign.notes.find((n) => n.id === id)?.title ?? "?";
  const set = (id: string, patch: Partial<(typeof campaign.notes)[number]>) => ed.updateCampaign((c) => ({ ...c, notes: c.notes.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
  return (
    <>
      <div className="ws-section-heading">
        <h2>{t("ws.notes")} <small>{campaign.notes.length}</small></h2>
        <div className="ws-inline">
          <input type="search" aria-label={t("ws.searchNotes")} placeholder={t("ws.searchNotes")} value={query} onChange={(e) => setQuery(e.target.value)} />
          <button className="ws-with-icon" onClick={() => ed.addNote(t("ws.newNoteTitle"))}><Icon name="plus" />{t("ws.addNote")}</button>
        </div>
      </div>
      {!campaign.notes.length && <div className="ws-empty">{t("ws.noNotes")}</div>}
      {!!campaign.notes.length && !notes.length && <div className="ws-empty">{t("ws.noNotesFound")}</div>}
      {notes.map((n) => {
        const linkable = [...campaign.entities.map((e) => ({ id: e.id, name: e.name })), ...campaign.notes.filter((x) => x.id !== n.id).map((x) => ({ id: x.id, name: x.title }))].filter((x) => !(n.links ?? []).includes(x.id));
        return (
          <div className={"ws-note" + (ed.focusNote === n.id ? " focus" : "")} id={`note-${n.id}`} key={n.id}>
            <button className="ws-icon-button ws-note-delete" title={t("ws.deleteNote")} aria-label={t("ws.deleteNote")} onClick={() => ed.updateCampaign((c) => ({ ...c, notes: c.notes.filter((x) => x.id !== n.id).map((x) => ({ ...x, links: x.links?.filter((l) => l !== n.id) })), maps: c.maps?.map((m) => ({ ...m, markers: m.markers.map((k) => (k.noteId === n.id ? { ...k, noteId: undefined } : k)) })) }))}><Icon name="trash" /></button>
            <Input title={t("ws.noteTitle")} value={n.title} onChange={(title) => set(n.id, { title })} />
            <Input title={t("ws.noteBody")} value={n.body} multiline onChange={(body) => set(n.id, { body })} />
            <div className="ws-links">
              <span className="muted">{t("ws.noteLinks")}:</span>
              {(n.links ?? []).map((id) => (
                <span className="ws-chip" key={id}>{nameOf(id)}<button className="ws-icon-button" aria-label={t("ws.unlink")} title={t("ws.unlink")} onClick={() => set(n.id, { links: n.links!.filter((l) => l !== id) })}><Icon name="close" size={11} /></button></span>
              ))}
              {!!linkable.length && (
                <select aria-label={t("ws.linkTo")} value="" onChange={(e) => e.target.value && set(n.id, { links: [...(n.links ?? []), e.target.value] })}>
                  <option value="">{t("ws.linkTo")}</option>
                  {linkable.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}
