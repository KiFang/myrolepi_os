import { useEffect, useRef, useState } from "react";
import { Icon } from "../icons";
import { useHelp, useLang } from "../lang";

interface InputProps {
  title: string;
  value: string | number;
  onChange: (value: string) => void;
  multiline?: boolean;
  placeholder?: string;
  type?: string;
  min?: number;
  max?: number;
  /** Пояснение под полем простыми словами. */
  hint?: string;
}

export function Input({ title, value, onChange, multiline = false, hint, ...props }: InputProps) {
  return (
    <label className="ws-control">
      <span>{title}</span>
      {multiline ? (
        <textarea aria-label={title} value={value} placeholder={props.placeholder} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input {...props} aria-label={title} value={value} onChange={(e) => onChange(e.target.value)} />
      )}
      {hint && <small className="ws-field-hint">{hint}</small>}
    </label>
  );
}

/** Поле для значений-структур (список, ресурс). Некорректная запись подсвечивается и блокирует сохранение. */
export function JsonInput({ title, value, onChange }: { title: string; value: unknown; onChange: (value: unknown) => void }) {
  const { t } = useLang();
  const [text, setText] = useState(JSON.stringify(value ?? null));
  const [bad, setBad] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setText(JSON.stringify(value ?? null));
    setBad(false);
    input.current?.setCustomValidity("");
  }, [value]);
  const apply = (raw: string) => {
    setText(raw);
    try {
      onChange(JSON.parse(raw));
      setBad(false);
      input.current?.setCustomValidity("");
    } catch {
      setBad(true);
      input.current?.setCustomValidity(t("ws.badJson"));
    }
  };
  return (
    <label className="ws-control">
      <span>{title}</span>
      <input ref={input} aria-label={title} aria-invalid={bad} value={text} onChange={(e) => apply(e.target.value)} />
      {bad && <small className="err">{t("ws.badJson")}</small>}
    </label>
  );
}

/** Ссылка «Подробнее в справочнике» рядом с подсказкой. */
export function HelpLink({ topic }: { topic: string }) {
  const { t } = useLang();
  const open = useHelp();
  return <button type="button" className="help-link" onClick={() => open(topic)}><Icon name="help" size={13} />{t("help.more")}</button>;
}

/** Поле, которое применяет значение только по Enter или при уходе из поля — для действий с последствиями (переименование). */
export function CommitInput({ title, value, hint, validate, onCommit }: { title: string; value: string; hint?: string; validate: (next: string) => string; onCommit: (next: string) => void }) {
  const [text, setText] = useState(value);
  const [error, setError] = useState("");
  useEffect(() => { setText(value); setError(""); }, [value]);
  const commit = () => {
    if (text === value) return;
    const problem = validate(text);
    if (problem) { setError(problem); return; }
    setError("");
    onCommit(text);
  };
  return (
    <label className="ws-control">
      <span>{title}</span>
      <input aria-label={title} aria-invalid={Boolean(error)} value={text} onChange={(e) => { setText(e.target.value); setError(""); }} onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } else if (e.key === "Escape") { setText(value); setError(""); } }} />
      {error ? <small className="err">{error}</small> : hint && <small className="ws-field-hint">{hint}</small>}
    </label>
  );
}
