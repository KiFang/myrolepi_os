import type { AudioFile } from "../../core";

/** Название трека для показа: из библиотеки, а если файла там уже нет — имя из ссылки. */
export const titleOf = (library: AudioFile[], ref: string | null | undefined) => (ref ? library.find((f) => f.ref === ref)?.title ?? ref.split("/").pop() ?? ref : "");
