# Phase 11: Progression, Chemistry & Economy Depth - Context

**Gathered:** 2026-08-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 11 delivers the depth layer of the Tam Quốc Collection vertical loop: hồn ngọc progression (dupe conversion → leveling → evolution), the `/sanguo shop` + bag + multi-currency item economy, the legion battle system (3 mains + 9 support with chemistry + support-skill buffs), the BOSS REDESIGN (random zone general with t2 + IV 100, forced 3v1 legion, capturable), and the full 2-slot skill system (normal + special, MP economy). It closes the economy loop under the D-19 net-sink/neutral constraint — every sink goes through `wallet.deductBalance`; hồn ngọc is account-bound per-hero and never converts to Linh thạch; boss drops are items only, never money.

**Requirements in scope:** TQC-14 (dupe → hồn ngọc, tier-scaled, account-bound), TQC-15 (evolution L20→t1 / L50→t2, t3 gated), TQC-16 (`/sanguo shop` + bag + boss item drops, all sinks via wallet), TQC-17 (legion battle 3+9 chemistry extending `battleEngine`). Plus WINDOWS.md #5 (boss redesign) and the Phase 10-deferred skill system.

**Not in scope:** Anti-abuse bot detection, economy monitoring, marketplace gating (Phase 12). Boss server + PvP (post-v1). Capture tiers 4-5 unlock events (schema/engine already model them; only the item gate sourcing lands here).

</domain>

<decisions>
## Implementation Decisions

### Hồn ngọc — the single progression currency (TQC-14 + TQC-15)

- **D-01:** **Hồn ngọc is the ONLY progression currency — there is NO XP.** Battle/capture never award XP. Every level up costs hồn ngọc; evolution ALSO costs hồn ngọc. Evolution does NOT block leveling (a hero can be evolved and still leveled). Max level = 100. — **Reversibility:** one-way — inverts the D-19 (Phase 10) "no XP/leveling in Phase 10" static-level state; the whole level/economy model builds on this.
- **D-02:** **Hồn ngọc is PER-HERO (Pokemon Go candy-style).** Converting a Tào Tháo duplicate yields Tào Tháo hồn ngọc, spendable only on Tào Tháo copies (leveling/evolution/re-roll). Account-bound; NEVER converts to Linh thạch (milestone decision). — **Reversibility:** costly — the per-hero storage model + leveling queries depend on it; converting to a global currency later is a schema + UX migration.
- **D-03:** **Dupe → hồn ngọc value is FLAT BY TIER:** t0 = 1, t1 = 5, t2 = 10, t3 = 20. No per-dupe decay curve. "Diminishing returns" in TQC-14 is satisfied by the flat-by-tier rarity curve itself (rare/evolved tiers are inherently rarer to duplicate). **No daily conversion cap** (TQC-14's "daily conversion cap" is amended). — **Reversibility:** reversible — values are seed/constant config.
- **D-04:** **Conversion + leveling surface = copy selector in `/sanguo hero`.** Since the collection shows EVERY copy as a separate line and `/sanguo hero` today silently resolves a duplicate to the active-companion-or-earliest copy (hero.ts:168-169), Phase 11 adds an explicit copy selector: the hero detail embed gains a per-copy list (index, capturedAt, level, IV grade, HP) + a select menu to choose the target copy (paged at 25 — Discord select menu limit). Convert / level / evolve / skill-re-roll actions act on the selected copy. — **Reversibility:** reversible.
- **D-05:** **Leveling is an explicit action** (button in the copy detail), not passive. Each level costs hồn ngọc on an **accelerating cost curve** (late levels are grindy; max-100 is aspirational). Exact curve = researcher/agent. **The per-level cost is IDENTICAL across t0/t1/t2/t3** — evolution never inflates leveling cost.

### Evolution (TQC-15)

- **D-06:** **Evolution is an explicit evolve action** (button/command), NOT automatic at the level threshold. Conditions: level requirement (L20→t1, L50→t2) + hồn ngọc cost. — **Reversibility:** reversible.
- **D-07:** **Evolution changes: (1) base stats increase** (Pokémon Go-style evolution boost), **(2) emoji to the t1/t2 spritesheet variant** (spritesheets already exist in the asset repo), **(3) dupe→hồn ngọc conversion value** (t1=5, t2=10 per D-03). **IVs stay capture-locked** (never re-rolled by evolution — D-02 Phase 10). — **Reversibility:** costly — the stat model + emoji registry + seed all touch evolution tiers.
- **D-08:** **Leveling raises the 6 battle stats with a FLAT per-level gain** (extends the D-05 Phase 10 formula `combatStat = base + IV` to `base + IV + levelGain`). Exact gain per stat = agent. — **Reversibility:** costly — the battle formula contract (D-05) is the balance anchor; adding the level term touches engine + capture balance.
- **D-09:** **t3 is gated by BOTH a level requirement (e.g., L80+) AND an event-item gate** — unreachable in v3 by design (TQC-15 "schema-gated"). Schema models t3; content/events unlock it. — **Reversibility:** one-way — the D-12 hidden-mechanics + TQC-15 gating contract; removing the gate later is a design change.
- **D-10:** **`user_heroes` gains a tier/evolution column (t0/t1/t2/t3)** — the single source of truth for BOTH player evolution AND the captured boss's tier. — **Reversibility:** costly — schema migration + every battle/collection/capture query reads it.

### Shop, Items & Boss Drops (TQC-16)

- **D-11:** **v1 item catalog = 3 items:** (1) healing item (restores HP — REQUIRED for the D-04 soft-lock recovery path), (2) `capture_key` (shown in shop but NOT sold by Linh thạch — drop-only until events), (3) booster ×2 hồn ngọc on the NEXT dupe conversion (consumable). All account-bound; none marketable (Phase 12 TQC-20 gate). — **Reversibility:** reversible — item catalog is seed content.
- **D-12:** **Booster = next-conversion 2× consumable** — one charge, used BEFORE converting a dupe, doubles that single conversion's hồn ngọc yield. — **Reversibility:** reversible.
- **D-13:** **Bag = new `/sanguo bag` subcommand** listing owned items (from `user_sanguo_items`) with a "Dùng" button per item. Healing targets the active companion (or a copy via the D-04 selector); booster applies at the conversion site; capture_key gates the T4/T5 capture buttons (already wired in `sanguoCapture.ts`). — **Reversibility:** reversible.
- **D-14:** **Boss thường drops = GUARANTEED item per boss win** (≥1 item, rarity-weighted). Items only, never money (D-19). Same `sanguo_items` pool as the shop. — **Reversibility:** reversible.
- **D-15:** **Item sourcing:** healing + booster are BOTH sold (Linh thạch, D-19 sinks via `wallet.deductBalance`) AND dropped. Capture_key is shown in the shop but locked (drop-only now; sold via EVENT ITEMS during events — never Linh thạch). — **Reversibility:** one-way — the key's non-monetization is a D-19/economy-gate stance; selling it for Linh thạch later needs a re-sign.
- **D-16:** **Shop is multi-currency.** `/sanguo shop` renders TABS BY CURRENCY (💎 Linh thạch tab, 🎁 Event tab). `sanguo_items` needs a price-currency model (the current schema has only `base_price` bigint). Buy actions must route through the correct currency path — Linh thạch through `wallet.deductBalance` (D-03 Phase 8); event items through their own inventory/burn. — **Reversibility:** costly — schema (`sanguo_items` price model) + shop UI + currency burn logic.

### Legion Chemistry & Formations (TQC-17)

- **D-17:** **Legion battle = 3 mains FIGHT + 9 support heroes BUFF ONLY.** The 9 support never take a turn on the battlefield. The `battleEngine` extends from 1v1 solo to 3v1/3vN (multi-main active combatants). — **Reversibility:** costly — the D-05/D-06 seeded-engine contract must extend to a multi-combatant input while keeping replayability (sanguo_battles stores the full legion input snapshot).
- **D-18:** **Support buffs are NOT just chemistry — supports field their OWN 2-slot skill loadouts** and their SPECIAL skills can trigger in-battle support effects on a roll/chance (e.g., a vũ cơ with a "buff sỹ khí" skill gives the 3 mains a chance of attack-boost turns, HP regen, MP regen). LEA/CHA (unused in Phase 10's D-05) feed these trigger chances (Phase 8 locked definitions). — **Reversibility:** costly — the support-skill buff engine + LEA/CHA formula are new combat subsystems.
- **D-19:** **Chemistry is quantified EA FC-style: links → points → tier → buff.** Each matching link type adds fixed points (family + spouse are tier-1 strongest, faction mid, role weakest — Phase 8 locked hierarchy); each main's point sum → chemistry tier → tiered % stat buff. Exact point values + tier thresholds + buff % = researcher/agent. — **Reversibility:** costly — the point/tier/buff tables ARE the chemistry balance contract.
- **D-20:** **Strict class-match for slot contribution** (Phase 8 locked rule): a hero contributes chemistry/support ONLY when placed in a slot matching their class; wrong slot = zero contribution. — **Reversibility:** one-way — the Phase 8 chemistry design gate.
- **D-21:** **Formations: free STARTER formation at onboarding + additional formations purchasable** (Linh thạch from shop / event items) **+ boss drops.** The Phase 8 `formations`/`formation_slots`/`user_formations` schema exists; buy/sell logic lands here. — **Reversibility:** reversible.
- **D-22:** **Team assembly = a dedicated legion/formation command** — pick the owned formation, assign the 3 mains + 9 support from the collection (class-matched), persisted as the user's active legion. — **Reversibility:** reversible.
- **D-23:** **Legion battle applies to BOSS battles ONLY.** Regular wild-hero encounters stay SOLO (Phase 10 engine). The boss is a forced 3v1 legion battle — no solo option. — **Reversibility:** reversible.

### Boss Redesign (WINDOWS.md #5)

- **D-24:** **Boss = a real hero drawn from the zone pool (like a normal encounter), using t2 base stats + IV 100 for the FIGHT.** A real `heroes` row exists → the boss is capturable (resolves the WINDOWS #5 BOSS_CAPTURE_UNAVAILABLE stub). — **Reversibility:** one-way — supersedes the `sanguoBoss.ts` zone-scaled template approach.
- **D-25:** **Boss battle entry = FORCED legion battle** (3v1, no solo option). Win → guaranteed item drop (D-14) + capture available. Loss → boss departs, travel resumes (like a wild flee). — **Reversibility:** reversible.
- **D-26:** **Boss capture uses the SAME 5-tier capture-fee model (D-20 signed)** with the rarity-5 (10%) base chance. NO new fee schedule → NO D-18 re-sign required. — **Reversibility:** one-way — reuses the signed D-20 economy contract.
- **D-27:** **Boss frequency = keep the existing ~5-10% boss sub-roll** replacing a successful hero roll (Phase 9 D-14). No scheduled boss windows. — **Reversibility:** reversible.
- **D-28:** **CRITICAL (overrides D-07's captured-boss assumption): the boss you FIGHT is t2 + IV100, but the CAPTURED hero is a RANDOM roll** — random IV (not 100) + random tier weighted **t0 95% / t1 4.98% / t2 0.02%**. Fight difficulty ≠ prize value. Capture fee unchanged. The `user_heroes.tier` column (D-10) stores the captured roll. — **Reversibility:** one-way — a user-design contract; the boss-fight difficulty and the capture reward are deliberately decoupled.

### Skills & MP (Phase 10 deferred — full system in Phase 11)

- **D-29:** **Full 2-slot skill system ships in Phase 11** (not just schema): every hero has exactly 2 skill slots — normal (đánh thường) + special. Normal attacks GENERATE MP; special attacks CONSUME MP (Phase 10 user design, locked: "Đánh thường sẽ tăng MP, đánh special sẽ tiêu tốn MP"). MP column already exists on `heroes`. — **Reversibility:** costly — the skill engine + MP economy integrate into the battle formula (D-05/D-06).
- **D-30:** **Skills come from CLASS-BASED skill pools** — each class has a pool of normal + special skills; when a hero spawns as an ENCOUNTER, its skills are RANDOMLY ROLLED from the class-appropriate pool, weighted by skill rarity. — **Reversibility:** costly — skill pools + rarity weights are seed content; battle balance depends on them.
- **D-31:** **Skills roll AT ENCOUNTER SPAWN and CARRY TO CAPTURE** — the wild hero's rolled skills determine the battle, and on capture they persist to the `user_heroes` copy. Replayable battles must include the rolled skills in the `sanguo_battles.input` snapshot (D-06 replay contract). — **Reversibility:** costly — touches the encounter → battle → capture data flow + replay contract.
- **D-32:** **Skills are re-rollable with hồn ngọc (Pokemon Go TM-style), ONE SLOT at a time** for a per-slot cost. Different copies of the same hero can carry different skill rolls — adds duplicate-collection value. — **Reversibility:** reversible.

### the agent's Discretion
- Exact accelerating level-cost curve numbers; flat stat gain per level.
- Exact chemistry point values, tier thresholds, buff % per tier.
- Exact skill pools, skill rarity weights, skill effect values; exact support-effect trigger chances from LEA/CHA.
- Boss item drop rarity weighting; shop price values (must comply with D-19 net-sink/neutral + ~416/hr gross bound).
- `user_heroes` evolution-tier column shape; `sanguo_items` price-currency schema; skill storage (per-copy columns vs `user_hero_skills` table); legion-input snapshot shape for the battle engine.
- Exact shop/bag/legion/convert embed layouts + customId naming (`sanguo:shop:*`, `sanguo:bag:*`, `sanguo:legion:*`, `sanguo:convert:*`, `sanguo:evolve:*`, `sanguo:reroll:*`).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project & Requirements
- `.planning/ROADMAP.md` §Phase 11 — Goal, Success Criteria (5), Depends, Requirements mapping TQC-14..17, UI hint (SC5: full collection filters faction/zone/IV)
- `.planning/REQUIREMENTS.md` §v3 Progression, Chemistry & Economy Depth — TQC-14..17 with full acceptance detail
- `.planning/PROJECT.md` — Stack constraints, Key Decisions table, milestone v3 target features, economy decisions (D-18/D-19), Phase 10 validation note + boss redesign tracking
- `.planning/STATE.md` — Milestone v3 state; accumulated decisions (chemistry hierarchy, IV grade, hồn ngọc, boss drops, formations); pending todo "Phase 10 capture-fee re-sign (D-18)" — RESOLVED
- `.planning/notes/sanguo-game-design.md` — Core loop, progression (t0→t3, L20/L50 evolution, dupe→hồn ngọc→level), IV stat definitions, chemistry tiers, formations, economy links
- `.planning/WINDOWS.md` #5 — Boss redesign: random zone general, t2 + IV 100, 3v1 legion, capturable (supersedes `BOSS_CAPTURE_UNAVAILABLE` stub)
- `AGENTS.md` — Technology Stack (Drizzle, ioredis, pg-boss, i18next versions)
- `.planning/quick/260811-lld-post-gate-phase-8-schema-redesign-locked/` — formations schema design, chemistry model (family > faction > role), IV rename, role/class/family (bloodline) tables

### Economy gate
- `docs/economy-budget.md` — D-19 net-sink/neutral HARD constraint; convertibility matrix (hồn ngọc account-bound, never → Linh thạch; boss drops items never money); ~416/hr gross magnitude bound; Phase 11 sinks (shop TQC-16, evolution TQC-15) must close the loop

### Existing Code (Integration Points)
- `src/db/schema/userHeroes.ts` — 6 IV columns + level (default 1) + hpCurrent + capturedZone; Phase 11 adds the tier/evolution column (D-10) + skill storage (D-31)
- `src/db/schema/formations.ts` + `formation_slots` + `user_formations` — Phase 8 schema, buy/sell + engine consume land here (D-21/D-22)
- `src/db/schema/sanguoItems.ts` + `userSanguoItems.ts` — item catalog (base_price) + inventory (quantity, unique user+item); needs price-currency model (D-16)
- `src/services/sanguo/battleEngine.ts` — D-05/D-06 locked solo engine; extends to 3v1 legion (D-17) + skills/MP (D-29) + support effects (D-18), replay contract via `sanguo_battles.input`
- `src/constants/sanguoCapture.ts` — signed 5-tier capture fees; T4/T5 `requiresItem` gates (`capture_tier4_key`/`capture_tier5_key`) — shop/boss sourcing lands here (D-11/D-26)
- `src/constants/sanguoBoss.ts` — current zone-scaled boss templates; SUPERSEDED by the random-zone-general redesign (D-24)
- `src/db/schema/heroes.ts` — base stats + rarity + tier (public stars) + faction/role/class/family; MP column (unused → D-29 uses it)
- `src/db/schema/heroRelations.ts` — spouse bonds (tier-1 chemistry, equal to family)
- `src/db/schema/heroFactions.ts` + `heroFamilies.ts` + `heroZoneRates.ts` — chemistry reference data + encounter pools (boss = zone general from these)
- `src/commands/sanguo/hero.ts` — copy-selector extension (D-04); currently resolves duplicates to active-or-earliest (hero.ts:168-169)
- `src/commands/sanguo/heroes.ts` — collection; SC5 needs faction/zone/IV filters (currently zone-only)
- `src/commands/sanguo/battle.ts` + `travel.ts` + `src/events/interactionCreate.ts` — battle/encounter routing; boss legion entry + capture flow extend here
- `src/services/sanguo/battleCheckInService.ts` + `captureService.ts` + `encounterService.ts` — encounter→battle→capture state; boss-legion routing (D-25) + skill roll at spawn (D-31)
- `src/services/wallet.ts` — EVERY shop/evolution/boss sink through `wallet.deductBalance` (D-03 Phase 8)
- `src/ui/embeds/*` + `src/ui/theme.ts` + `src/assets/sanguoEmojis.ts` — embed builders + `heroEmoji()` (tier-aware emoji for evolution display, D-07)
- `scripts/seed-sanguo.ts` + `scripts/data/*.json` — item catalog + skill pools + chemistry content seeding

### External Content Sources (dev-time only — NEVER at runtime)
- `E:\Saeth\sanguo_assets\src\data\tiers.json` — 4-tier spritesheet data (t0→t3) for evolution emoji
- `E:\Saeth\sanguo_assets\assets\emojis.json` — 1056 emoji mapping `{hero_id}_{t0..t3}[_star]` (animated `<a:name:id>` markup)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/services/sanguo/battleEngine.ts` — the seeded/replayable engine (`runBattle(seed, player, enemy)`) is the base for the legion 3v1 extension; the D-06 replay contract (`sanguo_battles.input` snapshot) must absorb the legion input + rolled skills (D-17/D-31)
- `src/constants/sanguoCapture.ts` — signed 5-tier fees + `requiresItem` gates; capture_key (D-11) plugs straight into the existing T4/T5 gating
- `src/commands/sanguo/hero.ts` — copy-selector pattern to extend (currently resolves duplicates at hero.ts:168-169); the `renderHeroDetail` + `handleCompanionPress` pattern generalizes to convert/level/evolve/re-roll buttons
- `src/db/schema/formations.ts` — formations/formation_slots/user_formations already designed; only buy/sell + engine consumption are missing (D-21/D-22)
- `src/db/schema/userSanguoItems.ts` — inventory with `quantity_positive` check + unique (user, item) — the bag surface (D-13)
- `src/services/wallet.ts` — `deductBalance(tx, ...)` WHERE-guard pattern for every Linh thạch sink; event-item currency path needs its own guard (D-16)

### Established Patterns
- **Pull-based check-in, inline results** — boss/skill/level results return inline in the interaction; no cron, no push (D-22/D-23 Phase 9)
- **crypto RNG for every player-facing roll** — skill roll at encounter spawn (D-30), boss capture result (D-28), dupe conversion (none needed — deterministic values), all crypto; pure-rand ONLY inside seeded battle replay (D-06)
- **`FOR UPDATE` single-writer** — level-up, evolve, convert, bag-use, legion-switch all lock the user's own rows; cap/balance checks inside the tx
- **Content-vs-UI split (D-07 Phase 8)** — hero/zone/item names in DB per-locale columns; skill names + UI strings in i18next `sanguo` namespace
- **i18n zero-hardcoded-strings** — eslint-plugin-i18next + `npm run check-i18n`; new shop/bag/legion/skill/convert UI strings go into `sanguo` namespace
- **Hidden-mechanics (D-12)** — IV/rarity never rendered; only IV grade + capture %; evolution tier (public) IS displayable, rarity is not
- **Wallet discipline (D-03 Phase 8)** — every balance change through `wallet.deductBalance`; hồn ngọc is a SEPARATE account-bound per-hero resource, never a `users.balance` flow

### Integration Points
- `src/db/schema/userHeroes.ts` ← tier/evolution column (D-10) + skill storage (D-31) + level flows
- `src/db/schema/sanguoItems.ts` ← price-currency model (D-16); `user_sanguo_items` ← bag consume/burn
- `src/db/schema/formations.ts` ← formation buy/sell + legion assignment (D-21/D-22)
- `src/services/sanguo/battleEngine.ts` ← legion 3v1 (D-17) + skills/MP (D-29) + support effects (D-18) + LEA/CHA (D-18)
- `src/services/sanguo/battleCheckInService.ts` + `captureService.ts` ← boss routing (D-25), boss capture result roll (D-28), skill roll at encounter spawn (D-31)
- `src/constants/sanguoCapture.ts` ← capture_key sourcing (D-11); `src/constants/sanguoBoss.ts` ← REPLACE with random-zone-general (D-24)
- `src/commands/sanguo/` ← hero copy-selector (D-04), heroes filters (SC5), new shop/bag/legion/evolve/convert commands
- `src/events/interactionCreate.ts` ← `sanguo:shop:*`, `sanguo:bag:*`, `sanguo:legion:*`, `sanguo:convert:*`, `sanguo:evolve:*`, `sanguo:reroll:*` customIds
- `docs/economy-budget.md` ← Phase 11 sink compliance verification (D-19) — shop/evolution numbers must be recomputed against the ~416/hr gross bound
</code_context>

<specifics>
## Specific Ideas

- **"battle/capture không give XP, tất cả level đều phải dùng hồn ngọc để tăng, evolution cũng dùng hồn ngọc, evolution không chặn level, level max của một Hero là 100"** — hồn ngọc-only progression, max level 100 (D-01).
- **"hồn ngọc dùng riêng cho mỗi hero tương tự pokemon go"** — per-hero hồn ngọc pools (D-02).
- **"flat by tier, t0 = 1, t1 = 5, t2 = 10, t3 = 20"** — flat-by-tier conversion values (D-03).
- **"capture_key (only show, not sell) ... sẽ mở bán khi có event và bán bằng event item, cho nên shop cũng phải hỗ trợ set up multi currency"** — multi-currency shop with tabbed UI (D-15/D-16).
- **"3 fight, 9 only buff, nhưng buff ở đây không chỉ buff chemistry, còn có thể buff hiệu ứng có trong những skill special, ví dụ nếu trong đội hình có vũ cơ và có skill buff sỹ khí, thì trong battle 3 tướng chủ lực có cơ hội nhận được các lượt tăng tấn công,... hay các hiệu ứng hồi HP, MP"** — support skill-effect buffs beyond chemistry (D-18).
- **"sẽ có các bộ skill theo class, tướng khi encounter sẽ tự random skill từ các bộ skill phù hợp với class và skill rarity"** — class-based skill pools, rolled at encounter (D-30).
- **"có thể dùng hồn ngọc để re-roll lại skill, tương tự pokemon go"** — skill re-roll sink (D-32).
- **"sau khi đánh thắng boss và tới bước capture, tướng capture là random IV không phải 100 IV, bậc tướng cũng sẽ random t0: 95%, t1: 4.98%, t2: 0.02%"** — boss fight ≠ prize; capture result is a random roll (D-28).

</specifics>

<deferred>
## Deferred Ideas

- **Boss server + PvP** — post-v1 per game design note; the legion 3+9 engine built here is the foundation for both.
- **Capture tiers 4-5 event unlocks** — schema/engine model all 5 tiers now; only the item gate sourcing (boss drops here, event items later) lands in Phase 11.
- **`/profile` transaction history UI** — ledger accumulates from Phase 8; visualization stays deferred.
- **Skill content breadth** — full skill pools per class are seeded in Phase 11; hero-unique special skills could expand later (Phase 8 note mentioned potential `tiers.json` forms: mecha/god/sexy).
- **Marketplace listing of sanguo items** — Phase 12 TQC-20 gating; no item marketable this phase.

</deferred>

---

*Phase: 11-progression-chemistry-economy-depth*
*Context gathered: 2026-08-14*
