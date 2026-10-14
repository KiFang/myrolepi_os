import { createContext, useContext } from "react";

/** Простой режим: убирает формулы, «имена в формулах», действия и технические разделы — остаётся то, что нужно, чтобы собрать систему и вести игру. */
export interface SimpleState { simple: boolean; setSimple: (v: boolean) => void }
export const SimpleContext = createContext<SimpleState>({ simple: false, setSimple: () => {} });
export const useSimple = () => useContext(SimpleContext).simple;
export const useSimpleState = () => useContext(SimpleContext);

const KEY = "rpi.simple";
export const savedSimple = (): boolean => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } };
export const rememberSimple = (v: boolean): void => { try { localStorage.setItem(KEY, v ? "1" : "0"); } catch { /* без сохранения */ } };
export const simpleChosen = (): boolean => { try { return localStorage.getItem(KEY) !== null; } catch { return true; } };
