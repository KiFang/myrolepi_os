import { useEffect, useRef, useState } from "react";
import { useLang } from "../lang";

interface InputProps {
  title: string;
  value: string | number;
  onChange: (value: string) => void;
  multiline?: boolean;
  readOnly?: boolean;
  placeholder?: string;
  type?: string;
  min?: number;
  max?: number;
}

export function Input({ title, value, onChange, multiline = false, ...props }: InputProps) {
  return (
    <label className="ws-control">
      <span>{title}</span>
      {multiline ? (
        <textarea aria-label={title} value={value} placeholder={props.placeholder} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input {...props} aria-label={title} value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </label>
  );
}

/** Поле для значений-структур (список, ресурс). Некорректный JSON блокирует сохранение. */
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
      <span>{title} · JSON</span>
      <input ref={input} aria-label={`${title} · JSON`} aria-invalid={bad} value={text} onChange={(e) => apply(e.target.value)} />
      {bad && <small className="err">{t("ws.badJson")}</small>}
    </label>
  );
}
