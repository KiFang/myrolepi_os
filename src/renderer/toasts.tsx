import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

interface Toast { id: number; text: string; leaving?: boolean }
const ToastContext = createContext<(text: string) => void>(() => {});
export const useToast = () => useContext(ToastContext);

/** Короткие уведомления в правом нижнем углу: плавно появляются и сами исчезают. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const seq = useRef(0);
  const notify = useCallback((text: string) => {
    const id = ++seq.current;
    setItems((l) => [...l.slice(-3), { id, text }]);
    setTimeout(() => setItems((l) => l.map((t) => (t.id === id ? { ...t, leaving: true } : t))), 2800);
    setTimeout(() => setItems((l) => l.filter((t) => t.id !== id)), 3150);
  }, []);
  const value = useMemo(() => notify, [notify]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => <div key={t.id} className={"toast" + (t.leaving ? " leaving" : "")}>{t.text}</div>)}
      </div>
    </ToastContext.Provider>
  );
}
