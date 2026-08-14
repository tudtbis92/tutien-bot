# Phase 11: Progression, Chemistry & Economy Depth - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-14
**Phase:** 11-progression-chemistry-economy-depth
**Areas discussed:** Hồn ngọc & dupe conversion, Leveling & evolution model, Shop, items & boss drops, Legion chemistry & formations, Boss redesign details, Skills & MP, Encounter Level

---

## Hồn ngọc & dupe conversion (TQC-14)

| Option | Description | Selected |
|--------|-------------|----------|
| Hồn ngọc = level currency | Battles give XP, hồn ngọc buys levels directly | |
| Hồn ngọc = evolution-only | XP from battles, hồn ngọc only for evolution | |
| Hồn ngọc = XP substitute | XP primary, hồn ngọc can substitute | |
| Other (freeform) | battle/capture không give XP, tất cả level dùng hồn ngọc; evolution cũng dùng hồn ngọc; evolution không chặn level; level max 100 | ✓ |

**User's choice:** Hồn ngọc is the ONLY progression currency; no XP exists; max level 100.
**Notes:** The Phase 10 D-19 "all heroes stay level 1" static state ends here — hồn ngọc is the single leveling/evolution currency.

| Option | Description | Selected |
|--------|-------------|----------|
| Flat by rarity | Same value per rarity class regardless of count | |
| Per-hero decay curve | Each conversion of same hero yields less | |
| Value scales with level/tier | Higher tier/level dupes convert for more | |
| Other (freeform) | flat by tier, t0=1, t1=5, t2=10, t3=20; hồn ngọc dùng riêng cho mỗi hero (Pokemon Go candy-style) | ✓ |

**User's choice:** Flat-by-tier values (t0=1/t1=5/t2=10/t3=20); per-hero hồn ngọc pools.
**Notes:** Per-hero = Pokemon Go candy model; converting a dupe only levels that hero.

| Option | Description | Selected |
|--------|-------------|----------|
| Conversion count cap | Hard max conversions/day | |
| Hồn ngọc amount cap | Hard max hồn ngọc earned/day | |
| Both caps | Count + amount | |
| No daily cap | Dupes are the natural gate (must re-encounter + capture) | ✓ |

**User's choice:** No daily cap. "Diminishing returns" = flat-by-tier rarity curve itself.
**Notes:** TQC-14's "daily conversion cap" wording is amended by this decision.

| Option | Description | Selected |
|--------|-------------|----------|
| Copy selector in /sanguo hero | Select menu of copies before convert/level actions | ✓ |
| Auto-keep-best convert | Auto-convert all but highest-value copy | |
| Per-copy buttons in collection | Convert directly from collection lines | |
| Other | — | |

**User's choice:** Copy selector in /sanguo hero.
**Notes:** User first asked how the collection renders duplicates + how /sanguo hero disambiguates today (answer: every copy is a separate line; detail resolves to active-or-earliest at hero.ts:168-169). A select menu (max 25 options) + paged copy list solves targeting.

| Option | Description | Selected |
|--------|-------------|----------|
| Embed list + select menu | Copy list section + select menu (paged at 25) | ✓ |
| Select menu only | No per-copy detail list | |
| Count + default target | Footer count + default target + swap button | |

**User's choice:** Embed list + select menu (paged at 25).

---

## Leveling & evolution model (TQC-15)

| Option | Description | Selected |
|--------|-------------|----------|
| Explicit evolve action | Dedicated evolve command/button at threshold | ✓ |
| Auto at level threshold | Auto-evolve when leveling hits L20/L50 | |

**User's choice:** Explicit evolve action.

| Option | Description | Selected |
|--------|-------------|----------|
| Stats + emoji + value | Base stats boost + t1/t2 emoji + dupe value; IVs locked | ✓ |
| Cosmetic + value only | Emoji + conversion value, flat stats | |

**User's choice:** Stats + emoji + value (Pokémon Go-style evolution boost); IVs stay capture-locked (D-02 Phase 10).

| Option | Description | Selected |
|--------|-------------|----------|
| Flat stat gain/level | Small flat stat gain per level | ✓ |
| Scaling stat gain/level | Accelerating gains | |
| Level raises HP/MP only | Keeps combatStat = base + IV pristine | |

**User's choice:** Flat stat gain/level (extends the D-05 combatStat formula).

| Option | Description | Selected |
|--------|-------------|----------|
| Linear cost curve | Cost grows linearly with level | |
| Accelerating cost curve | Faster growth at high levels, max-100 aspirational | ✓ |
| Flat cost/level | Uniform per level | |

**User's choice:** Accelerating cost curve. Researcher sets exact numbers.

| Option | Description | Selected |
|--------|-------------|----------|
| t3 = event-item gated | Event/special item gate only | |
| t3 = level + event gate | Level requirement (e.g., L80+) PLUS event item | ✓ |

**User's choice:** t3 = level (e.g., L80+) + event-item gate.
**Notes:** t1/t2 evolution costs stack on the accelerating level curve.

| Option | Description | Selected |
|--------|-------------|----------|
| Next area | — | ✓ |
| More questions | — | |

**User's choice (freeform):** "level cost là giống nhau giữa t0, t1, t2, t3" — evolution never inflates per-level cost.

---

## Shop, items & boss drops (TQC-16)

| Option | Description | Selected |
|--------|-------------|----------|
| Heal + tier keys + capture boost | Healing + T4/T5 keys + a capture-boost item | |
| Heal + tier keys only | Minimal | |
| Expanded catalog | More consumables | |
| Other (freeform) | healing item, capture_key (only show, not sell), booster x2 hồn ngọc khi convert | ✓ |

**User's choice:** Healing item + capture_key (shown, not sold) + booster ×2 hồn ngọc on next conversion.

| Option | Description | Selected |
|--------|-------------|----------|
| Next-conversion 2x consumable | One charge, next dupe conversion ×2 | ✓ |
| Timed 2x window | Time-boxed buff window | |
| Permanent multiplier | Permanent ×1.5 conversion | |

**User's choice:** Next-conversion 2× consumable.

| Option | Description | Selected |
|--------|-------------|----------|
| /sanguo bag + Dùng button | New subcommand with per-item use | ✓ |
| Contextual auto-use | Auto-consume at use points | |

**User's choice:** `/sanguo bag` + Dùng button.

| Option | Description | Selected |
|--------|-------------|----------|
| Guaranteed drop per win | Always ≥1 item on boss win | ✓ |
| Chance-based drop | % chance per win | |
| Guaranteed + rare bonus | Common + rare bonus | |

**User's choice:** Guaranteed drop per boss win (items only, never money).

| Option | Description | Selected |
|--------|-------------|----------|
| Heal+booster sold; key boss-only | Clean paid-vs-drop split | |
| All items sell + drop | Key included | ✓ |
| Heal drops; booster shop-only | | |

**User's choice:** All items sell + drop — but then reconciled (see next row).

| Option | Description | Selected |
|--------|-------------|----------|
| Key: show, locked, drop-only | Shown but locked with 'drop from boss' hint | |
| Key fully sold | Overrides earlier statement | |
| Key sold for hồn ngọc | Out of Linh thạch economy | |
| Other (freeform) | key show, hiện tại không bán bằng linh thạch, sẽ mở bán khi có event và bán bằng event item → shop phải hỗ trợ multi currency | ✓ |

**User's choice:** Capture key shown but NOT sold by Linh thạch; sold via EVENT ITEMS during events → **shop must support multi-currency pricing.**

| Option | Description | Selected |
|--------|-------------|----------|
| Per-item currency on price | Each row shows its currency icon | |
| Tabbed by currency | 💎 Linh thạch tab, 🎁 Event tab | ✓ |

**User's choice:** Tabbed by currency.

---

## Legion chemistry & formations (TQC-17)

| Option | Description | Selected |
|--------|-------------|----------|
| 3 fight, 9 only buff | Mains fight; support only buff | ✓ |
| All 12 fight | Full 12-unit battle | |
| Other (freeform) | buff không chỉ chemistry, còn buff hiệu ứng skill special (VD vũ cơ skill buff sỹ khí → 3 chủ lực cơ hội nhận lượt tăng attack / hồi HP, MP) | ✓ |

**User's choice:** 3 fight, 9 only buff — but support buffs include special-skill effects, not just chemistry.
**Notes:** Example: a vũ cơ with a morale-buff skill gives the 3 mains a chance of attack-boost turns / HP / MP regen.

| Option | Description | Selected |
|--------|-------------|----------|
| Supports have own skills | Supports field their own 2-slot loadouts | ✓ |
| Chemistry only from support | No skill effects | |

**User's choice:** Supports have their own skill loadouts (their specials fire as support effects on roll during battle).

| Option | Description | Selected |
|--------|-------------|----------|
| Points → tier → buff | EA FC-style: links → points → chemistry tier → buff % | ✓ |
| Flat % per link | No tier table | |

**User's choice:** Points → tier → buff (EA FC-like).

| Option | Description | Selected |
|--------|-------------|----------|
| Strict class match | Wrong slot = zero contribution (Phase 8 rule) | ✓ |
| Partial on mismatch | Half contribution | |

**User's choice:** Strict class match (Phase 8 locked).

| Option | Description | Selected |
|--------|-------------|----------|
| Free starter + purchasable extras | Free formation at onboarding + shop purchases | |
| All purchasable | No freebie | |
| Drop/event only | No Linh thạch purchases | |
| Other (freeform) | free starter + có thể mua trong shop/event + boss drop | ✓ |

**User's choice:** Free starter + shop/event purchase + boss drops.

| Option | Description | Selected |
|--------|-------------|----------|
| Dedicated legion/formation command | Pick formation + assign 3+9, persisted | ✓ |
| Auto-fill from collection | Silent best-class-match | |

**User's choice:** Dedicated legion/formation command.

| Option | Description | Selected |
|--------|-------------|----------|
| Legion = boss only | Wild heroes stay solo | ✓ |
| Legion everywhere | All battles are legion | |
| Boss legion + solo wild + legion spar | Practice mode too | |

**User's choice:** Legion = boss only.

| Option | Description | Selected |
|--------|-------------|----------|
| Chemistry stats + LEA/CHA effect chances | Chemistry boosts mains' stats; LEA/CHA feed support-effect chances | ✓ |
| LEA/CHA feed chemistry only | Narrower | |

**User's choice:** Chemistry boosts main stats; LEA/CHA feed support-skill effect trigger chances.

---

## Boss redesign details (WINDOWS.md #5)

| Option | Description | Selected |
|--------|-------------|----------|
| Zone hero, t2+IV100 | Real hero from zone pool, t2 stats + IV 100 | ✓ |
| Separate boss content row | Dedicated boss table | |

**User's choice:** Zone hero with t2 + IV100 → real heroes row → capturable.

| Option | Description | Selected |
|--------|-------------|----------|
| tier column on user_heroes | Single source for evolution + boss tier | ✓ |
| Boss flag, no tier column | t2 computed at battle time | |

**User's choice:** tier column on `user_heroes` (drives player evolution AND captured boss tier).

| Option | Description | Selected |
|--------|-------------|----------|
| Boss = forced legion battle | 3v1, no solo option | ✓ |
| Solo or legion choice | Player chooses | |

**User's choice:** Boss = forced legion battle. Win → guaranteed drop + capture; loss → boss departs.

| Option | Description | Selected |
|--------|-------------|----------|
| Same tiers, rarity-5 chance | Reuse D-20 signed fees, 10% base | ✓ |
| New boss fee tier | New schedule → D-18 re-sign | |

**User's choice:** Same 5-tier fees, rarity-5 chance. No re-sign.

| Option | Description | Selected |
|--------|-------------|----------|
| Keep existing sub-roll | ~5-10% boss sub-roll stays | ✓ |
| Scheduled boss windows | Hourly zones | |

**User's choice:** Keep the existing ~5-10% boss sub-roll.

| Option | Description | Selected |
|--------|-------------|----------|
| Confirmed as described | Fight t2+IV100, capture = random roll | ✓ |
| Confirmed + fee unchanged | Same + fee note | |

**User's choice (freeform, pre-closing):** "sau khi đánh thắng boss và tới bước capture, tướng capture là random IV không phải 100 IV, bậc tướng cũng sẽ random t0: 95%, t1: 4.98%, t2: 0.02%"
**Notes:** Boss FIGHT = t2 + IV100 (hard), but CAPTURE result = random IV + random tier (t0 95% / t1 4.98% / t2 0.02%). Fight difficulty ≠ prize. Capture fee unchanged. This OVERRIDES the earlier assumption that the captured boss is itself t2.

---

## Skills & MP (Phase 10 deferred)

| Option | Description | Selected |
|--------|-------------|----------|
| Full skill system in Phase 11 | 2-slot skills + MP economy + seed + battle integration | ✓ |
| Schema/data now, combat later | Design + seed only | |
| Legion support skills only | Narrow | |

**User's choice:** Full skill system in Phase 11.

| Option | Description | Selected |
|--------|-------------|----------|
| Normal +MP / special -MP (Phase 10 design) | Confirmed user's Phase 10 quote | ✓ |
| Passive MP regen | Time-based MP | |

**User's choice:** Normal +MP / special −MP (Phase 10 design locked).

| Option | Description | Selected |
|--------|-------------|----------|
| Fixed per-hero skills | Static content per hero | |
| Player-equipped loadout | Skill pool + equip | |
| Class templates + hero uniques | Shared class skills + rare unique moves | |
| Other (freeform) | sẽ có các bộ skill theo class, tướng khi encounter sẽ tự random skill từ các bộ skill phù hợp với class và skill rarity | ✓ |

**User's choice:** Class-based skill pools; encounter rolls skills randomly weighted by skill rarity.

| Option | Description | Selected |
|--------|-------------|----------|
| At encounter, carry to capture | Roll at spawn, persist on capture | ✓ |
| Separate battle + capture rolls | Independent rolls | |

**User's choice:** Rolled at encounter spawn, carry to capture. Replayable battles include the rolled skills in the input snapshot.

| Option | Description | Selected |
|--------|-------------|----------|
| Fixed 2, no respec | Rolled once, never changes | |
| Learn many, equip 2 | Pool grows, 2 equipped | |
| Re-roll both slots / Re-roll one slot | — | |
| Other (freeform) | có thể dùng hồn ngọc để re-roll lại skill, tương tự pokemon go | ✓ |

**User's choice:** Skills re-rollable with hồn ngọc (Pokemon Go TM-style); clarified to **re-roll ONE slot at a time** for a per-slot cost.

---

## Encounter Level (wild hero + boss)

| Option | Description | Selected |
|--------|-------------|----------|
| Captured hero keeps level | L22 capture = L22 hero; hồn ngọc only adds more | ✓ |
| Capture resets to L1 | Player re-levels every capture | |

**User's choice:** Captured hero keeps the encounter level (D-34).
**Notes:** Wild spawn level distribution: L1-10 = 60%, L11-20 = 30%, L21-30 = 9.9%, L31-50 = 0.1% (the "30+" band caps at L50) — D-33.

| Option | Description | Selected |
|--------|-------------|----------|
| Fixed boss level | Boss = deliberate challenge | ✓ |
| Same wild distribution | Boss could be L8 | |

**User's choice:** Boss fights at a fixed L50 (t2 evolution threshold) — D-35.

| Option | Description | Selected |
|--------|-------------|----------|
| Keeps L50 | Captured copy keeps fight level | |
| Random wild level | Full random prize | |
| Other (freeform) | 20 | ✓ |

**User's choice:** Captured boss copy is a fixed **L20** (random IV + random tier, but L20 fixed) — D-36.

| Option | Description | Selected |
|--------|-------------|----------|
| 31-100 (full range) | Vanishingly rare high-level encounters | |
| 31-50 cap | Rare but bounded | ✓ |

**User's choice:** The "30+" band is capped at L50 — D-33.

---

## the agent's Discretion

- Exact accelerating level-cost curve numbers; flat stat gain per level; exact t3 level requirement; exact wild-level distribution roll mechanics.
- Exact chemistry point values, tier thresholds, buff % per tier.
- Exact skill pools, skill rarity weights, skill effect values; exact support-effect trigger chances from LEA/CHA.
- Boss item drop rarity weighting; shop price values (must comply with D-19 + ~416/hr gross bound).
- `user_heroes` tier column shape; `sanguo_items` price-currency schema; skill storage (per-copy columns vs `user_hero_skills` table); legion-input snapshot shape for the battle engine.
- Shop/bag/legion/convert embed layouts + customId naming.

## Deferred Ideas

- **Boss server + PvP** — post-v1; the legion 3+9 engine built here is the foundation.
- **Capture tiers 4-5 event unlocks** — schema/engine model all 5 tiers now; only the item gate sourcing (boss drops here, event items later) lands in Phase 11.
- **`/profile` transaction history UI** — ledger data accumulates; visualization deferred.
- **Hero-unique special skills / `tiers.json` forms (mecha/god/sexy)** — possible future expansion beyond class pools.
- **Marketplace listing of sanguo items** — Phase 12 TQC-20 gating.
