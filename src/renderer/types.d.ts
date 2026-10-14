import type { RpiApi } from '../main/preload';
declare global { interface Window { rpi?: RpiApi } }
export {};
