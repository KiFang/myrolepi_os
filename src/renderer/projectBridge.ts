/** Мост для страниц вне студии: доступ к текущему (в том числе несохранённому) состоянию проекта. */
let getter: (() => unknown) | null = null;
export const registerProject = (fn: (() => unknown) | null) => { getter = fn; };
export const currentProject = (): unknown => getter?.() ?? null;

/** Доступ панелей плагинов к проекту: чтение текущего состояния, запись одним шагом истории (отмена работает) и выбранный документ. */
export interface ProjectApi {
  get(): { systems: unknown[]; campaigns: unknown[] };
  change(fn: (p: any) => any): void;
  selection(): { kind: "system" | "campaign"; id: string } | null;
}
let projectApi: ProjectApi | null = null;
export const registerProjectApi = (api: ProjectApi | null) => { projectApi = api; };
export const currentProjectApi = () => projectApi;
