/** Мост для страниц вне студии: доступ к текущему (в том числе несохранённому) состоянию проекта. */
let getter: (() => unknown) | null = null;
export const registerProject = (fn: (() => unknown) | null) => { getter = fn; };
export const currentProject = (): unknown => getter?.() ?? null;
