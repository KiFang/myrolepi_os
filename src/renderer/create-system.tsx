import { useEffect, useRef, useState } from "react";
import type { GameSystem } from "../core";
import { starterSystem, label } from "./workspace-model";
import { Icon, StudioMark } from "./studio-ui";

export function CreateSystem({
  initial = "classic",
  pluginSystems,
  onCreate,
  onCancel,
}: {
  initial?: string;
  pluginSystems: GameSystem[];
  onCreate: (system: GameSystem) => void;
  onCancel: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState("");
  const [choice, setChoice] = useState(initial);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const templates = [
    {
      id: "classic",
      name: "Базовая TRPG",
      description:
        "Персонаж, характеристики, уровень и формула здоровья. Удобная отправная точка.",
    },
    {
      id: "blank",
      name: "С чистого листа",
      description:
        "Пустой тип персонажа. Все характеристики и правила определяете вы.",
    },
    {
      id: "space",
      name: "Космическая опера",
      description:
        "Персонажи, корабли и колонии. Готовый пример со связанными формулами.",
    },
    ...pluginSystems.map((s, i) => ({
      id: `plugin-${i}`,
      name: label(s.name),
      description: "Шаблон из установленного плагина.",
    })),
  ];
  return (
    <dialog
      ref={dialog}
      className="create-system-dialog"
      aria-labelledby="create-title"
      onCancel={onCancel}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          const source = choice.startsWith("plugin-")
            ? pluginSystems[Number(choice.slice(7))]
            : undefined;
          onCreate(
            starterSystem(
              name.trim(),
              source ?? (choice as "blank" | "classic" | "space"),
            ),
          );
        }}
      >
        <div className="create-heading">
          <StudioMark large />
          <div>
            <span className="ws-eyebrow">НОВАЯ ИГРОВАЯ СИСТЕМА</span>
            <h1 id="create-title">Начнём с ваших правил</h1>
          </div>
          <button
            type="button"
            className="ws-icon-button"
            aria-label="Закрыть создание системы"
            onClick={onCancel}
          >
            <Icon name="close" />
          </button>
        </div>
        <p className="create-intro">
          Система — это правила вашей игры: какие бывают персонажи, из чего
          состоят их листы и как рассчитываются характеристики. Кампанию с
          героями создадим после.
        </p>
        <label className="ws-control">
          <span>Как называется ваша игра?</span>
          <input
            aria-label="Название новой системы"
            autoFocus
            required
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Например, Хроники северных земель"
          />
        </label>
        <div className="create-label">
          Выберите основу <span>Любой шаблон можно полностью изменить</span>
        </div>
        <div
          className="create-templates"
          role="radiogroup"
          aria-label="Основа системы"
        >
          {templates.map((t) => (
            <label key={t.id} className={choice === t.id ? "chosen" : ""}>
              <input
                type="radio"
                name="template"
                value={t.id}
                checked={choice === t.id}
                onChange={() => setChoice(t.id)}
              />
              <span>
                <strong>{t.name}</strong>
                <small>{t.description}</small>
              </span>
              {choice === t.id && <Icon name="check" />}
            </label>
          ))}
        </div>
        <div className="create-footer">
          <span>Документ появится в вашей локальной библиотеке.</span>
          <button type="button" onClick={onCancel}>
            Отмена
          </button>
          <button type="submit" className="ws-primary" disabled={!name.trim()}>
            Создать систему <Icon name="arrow" />
          </button>
        </div>
      </form>
    </dialog>
  );
}
