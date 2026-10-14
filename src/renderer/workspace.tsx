import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  Campaign,
  EntityCategory,
  EntityType,
  FieldDef,
  FieldType,
  GameSystem,
} from "../core";
import type { PluginRegistry } from "./plugin-host";
import example from "../../examples/space-opera.system.json";
import {
  createEntity,
  label,
  newField,
  newId,
  newSystem,
  newType,
  preview,
  rename,
  systemIssues,
} from "./workspace-model";
import type { Project } from "./workspace-model";
import "./workspace.css";

const categories: Record<EntityCategory, string> = {
  character: "Персонаж",
  creature: "Существо",
  vehicle: "Транспорт",
  structure: "Сооружение",
  settlement: "Поселение",
  item: "Предмет",
  location: "Место",
  faction: "Фракция",
  custom: "Свой тип",
};
const fieldTypes: Record<FieldType, string> = {
  number: "Число",
  text: "Текст",
  longtext: "Длинный текст",
  boolean: "Флажок",
  select: "Выбор",
  resource: "Ресурс",
  list: "Список",
  reference: "Ссылка",
  image: "Изображение",
};
type Selection = { kind: "system" | "campaign"; id: string };
const empty: Project = { systems: [], campaigns: [] };
const stringify = (value: unknown) => JSON.stringify(value);

function Input({
  title,
  value,
  onChange,
  multiline = false,
  ...props
}: {
  title: string;
  value: string | number;
  onChange: (value: string) => void;
  multiline?: boolean;
  readOnly?: boolean;
  placeholder?: string;
  type?: string;
  min?: number;
  max?: number;
}) {
  return (
    <label className="ws-control">
      <span>{title}</span>
      {multiline ? (
        <textarea
          aria-label={title}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          {...props}
          aria-label={title}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </label>
  );
}
function JsonInput({
  title,
  value,
  onChange,
}: {
  title: string;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const [text, setText] = useState(stringify(value ?? null));
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setText(stringify(value ?? null));
    setError("");
    input.current?.setCustomValidity("");
  }, [value]);
  return (
    <label className="ws-control">
      <span>{title} (JSON, Enter — применить)</span>
      <input
        ref={input}
        aria-label={`${title} (JSON, Enter — применить)`}
        aria-invalid={Boolean(error)}
        value={text}
        onChange={(e) => {
          const value = e.target.value;
          setText(value);
          try {
            onChange(JSON.parse(value));
            setError("");
            e.target.setCustomValidity("");
          } catch {
            setError("Некорректный JSON");
            e.target.setCustomValidity("Некорректный JSON");
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            try {
              onChange(JSON.parse(text));
              setError("");
            } catch {
              setError("Некорректный JSON");
            }
          }
        }}
        onBlur={() => {
          try {
            onChange(JSON.parse(text));
            setError("");
          } catch {
            setError("Некорректный JSON");
          }
        }}
      />
      {error && <small className="err">{error}</small>}
    </label>
  );
}

export function Workspace({
  registry,
  onTool,
}: {
  registry: PluginRegistry;
  onTool: (tool: "dice" | "formulas" | "plugins" | "help") => void;
}) {
  const [project, setProject] = useState<Project>(empty);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [typeIndex, setTypeIndex] = useState(0);
  const [fieldIndex, setFieldIndex] = useState<number | null>(null);
  const [entityIndex, setEntityIndex] = useState(0);
  const [saved, setSaved] = useState(stringify(empty));
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("Открытие библиотеки…");
  const [loadError, setLoadError] = useState("");
  const [undo, setUndo] = useState<Project[]>([]);
  const [redo, setRedo] = useState<Project[]>([]);
  const current = useRef(project);
  current.current = project;
  const dirty = stringify(project) !== saved;

  useEffect(() => {
    let active = true;
    (async () => {
      if (!window.rpi)
        throw new Error(
          "Хранилище доступно в настольном приложении. Запустите Electron.",
        );
      const read = async (kind: string) =>
        Promise.all(
          (await window.rpi!.store.list(kind)).map((id: string) =>
            window.rpi!.store.read(kind, id),
          ),
        );
      const [systems, campaigns] = await Promise.all([
        read("systems"),
        read("campaigns"),
      ]);
      // Do not replace a library with an empty one if saved data cannot be opened.
      if (
        systems.some(
          (s) =>
            !s ||
            s.schema !== 1 ||
            !s.id ||
            !Array.isArray(s.entityTypes) ||
            (s.macros !== undefined &&
              (!Array.isArray(s.macros) ||
                s.macros.some(
                  (m: { name: string; params: string[] }) =>
                    !m ||
                    typeof m.name !== "string" ||
                    !Array.isArray(m.params),
                ))) ||
            s.entityTypes.some(
              (t: EntityType) =>
                !t ||
                !Array.isArray(t.fields) ||
                !Array.isArray(t.cardViews) ||
                t.fields.some((f) => !f || typeof f.id !== "string") ||
                t.cardViews.some(
                  (v) =>
                    !v || !Array.isArray(v.blocks) || v.blocks.some((b) => !b),
                ) ||
                (t.actions !== undefined &&
                  (!Array.isArray(t.actions) || t.actions.some((a) => !a))) ||
                (t.children !== undefined &&
                  (!Array.isArray(t.children) || t.children.some((c) => !c))),
            ),
        ) ||
        campaigns.some(
          (c) =>
            !c ||
            c.schema !== 1 ||
            !c.id ||
            !Array.isArray(c.entities) ||
            !Array.isArray(c.notes) ||
            c.entities.some(
              (e: { id: string; values: unknown }) =>
                !e ||
                typeof e.id !== "string" ||
                !e.values ||
                typeof e.values !== "object" ||
                Array.isArray(e.values),
            ) ||
            c.notes.some(
              (n: { id: string; title: string; body: string }) =>
                !n ||
                typeof n.id !== "string" ||
                typeof n.title !== "string" ||
                typeof n.body !== "string",
            ),
        )
      )
        throw new Error(
          "Один из документов имеет неподдерживаемый формат. Библиотека не изменена.",
        );
      if (active) {
        const next = { systems, campaigns } as Project;
        setProject(next);
        setSaved(stringify(next));
        setReady(true);
        setNotice("Библиотека открыта");
      }
    })().catch((e) => {
      if (active) {
        setLoadError((e as Error).message);
        setNotice("Не удалось открыть библиотеку");
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const change = useCallback((update: (p: Project) => Project) => {
    const previous = current.current;
    const next = update(previous);
    if (stringify(previous) === stringify(next)) return;
    setUndo((h) => [...h.slice(-79), previous]);
    setRedo([]);
    current.current = next;
    setProject(next);
  }, []);
  const step = useCallback(
    (direction: "undo" | "redo") => {
      const stack = direction === "undo" ? undo : redo;
      if (!stack.length) return;
      const next = stack[stack.length - 1];
      const previous = current.current;
      if (direction === "undo") {
        setUndo(stack.slice(0, -1));
        setRedo((h) => [...h, previous]);
      } else {
        setRedo(stack.slice(0, -1));
        setUndo((h) => [...h, previous]);
      }
      current.current = next;
      setProject(next);
      setFieldIndex(null);
    },
    [undo, redo],
  );
  const save = useCallback(async () => {
    if (!ready || saving || !window.rpi) return;
    if (document.activeElement instanceof HTMLElement)
      document.activeElement.blur();
    const invalid = document.querySelector<HTMLInputElement>(
      ".workspace input:invalid",
    );
    if (invalid) {
      invalid.reportValidity();
      setNotice("Исправьте некорректное значение перед сохранением");
      return;
    }
    const snapshot = current.current;
    setSaving(true);
    try {
      for (const system of snapshot.systems)
        await window.rpi.store.write("systems", system.id, system);
      for (const campaign of snapshot.campaigns)
        await window.rpi.store.write("campaigns", campaign.id, campaign);
      const previous = JSON.parse(saved) as Project;
      for (const system of previous.systems)
        if (!snapshot.systems.some((s) => s.id === system.id))
          await window.rpi.store.remove("systems", system.id);
      for (const campaign of previous.campaigns)
        if (!snapshot.campaigns.some((c) => c.id === campaign.id))
          await window.rpi.store.remove("campaigns", campaign.id);
      setSaved(stringify(snapshot));
      setNotice("Все документы сохранены");
    } catch (e) {
      setNotice(`Ошибка сохранения: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  }, [ready, saving, saved]);
  useEffect(() => {
    const keyboard = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
      }
      const typing =
        e.target instanceof HTMLElement &&
        (["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName) ||
          e.target.isContentEditable);
      if (!typing && e.key.toLowerCase() === "z") {
        e.preventDefault();
        step(e.shiftKey ? "redo" : "undo");
      }
      if (!typing && e.key.toLowerCase() === "y") {
        e.preventDefault();
        step("redo");
      }
    };
    const leave = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("keydown", keyboard);
    window.addEventListener("beforeunload", leave);
    return () => {
      window.removeEventListener("keydown", keyboard);
      window.removeEventListener("beforeunload", leave);
    };
  }, [dirty, save, step]);

  const system =
    selection?.kind === "system"
      ? project.systems.find((s) => s.id === selection.id)
      : undefined;
  const campaign =
    selection?.kind === "campaign"
      ? project.campaigns.find((c) => c.id === selection.id)
      : undefined;
  const linked =
    campaign && project.systems.find((s) => s.id === campaign.systemId);
  useEffect(() => {
    if (system && typeIndex >= system.entityTypes.length)
      setTypeIndex(Math.max(0, system.entityTypes.length - 1));
    if (campaign && entityIndex >= campaign.entities.length)
      setEntityIndex(Math.max(0, campaign.entities.length - 1));
  }, [system, campaign, typeIndex, entityIndex]);
  const type = system?.entityTypes[typeIndex];
  const field = fieldIndex === null ? undefined : type?.fields[fieldIndex];
  const entity = campaign?.entities[entityIndex];
  const entityType = linked?.entityTypes.find((t) => t.id === entity?.typeId);
  const computed = useMemo(
    () =>
      type && system
        ? preview(type, {}, system, registry)
        : entityType && linked && entity
          ? preview(entityType, entity.values, linked, registry)
          : undefined,
    [type, system, entityType, linked, entity, registry],
  );
  const issues = useMemo(
    () => (system ? systemIssues(system) : linked ? systemIssues(linked) : []),
    [system, linked],
  );
  const updateSystem = (update: (s: GameSystem) => GameSystem) =>
    change((p) => ({
      ...p,
      systems: p.systems.map((s) => (s.id === system?.id ? update(s) : s)),
    }));
  const updateType = (update: (t: EntityType) => EntityType) =>
    updateSystem((s) => ({
      ...s,
      entityTypes: s.entityTypes.map((t, i) =>
        i === typeIndex ? update(t) : t,
      ),
    }));
  const updateField = (patch: Partial<FieldDef>) =>
    updateType((t) => ({
      ...t,
      fields: t.fields.map((f, i) =>
        i === fieldIndex ? { ...f, ...patch } : f,
      ),
    }));
  const updateCampaign = (update: (c: Campaign) => Campaign) =>
    change((p) => ({
      ...p,
      campaigns: p.campaigns.map((c) =>
        c.id === campaign?.id ? update(c) : c,
      ),
    }));
  const open = (kind: Selection["kind"], id: string) => {
    setSelection({ kind, id });
    setTypeIndex(0);
    setFieldIndex(null);
    setEntityIndex(0);
  };
  const addSystem = (template?: GameSystem) => {
    const s = template
      ? {
          ...structuredClone(template),
          id: newId("system"),
          name: `${label(template.name)} — копия`,
        }
      : newSystem();
    change((p) => ({ ...p, systems: [...p.systems, s] }));
    open("system", s.id);
  };
  const addCampaign = () => {
    const s = system ?? project.systems[0];
    if (!s) {
      setNotice("Сначала создайте игровую систему");
      return;
    }
    const c: Campaign = {
      schema: 1,
      id: newId("campaign"),
      name: "Новая кампания",
      systemId: s.id,
      entities: [],
      notes: [],
    };
    change((p) => ({ ...p, campaigns: [...p.campaigns, c] }));
    open("campaign", c.id);
  };

  return (
    <div className="workspace">
      <header className="ws-header">
        <div className="ws-brand">
          <span className="ws-logo">M</span>MyRolePi <span>STUDIO</span>
        </div>
        <div className="ws-menu">
          <button onClick={() => onTool("dice")}>Кубики</button>
          <button onClick={() => onTool("formulas")}>Формулы</button>
          <button onClick={() => onTool("plugins")}>Плагины</button>
          <button onClick={() => onTool("help")}>Справка</button>
        </div>
        <span className="ws-local">Локальная библиотека</span>
      </header>
      <div className="ws-toolbar">
        <button disabled={!ready} onClick={() => addSystem()}>
          ＋ Система
        </button>
        <button
          disabled={!ready || !project.systems.length}
          onClick={addCampaign}
        >
          ＋ Кампания
        </button>
        <span className="ws-separator" />
        <button
          disabled={!undo.length}
          onClick={() => step("undo")}
          title="Отменить · Ctrl+Z"
        >
          ↶ Отменить
        </button>
        <button
          disabled={!redo.length}
          onClick={() => step("redo")}
          title="Повторить · Ctrl+Shift+Z"
        >
          ↷ Повторить
        </button>
        <span className="ws-grow" />
        <span className="ws-save-state">
          {dirty ? "Есть несохранённые изменения" : "Изменения сохранены"}
        </span>
        <button
          className="ws-primary"
          disabled={!ready || saving || !dirty}
          onClick={() => void save()}
        >
          {saving ? "Сохранение…" : "Сохранить всё"} <kbd>Ctrl S</kbd>
        </button>
      </div>
      <div className="ws-body">
        <aside className="ws-tree">
          <div className="ws-panel-title">Обозреватель проекта</div>
          <div className="ws-tree-section">
            СИСТЕМЫ <span>{project.systems.length}</span>
          </div>
          {project.systems.map((s) => (
            <button
              key={s.id}
              className={selection?.id === s.id ? "selected" : ""}
              onClick={() => open("system", s.id)}
            >
              <span>◇</span>
              {label(s.name)}
            </button>
          ))}
          <div className="ws-tree-section">
            КАМПАНИИ <span>{project.campaigns.length}</span>
          </div>
          {project.campaigns.map((c) => (
            <button
              key={c.id}
              className={selection?.id === c.id ? "selected" : ""}
              onClick={() => open("campaign", c.id)}
            >
              <span>▤</span>
              {c.name}
            </button>
          ))}
          <div className="ws-tree-footer">
            Система определяет правила.
            <br />
            Кампания хранит героев и историю.
          </div>
        </aside>
        <section className="ws-document">
          <div className="ws-tabs" role="tablist" aria-label="Документы">
            {project.systems.map((s) => (
              <button
                role="tab"
                aria-selected={selection?.id === s.id}
                key={s.id}
                onClick={() => open("system", s.id)}
              >
                ◇ {label(s.name)}
              </button>
            ))}
            {project.campaigns.map((c) => (
              <button
                role="tab"
                aria-selected={selection?.id === c.id}
                key={c.id}
                onClick={() => open("campaign", c.id)}
              >
                ▤ {c.name}
              </button>
            ))}
            {!selection && <span>Начало работы</span>}
          </div>
          <div className="ws-canvas">
            {loadError ? (
              <div className="ws-welcome">
                <h1>Библиотека недоступна</h1>
                <p role="alert" className="err">
                  {loadError}
                </p>
                <p>
                  Сохранённые файлы не изменены. Проверьте данные и повторно
                  откройте приложение.
                </p>
              </div>
            ) : !system && !campaign ? (
              <div className="ws-welcome">
                <div className="ws-eyebrow">ВАША ИГРА. ВАШИ ПРАВИЛА.</div>
                <h1>
                  От идеи — к собственной
                  <br />
                  ролевой системе
                </h1>
                <p>
                  Опишите правила, создайте персонажей и соберите кампанию в
                  одном рабочем пространстве.
                </p>
                <div className="ws-welcome-actions">
                  <button
                    className="ws-primary"
                    disabled={!ready}
                    onClick={() => addSystem()}
                  >
                    Создать систему
                  </button>
                  <button
                    disabled={!ready}
                    onClick={() => addSystem(example as GameSystem)}
                  >
                    Открыть пример
                  </button>
                </div>
                <div className="ws-stages">
                  <div>
                    <b>01 / Правила</b>
                    <p>Типы сущностей, характеристики и вычисляемые поля.</p>
                  </div>
                  <div>
                    <b>02 / Кампания</b>
                    <p>Персонажи, значения полей и заметки ведущего.</p>
                  </div>
                  <div>
                    <b>03 / Расширение</b>
                    <p>Функции формул и системы из ваших плагинов.</p>
                  </div>
                </div>
                {registry.systems.map((s) => (
                  <button
                    key={s.id}
                    disabled={!ready}
                    onClick={() => addSystem(s)}
                  >
                    Создать из плагина: {label(s.name)}
                  </button>
                ))}
              </div>
            ) : system ? (
              <>
                <div className="ws-document-heading">
                  <div>
                    <div className="ws-eyebrow">
                      РЕДАКТОР СИСТЕМЫ / {system.version}
                    </div>
                    <h1>{label(system.name) || "Без названия"}</h1>
                    <p>Правила и структура сущностей вашей игры</p>
                  </div>
                  <button
                    onClick={() => {
                      const t = newType();
                      updateSystem((s) => ({
                        ...s,
                        entityTypes: [...s.entityTypes, t],
                      }));
                      setTypeIndex(system.entityTypes.length);
                      setFieldIndex(null);
                    }}
                  >
                    ＋ Тип сущности
                  </button>
                </div>
                <div className="ws-type-tabs">
                  {system.entityTypes.map((t, i) => (
                    <button
                      className={i === typeIndex ? "active" : ""}
                      key={i}
                      onClick={() => {
                        setTypeIndex(i);
                        setFieldIndex(null);
                      }}
                    >
                      {label(t.label)} <small>{t.fields.length}</small>
                    </button>
                  ))}
                </div>
                {type && (
                  <>
                    <div className="ws-section-heading">
                      <h2>Поля · {label(type.label)}</h2>
                      <button
                        onClick={() => {
                          updateType((t) => ({
                            ...t,
                            fields: [...t.fields, newField()],
                          }));
                          setFieldIndex(type.fields.length);
                        }}
                      >
                        ＋ Добавить поле
                      </button>
                    </div>
                    <div className="ws-table-wrap">
                      <table className="ws-table">
                        <thead>
                          <tr>
                            <th>Название / ID</th>
                            <th>Тип</th>
                            <th>Формула</th>
                            <th>Значение</th>
                          </tr>
                        </thead>
                        <tbody>
                          {type.fields.map((f, i) => (
                            <tr
                              key={i}
                              className={i === fieldIndex ? "selected" : ""}
                              onClick={() => setFieldIndex(i)}
                            >
                              <td>
                                <button onClick={() => setFieldIndex(i)}>
                                  {label(f.label) || "Без названия"}
                                </button>
                                <small>{f.id}</small>
                              </td>
                              <td>{fieldTypes[f.type]}</td>
                              <td>
                                <code>{f.formula || "—"}</code>
                              </td>
                              <td>
                                {computed?.errors[f.id] ? (
                                  <span className="err">Ошибка</span>
                                ) : (
                                  <strong>
                                    {String(computed?.values[f.id] ?? "—")}
                                  </strong>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {!type.fields.length && (
                        <div className="ws-empty">
                          Добавьте характеристики, ресурсы или текстовые поля.
                          <br />
                          Выберите поле, чтобы настроить его в инспекторе
                          справа.
                        </div>
                      )}
                    </div>
                    <div className="ws-hint">
                      Предпросмотр использует значения по умолчанию. Броски в
                      формулах фиксированы для стабильного результата.
                    </div>
                  </>
                )}
              </>
            ) : (
              campaign && (
                <>
                  <div className="ws-document-heading">
                    <div>
                      <div className="ws-eyebrow">
                        КАМПАНИЯ /{" "}
                        {linked ? label(linked.name) : "Система не найдена"}
                      </div>
                      <h1>{campaign.name}</h1>
                      <p>Герои, существа и записи вашей истории</p>
                    </div>
                  </div>
                  <div className="ws-section-heading">
                    <h2>
                      Сущности <small>{campaign.entities.length}</small>
                    </h2>
                    <div className="ws-inline">
                      <select
                        aria-label="Тип новой сущности"
                        value={typeIndex}
                        onChange={(e) => setTypeIndex(Number(e.target.value))}
                      >
                        {linked?.entityTypes.map((t, i) => (
                          <option key={t.id} value={i}>
                            {label(t.label)}
                          </option>
                        ))}
                      </select>
                      <button
                        disabled={!linked?.entityTypes[typeIndex]}
                        onClick={() => {
                          if (!linked) return;
                          updateCampaign((c) => ({
                            ...c,
                            entities: [
                              ...c.entities,
                              createEntity(linked.entityTypes[typeIndex]),
                            ],
                          }));
                          setEntityIndex(campaign.entities.length);
                        }}
                      >
                        ＋ Добавить
                      </button>
                    </div>
                  </div>
                  <div className="ws-entities">
                    {campaign.entities.map((e, i) => (
                      <button
                        className={i === entityIndex ? "selected" : ""}
                        key={e.id}
                        onClick={() => setEntityIndex(i)}
                      >
                        {e.name}
                        <small>
                          {label(
                            linked?.entityTypes.find((t) => t.id === e.typeId)
                              ?.label,
                          ) || "Тип не найден"}
                        </small>
                      </button>
                    ))}
                    {!campaign.entities.length && (
                      <div className="ws-empty">
                        Выберите тип и добавьте первого персонажа или другую
                        сущность.
                      </div>
                    )}
                  </div>
                  {entity && (
                    <div className="ws-sheet">
                      <Input
                        title="Имя сущности"
                        value={entity.name}
                        onChange={(name) =>
                          updateCampaign((c) => ({
                            ...c,
                            entities: c.entities.map((e, i) =>
                              i === entityIndex ? { ...e, name } : e,
                            ),
                          }))
                        }
                      />
                      {!entityType && (
                        <p className="err">
                          Тип сущности отсутствует в системе. Сохранённые
                          значения сохранены.
                        </p>
                      )}
                      <div className="ws-sheet-fields">
                        {entityType?.fields.map((f) => {
                          const value = entity.values[f.id] ?? f.default;
                          const set = (v: unknown) =>
                            updateCampaign((c) => ({
                              ...c,
                              entities: c.entities.map((e, i) =>
                                i === entityIndex
                                  ? { ...e, values: { ...e.values, [f.id]: v } }
                                  : e,
                              ),
                            }));
                          return (
                            <div key={f.id}>
                              {f.formula ? (
                                <div className="ws-computed">
                                  <span>
                                    {label(f.label)} <small>ƒ</small>
                                  </span>
                                  <strong>
                                    {computed?.errors[f.id] ? (
                                      <span className="err">
                                        {computed.errors[f.id]}
                                      </span>
                                    ) : (
                                      String(computed?.values[f.id] ?? "—")
                                    )}
                                  </strong>
                                </div>
                              ) : f.type === "boolean" ? (
                                <label className="ws-checkbox">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(value)}
                                    onChange={(e) => set(e.target.checked)}
                                  />
                                  {label(f.label)}
                                </label>
                              ) : f.type === "select" ? (
                                <label className="ws-control">
                                  <span>{label(f.label)}</span>
                                  <select
                                    value={String(value ?? "")}
                                    onChange={(e) => set(e.target.value)}
                                  >
                                    <option value="">Не выбрано</option>
                                    {f.options?.map((o) => (
                                      <option key={o.value} value={o.value}>
                                        {label(o.label)}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              ) : f.type === "list" ||
                                (f.type === "resource" &&
                                  typeof value === "object") ? (
                                <JsonInput
                                  title={label(f.label)}
                                  value={value}
                                  onChange={set}
                                />
                              ) : (
                                <Input
                                  title={label(f.label)}
                                  value={String(value ?? "")}
                                  type={
                                    f.type === "number" || f.type === "resource"
                                      ? "number"
                                      : "text"
                                  }
                                  min={f.min}
                                  max={f.max}
                                  multiline={f.type === "longtext"}
                                  onChange={(v) =>
                                    set(
                                      f.type === "number" ||
                                        f.type === "resource"
                                        ? v === ""
                                          ? undefined
                                          : Number(v)
                                        : v,
                                    )
                                  }
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  <div className="ws-section-heading">
                    <h2>Заметки ведущего</h2>
                    <button
                      onClick={() =>
                        updateCampaign((c) => ({
                          ...c,
                          notes: [
                            ...c.notes,
                            {
                              id: newId("note"),
                              title: "Новая заметка",
                              body: "",
                            },
                          ],
                        }))
                      }
                    >
                      ＋ Заметка
                    </button>
                  </div>
                  {campaign.notes.map((n) => (
                    <div className="ws-note" key={n.id}>
                      <Input
                        title="Название заметки"
                        value={n.title}
                        onChange={(title) =>
                          updateCampaign((c) => ({
                            ...c,
                            notes: c.notes.map((x) =>
                              x.id === n.id ? { ...x, title } : x,
                            ),
                          }))
                        }
                      />
                      <Input
                        title="Текст заметки"
                        value={n.body}
                        multiline
                        onChange={(body) =>
                          updateCampaign((c) => ({
                            ...c,
                            notes: c.notes.map((x) =>
                              x.id === n.id ? { ...x, body } : x,
                            ),
                          }))
                        }
                      />
                    </div>
                  ))}
                </>
              )
            )}
          </div>
          <div className="ws-diagnostics">
            <div className="ws-panel-title">
              Проверка правил{" "}
              <span>
                {issues.length + Object.keys(computed?.errors ?? {}).length}
              </span>
            </div>
            {issues.length ? (
              issues.map((issue, i) => (
                <div
                  key={i}
                  className={issue.level === "error" ? "err" : "muted"}
                >
                  <b>{issue.level === "error" ? "Ошибка" : "Замечание"}</b> ·{" "}
                  {issue.message} <small>{issue.path}</small>
                </div>
              ))
            ) : (
              <div className="muted">
                {system || campaign
                  ? "Структура системы проверена"
                  : "Откройте документ для проверки правил"}
              </div>
            )}
            {Object.entries(computed?.errors ?? {}).map(([id, error]) => (
              <div className="err" key={id}>
                {id}: {error}
              </div>
            ))}
          </div>
        </section>
        <aside className="ws-inspector">
          <div className="ws-panel-title">Инспектор свойств</div>
          <div className="ws-inspector-content">
            {system ? (
              <>
                <div className="ws-property-group">Документ</div>
                <Input
                  title="Название системы"
                  value={label(system.name)}
                  onChange={(v) =>
                    updateSystem((s) => ({ ...s, name: rename(s.name, v) }))
                  }
                />
                <Input
                  title="Версия"
                  value={system.version}
                  onChange={(version) =>
                    updateSystem((s) => ({ ...s, version }))
                  }
                />
                <Input
                  title="Описание"
                  multiline
                  value={label(system.description)}
                  onChange={(v) =>
                    updateSystem((s) => ({
                      ...s,
                      description: rename(s.description, v),
                    }))
                  }
                />
                {type && (
                  <>
                    <div className="ws-property-group">Тип сущности</div>
                    <Input
                      title="Название типа"
                      value={label(type.label)}
                      onChange={(v) =>
                        updateType((t) => ({ ...t, label: rename(t.label, v) }))
                      }
                    />
                    <label className="ws-control">
                      <span>Категория</span>
                      <select
                        value={type.category}
                        onChange={(e) =>
                          updateType((t) => ({
                            ...t,
                            category: e.target.value as EntityCategory,
                          }))
                        }
                      >
                        {Object.entries(categories).map(([id, name]) => (
                          <option key={id} value={id}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                )}
                {field ? (
                  <>
                    <div className="ws-property-group">Выбранное поле</div>
                    <Input
                      title="Название поля"
                      value={label(field.label)}
                      onChange={(v) =>
                        updateField({ label: rename(field.label, v) })
                      }
                    />
                    <Input
                      title="ID для формул"
                      value={field.id}
                      onChange={(id) => updateField({ id })}
                    />
                    <label className="ws-control">
                      <span>Тип поля</span>
                      <select
                        value={field.type}
                        onChange={(e) => {
                          const kind = e.target.value as FieldType;
                          updateField({
                            type: kind,
                            default:
                              kind === "number" || kind === "resource"
                                ? 0
                                : kind === "boolean"
                                  ? false
                                  : kind === "list"
                                    ? []
                                    : "",
                            options:
                              kind === "select"
                                ? (field.options ?? [
                                    { value: "option", label: "Вариант" },
                                  ])
                                : field.options,
                          });
                        }}
                      >
                        {Object.entries(fieldTypes).map(([id, name]) => (
                          <option key={id} value={id}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Input
                      title="Группа"
                      value={field.group ?? ""}
                      onChange={(group) => updateField({ group })}
                    />
                    <Input
                      title="Формула"
                      value={field.formula ?? ""}
                      placeholder="Например: strength * 2 + 10"
                      onChange={(formula) =>
                        updateField({ formula: formula || undefined })
                      }
                    />
                    <p className="ws-hint">
                      В формулах используйте ID полей. Функции плагинов также
                      доступны.
                    </p>
                    <JsonInput
                      title="Значение по умолчанию"
                      value={field.default}
                      onChange={(value) => updateField({ default: value })}
                    />
                    {(field.type === "number" || field.type === "resource") && (
                      <div className="ws-inline">
                        <Input
                          title="Минимум"
                          type="number"
                          value={field.min ?? ""}
                          onChange={(v) =>
                            updateField({
                              min: v === "" ? undefined : Number(v),
                            })
                          }
                        />
                        <Input
                          title="Максимум"
                          type="number"
                          value={field.max ?? ""}
                          onChange={(v) =>
                            updateField({
                              max: v === "" ? undefined : Number(v),
                            })
                          }
                        />
                      </div>
                    )}
                    {field.type === "select" && (
                      <Input
                        title="Варианты (один на строку)"
                        multiline
                        value={
                          field.options?.map((o) => o.value).join("\n") ?? ""
                        }
                        onChange={(v) =>
                          updateField({
                            options: v
                              .split("\n")
                              .filter(Boolean)
                              .map((value) => ({
                                value,
                                label:
                                  field.options?.find((o) => o.value === value)
                                    ?.label ?? value,
                              })),
                          })
                        }
                      />
                    )}{" "}
                    {field.type === "reference" && (
                      <label className="ws-control">
                        <span>Ссылка на тип</span>
                        <select
                          value={field.refType ?? ""}
                          onChange={(e) =>
                            updateField({
                              refType: e.target.value || undefined,
                            })
                          }
                        >
                          <option value="">Выберите тип</option>
                          {system.entityTypes.map((t) => (
                            <option key={t.id} value={t.id}>
                              {label(t.label)}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    <Input
                      title="Описание поля"
                      multiline
                      value={label(field.description)}
                      onChange={(v) =>
                        updateField({
                          description: rename(field.description, v),
                        })
                      }
                    />
                    <button
                      className="ws-danger"
                      onClick={() => {
                        if (
                          window.confirm(
                            "Удалить поле? Формулы и блоки, которые на него ссылаются, потребуется исправить. Действие можно отменить.",
                          )
                        ) {
                          updateType((t) => ({
                            ...t,
                            fields: t.fields.filter((_, i) => i !== fieldIndex),
                          }));
                          setFieldIndex(null);
                        }
                      }}
                    >
                      Удалить поле
                    </button>
                  </>
                ) : (
                  <p className="ws-hint">
                    Выберите поле в таблице для настройки формулы и свойств.
                  </p>
                )}
              </>
            ) : campaign ? (
              <>
                <div className="ws-property-group">Кампания</div>
                <Input
                  title="Название кампании"
                  value={campaign.name}
                  onChange={(name) => updateCampaign((c) => ({ ...c, name }))}
                />
                <p className="ws-hint">
                  Правила:{" "}
                  {linked ? label(linked.name) : "Связанная система не найдена"}
                </p>
                <div className="ws-property-group">Сводка</div>
                <p>
                  {campaign.entities.length} сущностей · {campaign.notes.length}{" "}
                  заметок
                </p>
                <p className="ws-hint">
                  Вычисляемые поля пересчитываются по правилам системы. Исходные
                  значения хранятся в кампании.
                </p>
              </>
            ) : (
              <>
                <div className="ws-property-group">Рабочее пространство</div>
                <p className="ws-hint">
                  Создайте систему с нуля или изучите готовый пример. Изменения
                  сохраняются на этом компьютере.
                </p>
                <div className="ws-property-group">Горячие клавиши</div>
                <p className="ws-hint">
                  Ctrl+S — сохранить всё
                  <br />
                  Ctrl+Z — отменить
                  <br />
                  Ctrl+Shift+Z — повторить
                </p>
              </>
            )}
          </div>
        </aside>
      </div>
      <footer className="ws-status" role="status">
        <span className={loadError ? "err" : ""}>● {notice}</span>
        <span>
          {issues.filter((i) => i.level === "error").length} ошибок правил
        </span>
        <span className="ws-grow" />
        <span>MyRolePi OS · Рабочее пространство</span>
      </footer>
    </div>
  );
}
