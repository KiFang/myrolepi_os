import type { ActionEffect, DiceRoll } from "../core";

/** Запись журнала бросков (хранится только в памяти до закрытия приложения). */
export interface RollEntry {
  id: string;
  time: number;
  who: string;
  entityId?: string;
  action: string;
  value: unknown;
  rolls: DiceRoll[];
  effects: ActionEffect[];
  applied?: boolean;
}
