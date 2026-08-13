/**
 * Boss thường battle stat templates (Phase 10, D-13 / A3).
 *
 * D-13: boss encounters ARE capturable after a win — at a low capture rate
 * consistent with high rarity (rarity 5 — see CAPTURE_BASE_BY_RARITY[5] in
 * sanguoCapture.ts).
 *
 * A3 (adopted): boss encounters have `encounter_runs.hero_id NULL`
 * (encounterRuns.ts:20-23) — no heroes row carries their stats, so the battle
 * input builder reads a zone-scaled template constant keyed by zone code.
 * Values: rarity 5, HP/STR elevated ~2× a rarity-5 hero template (the 10-04
 * class-template cap is ~70 STR / ~235 HP for prominence-5 heroes), other
 * stats zone-flavored. The engine stays agnostic — this module is pure data.
 */
export interface BossTemplate {
  str: number;
  agi: number;
  int: number;
  mov: number;
  lea: number;
  cha: number;
  hp: number;
  mp: number;
  rarity: 5;
}

/** Zone-scaled boss stat blocks — keyed by every seeded map_zones code
 * (scripts/data/sanguo-map-data.json). Core Han heartlands are balanced and
 * dominant; northern/nomad frontiers lean STR/MOV/HP; southern provinces lean
 * AGI/INT. */
export const BOSS_TEMPLATES: Readonly<Record<string, BossTemplate>> = {
  // Central heartland — balanced, high all-round presence
  trung_nguyen: { str: 125, agi: 70, int: 75, mov: 65, lea: 80, cha: 70, hp: 460, mp: 110, rarity: 5 },
  quan_trung: { str: 130, agi: 65, int: 70, mov: 70, lea: 75, cha: 60, hp: 480, mp: 100, rarity: 5 },
  du_chau: { str: 120, agi: 75, int: 65, mov: 70, lea: 70, cha: 65, hp: 450, mp: 95, rarity: 5 },
  duyen_chau: { str: 115, agi: 80, int: 60, mov: 72, lea: 65, cha: 60, hp: 430, mp: 90, rarity: 5 },
  tu_chau: { str: 110, agi: 85, int: 65, mov: 70, lea: 65, cha: 65, hp: 420, mp: 95, rarity: 5 },
  thanh_chau: { str: 125, agi: 70, int: 55, mov: 75, lea: 60, cha: 55, hp: 470, mp: 85, rarity: 5 },
  ky_chau: { str: 120, agi: 65, int: 60, mov: 78, lea: 70, cha: 55, hp: 490, mp: 90, rarity: 5 },
  // Northern / western frontier — cavalry country, STR/MOV/HP heavy
  u_chau: { str: 135, agi: 60, int: 50, mov: 82, lea: 65, cha: 50, hp: 500, mp: 80, rarity: 5 },
  tinh_chau: { str: 140, agi: 68, int: 45, mov: 85, lea: 60, cha: 48, hp: 510, mp: 75, rarity: 5 },
  luong_chau: { str: 138, agi: 66, int: 48, mov: 84, lea: 62, cha: 50, hp: 505, mp: 78, rarity: 5 },
  // Central-south — rich, scholar-friendly
  kinh_chau: { str: 118, agi: 72, int: 80, mov: 66, lea: 78, cha: 75, hp: 445, mp: 120, rarity: 5 },
  duong_chau: { str: 112, agi: 78, int: 78, mov: 68, lea: 72, cha: 70, hp: 430, mp: 115, rarity: 5 },
  ich_chau: { str: 116, agi: 70, int: 72, mov: 72, lea: 75, cha: 68, hp: 455, mp: 105, rarity: 5 },
  giao_chau: { str: 108, agi: 88, int: 82, mov: 74, lea: 68, cha: 72, hp: 425, mp: 110, rarity: 5 },
  // Frontier / foreign tribes — brutal strength, low intellect
  trieu_tien: { str: 120, agi: 75, int: 70, mov: 72, lea: 66, cha: 60, hp: 460, mp: 100, rarity: 5 },
  o_hoan: { str: 142, agi: 82, int: 40, mov: 88, lea: 58, cha: 45, hp: 520, mp: 70, rarity: 5 },
  tien_ti: { str: 140, agi: 84, int: 42, mov: 90, lea: 60, cha: 46, hp: 515, mp: 72, rarity: 5 },
  hung_no: { str: 145, agi: 80, int: 44, mov: 86, lea: 62, cha: 48, hp: 525, mp: 74, rarity: 5 },
};

/**
 * Resolve the boss template for a zone code. Defensive: the seed covers every
 * zone, so an unknown code means the content is out of sync — fail loudly
 * rather than fight with placeholder stats.
 */
export function bossTemplateFor(zoneCode: string): BossTemplate {
  const tpl = BOSS_TEMPLATES[zoneCode];
  if (!tpl) throw new Error('NO_BOSS_TEMPLATE');
  return tpl;
}
