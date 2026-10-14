/** События приложения для панелей (например, смена выбранного документа). */
type Listener = (name: string, data: unknown) => void;
const listeners = new Set<Listener>();
export const onPanelEvent = (cb: Listener) => { listeners.add(cb); return () => { listeners.delete(cb); }; };
export const emitPanelEvent = (name: string, data: unknown) => { for (const l of [...listeners]) l(name, data); };
