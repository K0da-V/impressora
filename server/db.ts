import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.ts';
import { nowIso, uid } from './util.ts';
import type { Product, Campaign, Order, EventLog, RuntimeSettings } from '../shared/types.ts';

interface DbShape {
  products: Product[];
  campaigns: Campaign[];
  orders: Order[];
  events: EventLog[];
  settings: RuntimeSettings;
  meta: { lastCycleAt?: string };
}

const emptyDb = (): DbShape => ({
  products: [], campaigns: [], orders: [], events: [],
  settings: { autopilotEnabled: config.rules.autopilotEnabled, keywords: config.rules.keywords },
  meta: {},
});

let state: DbShape = emptyDb();
let file = path.resolve(config.dataFile);

export function initDb(customFile?: string) {
  if (customFile) file = path.resolve(customFile);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file)) {
    try {
      state = { ...emptyDb(), ...JSON.parse(fs.readFileSync(file, 'utf8')) };
    } catch {
      fs.copyFileSync(file, `${file}.corrompido-${Date.now()}`);
      state = emptyDb();
    }
  } else {
    state = emptyDb();
    save();
  }
}

function save() {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, file); // escrita atômica
}

export const db = {
  get products() { return state.products; },
  get campaigns() { return state.campaigns; },
  get orders() { return state.orders; },
  get events() { return state.events; },
  get settings() { return state.settings; },
  get meta() { return state.meta; },
  save,
  reset() { state = emptyDb(); save(); },
};

export function log(level: EventLog['level'], scope: string, message: string) {
  state.events.unshift({ id: uid('ev'), at: nowIso(), level, scope, message });
  if (state.events.length > 500) state.events.length = 500;
  save();
  const line = `[${scope}] ${message}`;
  if (level === 'error') console.error(line); else console.log(line);
}
