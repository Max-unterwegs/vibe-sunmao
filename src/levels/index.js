import { levels as knowledge } from '../data/knowledge.js';
import * as level1 from './level1.js';
import * as level2 from './level2.js';
import * as level3 from './level3.js';
import * as level4 from './level4.js';

const modules = [level1, level2, level3, level4];

export const LEVEL_DEFS = modules.map((m, i) => ({
  meta: m.meta,
  create: m.create,
  info: knowledge[i],
  index: i,
}));

export const byId = (id) => LEVEL_DEFS.find((l) => l.meta.id === id);
