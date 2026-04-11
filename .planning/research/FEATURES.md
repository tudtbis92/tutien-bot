# Feature Landscape: TuTien Bot

**Domain:** Discord RPG / Idle Progression Bot (Xianxia / Tu Tiên theme)
**Researched:** 2026-04-11
**Confidence:** HIGH (primary sources: DaoVerse official site, top.gg ecosystem survey, EPIC RPG documentation, academic idle-game research, peer-reviewed player psychology)

---

## Table Stakes

> Features users expect from a Discord RPG/idle bot. **Missing = players leave immediately or feel the bot is "unfinished."**

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Character registration / profile creation** | Every RPG bot entry-point. Players need an identity anchor before anything else matters. | Low | `/register` or `/bắt đầu`; store display_name, spiritual_root (ngũ linh căn), created_at. First impression. |
| **Profile / stats display** | Players need to check their own state constantly. Core to the feedback loop. "How am I doing?" | Low | `/profile [@user]`; show cảnh giới, tu vi, linh thạch, profession level, season rank. Embed with avatar. |
| **Passive XP accumulation** | **This is TuTien Bot's core value proposition.** Every Discord RPG bot now has some activity tracking. It is expected. | Medium | Cooldown-bucketed awards for chat (per channel, per window), voice (per minute), reactions. Anti-farm rate-limits essential. |
| **Cảnh giới (realm/level) progression** | Fundamental to xianxia genre AND to any RPG bot. "Level up" is the most addictive core mechanic. | Medium | Hard thresholds of tu vi per cảnh giới. Manual breakthrough command with a pass/fail element (e.g., bottleneck failure chance). |
| **Daily rewards / claim** | Present in 100% of successful Discord economy bots (Dank Memer, OwO, EPIC RPG, Tatsu). Drives daily active users. | Low | `/điểm_danh` or `/daily`; tiered reward based on cảnh giới or streak. Streak multiplier increases retention significantly. |
| **Leaderboard** | Creates social competition. Without it the game feels single-player and pointless. EPIC RPG, OwO, Tatsu all lead with this. | Low–Med | `/bảng_xếp_hạng` — global by tu vi, by season rank, by linh thạch. Pagination required for large player bases. |
| **Help / command reference** | Highest-volume support question for every bot without good help. Reduces abandonment. | Low | `/help [topic]`; organized by category (cultivation, marketplace, combat, profession). Context-sensitive is best. |
| **Basic economy: linh thạch balance** | All successful bots have a visible currency. Players need to know what they have before engaging any economy feature. | Low | `/ví` or embedded in `/profile`. Show bank vs. liquid balance if applicable. |
| **Cooldown notifications / reminders** | EPIC RPG has a massive secondary ecosystem (reminder bots) because the base bot lacks good reminders. Players forget = churn. | Low–Med | DM or channel ping when tu vi accumulation cycle resets, when breakthrough is ready, when marketplace order fills. Opt-in. |
| **Onboarding flow (first-time user experience)** | 2025 Discord meta: servers that activate new members 2× outperform those that don't. First 5 minutes determines retention. | Medium | Auto-DM with `/bắt đầu` tutorial, or an interactive embed walkthrough. Explain cảnh giới progression in plain language. |
| **Anti-farming protection** | Message-spam farming is the #1 economy-breaking exploit. Without it, the economy collapses and honest players leave. | Medium | Per-channel cooldown bucket (e.g., 1 award per 60s per channel), minimum message length threshold, bot-message exclusion. |
| **Basic PvE combat** | Present in EPIC RPG, IdleRPG, DaoVerse, Infinite Ascension. Players expect something to "fight" to spend stamina/energy. | Medium | `/săn_bắt` (hunt) or `/tu_luyện` with encounter vs. mob; loot drops, exp rewards. |
| **Slash command interface** | Discord deprecated prefix commands; slash commands are mandatory UX standard as of 2022. Bots using `!` feel dated. | Low | discord.js v14+ slash commands with autocomplete. All interactions via components (buttons, selects) where possible. |
| **Season / reset announcement system** | Players need advance warning before a hard reset. Surprise resets cause outrage and mass uninstalls. | Low | Announce season end 7 days, 24 hours, 1 hour before. Post season summary (top 10 leaderboard) before wipe. |

---

## Differentiators

> Features that set TuTien Bot apart from DaoVerse, Dao, EPIC RPG, and Tatsu. Not universally expected, but create competitive moat.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Activity-driven passive tu vi** | Unlike DaoVerse/EPIC RPG where you have to actively run commands, TuTien awards tu vi for just *being* on Discord. Zero-friction entry. Speaks directly to the "mọi hoạt động đều có ý nghĩa" core value. | Medium | The hook: new players join, chat normally, and discover they're already cultivating. Viral potential. |
| **Global cross-server economy (marketplace)** | Most bots are per-server. TuTien's global marketplace with VWAP pricing is a genuine industry differentiator — more liquidity, fairer prices, richer economy. Comparable only to Eve Online's cross-region markets. | High | VWAP 1h window, instant buy/sell, limit orders, GTC. Requires careful economic balancing. Unique competitive advantage. |
| **Dynamic VWAP price discovery** | No other Discord bot has been found to use VWAP for item pricing. Typically bots use fixed shop prices or simple supply/demand ratios. | High | base_price floor + 1h VWAP market_price. Instant buy at 1.2×, instant sell at 0.7×. Order cap at 2.5× market. Professional-grade economics in a game bot. |
| **Professions with skill trees (gathering + crafting)** | EPIC RPG has flat work commands. DaoVerse has alchemy. Neither has a branching skill tree. Skill trees create long-term specialization identity. | High | 2 professions at launch: gathering (herbs, ore, wood) + crafting (pills, equipment, formations). Skill point allocation per level. |
| **Hard season reset with partial persistence** | Seasonal resets exist in other bots but typically reset everything. TuTien's model (reset cảnh giới + some persistence) is nuanced — veterans keep *something* while new players can compete. Comparable to Path of Exile leagues. | Medium | Design what persists carefully: cosmetics, title history, a small "heirloom" linh thạch amount? Never core progression stats. |
| **Season identity / theming** | Each season has a different xianxia story theme and different realm names (Season 1: Luyện Khí classic, Season 2: could be a different cultivation path). Creates collectible seasons. | Low–Med | Per-season cosmetics (profile frame, title) that persist as trophies. Season 1 badge becomes exclusive. |
| **Vietnamese-first i18n** | Almost no cultivation bot targets Vietnamese speakers natively. Massive underserved market. EPIC RPG supports EN/ES/PT. DaoVerse is English only. | Medium | Vietnamese as primary; simplified Chinese (ZH-CN) as strong secondary. English as tertiary. i18n architecture from day 1. |
| **Voice activity cultivation** | Rare in Discord RPG bots. Rewards players who spend time in voice channels, not just text. Creates a natural integration with gaming/study communities. | Medium | Requires GUILD_VOICE_STATES intent. Per-minute award with diminishing returns after ~60 min/day to prevent AFK farming. |
| **Realm breakthrough failure / bottleneck** | In xianxia fiction, breakthrough failure is narratively central (and terrifying). Most bots make it trivial. A chance of failure at major realm boundaries (e.g., Kim Đan) with retry cooldown creates authentic tension and viral "I failed my breakthrough" stories. | Medium | Configurable failure chance at major realm transitions. Failure → lose some tu vi, retry in 24h. Can spend linh thạch to reduce failure chance (monetization hook). |
| **Global character identity (cross-server)** | Players' cultivation progress is tied to Discord identity, not a single server. Encourages multi-server join, increases bot's network effect. DaoVerse also does this — it works. | Medium | Requires careful data model (global user_id = Discord snowflake, not guild-scoped). Covered in ARCHITECTURE.md. |
| **Reaction cultivation rewards** | Rewarding reactions (emoji) is very rare. Creates an incentive to engage with others' content meaningfully. | Low | Award small tu vi for unique reactions given (not received), with daily cap. |

---

## Anti-Features

> Features to **deliberately NOT build in v1**. Explicit scope decisions, not omissions.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Guild / sect system (môn phái)** | Requires significant additional complexity: member management, shared resources, territory, sect wars. DaoVerse built this — it's a v2+ feature requiring community validation first. | Build solo progression fully. Add "Sect/Guild" as Season 2 target after validating player base. |
| **Web dashboard / admin panel** | Engineering cost is high (separate frontend, auth, hosting). Slash commands cover 95% of admin needs in v1. Premature optimization. | Slash commands with admin permission checks. Consider Prometheus metrics endpoint instead for ops. |
| **Gacha / card collection system** | DaoVerse uses gacha for spiritual roots — tempting but creates pay-to-win perception and regulatory risk in some jurisdictions (especially EU). | Spiritual root randomized at registration (not purchasable), purely cosmetic/flavor. Avoid gacha loops that require premium currency. |
| **Minigames (gambling: slots, blackjack)** | Dank Memer, OwO already own this space. Gambling mechanics attract the wrong audience for a cultivation RPG and create drama. TuTien's identity is *cultivation*, not casino. | Small luck element in breakthrough failure/success is sufficient. No standalone gambling commands. |
| **Mobile app / separate platform** | Out of scope per PROJECT.md. Dilutes focus. Discord is the entire platform. | — |
| **Real-time chat / voice integration beyond rewards** | Project explicitly scopes this out. Discord is the platform, not the product. | Activity tracking only (read voice state, count messages). Never intercept or relay chat. |
| **Complex PvP ranking / ELO ladder** | Complex ranked systems require matchmaking infrastructure, season rebalancing, and enormous design effort. Easy to make unfair. | Simple opt-in PvP duel with win/loss outcomes and a rough leaderboard. No MMR v1. |
| **Automated dungeon raids (multi-player)** | Coordination features (scheduling, party formation) add massive scope. IdleQuest built this and it's their most complex feature. | Solo PvE hunting is sufficient for v1. Raid content is Season 2. |
| **Custom server economy (per-guild currency)** | UnbelievaBoat owns this space. Fragmenting the economy per server kills liquidity in the global marketplace. | Global linh thạch only. Servers customize *channels* where bot is active, not the economy itself. |
| **Selling cosmetics via NFT or blockchain** | Regulatory and community toxicity risk. Discord community strongly negative on crypto/NFT bots. Reputational damage risk far outweighs potential revenue. | Traditional IAP: buy linh thạch with fiat via Stripe. Cosmetics as direct purchase, not tokenized assets. |

---

## Feature Dependencies

```
Registration → ALL other features (nothing works without a character)

Passive tu vi accumulation
  → Anti-farm rate limiting (must co-ship; one is useless without the other)
  → Cooldown notifications (enhances retention but not blocking)

Cảnh giới progression
  → Breakthrough mechanic (tu vi threshold + optional failure chance)
  → Leaderboard (rank by cảnh giới)
  → Marketplace unlock gates (higher cảnh giới unlocks more item types)

Marketplace (global VWAP)
  → Professions (supply side: crafters list items)
  → Linh thạch economy (demand side: buyers spend currency)
  → Season reset (prices and order books reset per season)

Professions (gathering + crafting)
  → PvE combat (loot drops → crafting inputs)
  → Marketplace (output → listing items for sale)

Season system
  → All progression features (defines scope of reset)
  → Leaderboard (season-scoped ranking)
  → Hard reset → careful "what persists" design required early

Monetization (linh thạch purchase)
  → Economy balance (must be designed with fiat entry in mind from day 1)
  → VWAP pricing (premium currency influx affects market prices)
  → Breakthrough failure reduction (natural monetization hook without P2W)

i18n (all strings externalized)
  → ALL features (must be wired before any user-facing text is written)
  → Cannot be retrofitted cheaply after v1 ships
```

---

## Xianxia / Cultivation Theme: Resonant Features

> Features that specifically resonate with xianxia readers (Chinese, Vietnamese, and diaspora audiences).

| Feature | Xianxia Resonance | Implementation Notes |
|---------|-------------------|---------------------|
| **Cảnh giới names (realm names)** | Core to genre identity. Vietnamese terms: Luyện Khí → Trúc Cơ → Kim Đan → Nguyên Anh → Hóa Thần → Luyện Hư → Hợp Thể → Đại Thừa → Độ Kiếp → Tiên Nhân. Classical names that readers recognize immediately. | Season 1 uses classic sequence. Season 2 can introduce alternate path (e.g., body refinement path: Thể Tu). |
| **Spiritual roots / ngũ linh căn** | The "talent system" from xianxia fiction. 5 elemental affinities (Kim, Mộc, Thủy, Hỏa, Thổ). Higher-grade roots = better tu vi multipliers. Creates identity differentiation without P2W. | Randomly assigned at registration (bell curve: most players get common roots, rare chance at Thiên Linh Căn). Purely cosmetic/multiplier, not purchasable. |
| **Tu vi as cultivation points** | The genre-native term for progression points. "XP" would feel wrong. "Tu vi" is immediately understood by target audience. | Use tu vi everywhere in Vietnamese UI. English UI: "cultivation qi" or "cultivation points." |
| **Breakthrough ceremony** | In novels, breakthroughs are events — vision sequences, heavenly tribulation, realm shaking. Implement as a narrative embed with flavor text per realm. | `/đột_phá` command triggers an embed with realm-appropriate narrative text. Failed breakthroughs get a different dramatic narrative. |
| **Pills and alchemy (đan dược)** | A core xianxia system. Pills are the primary crafted items. Examples: Tụ Linh Đan (gather spirit), Hồi Linh Đan (restore), Đột Phá Đan (assist breakthrough). | Alchemy is the primary crafting profession. Ingredient types match xianxia herbalism: tinh thảo (spirit herbs), linh dược (spirit medicines). |
| **Spirit beasts / yêu thú in PvE** | Genre-standard antagonists. Players "hunt" spirit beasts for resources and tu vi. | PvE enemies are yêu thú (spirit beasts), not generic "monsters." Tiered by cảnh giới equivalence. |
| **Linh thạch (spirit stones) as currency** | Genre-native term. "Coins" or "gold" would feel entirely wrong for this theme. | Single currency. Linh thạch. Sub-unit potential: Hạ Phẩm / Trung Phẩm / Thượng Phẩm Linh Thạch for large denominations (like item stacks). |
| **Tiên hiệp flavor text** | All system messages, errors, confirmations use genre language. "Your cultivation has been disrupted" (rate limit) instead of "You're on cooldown." | i18n keys contain both the functional message and the thematic wrapper. Flavor is part of the i18n value, not hardcoded. |
| **Heaven and Earth prestige narrative** | Season resets framed as "Ascending to a higher plane" or "A great calamity reset the mortal realm." Season end is not a boring admin wipe but a narrative event. | Pre-season-end announcement has lore narrative. Season 2 start has new realm naming and new flavor text. |

---

## i18n Considerations

> Language priority for the xianxia/tu tiên audience.

| Language | Priority | Rationale | Notes |
|----------|----------|-----------|-------|
| **Tiếng Việt (vi)** | PRIMARY | Core target audience. "Tu tiên" is the Vietnamese term for the genre. Large, underserved Discord community. No existing bot targets this segment natively. | All UI strings must be natural Vietnamese, not machine-translated Chinese. Must consult with Vietnamese native speaker for term choices. |
| **中文简体 (zh-CN)** | SECONDARY | Xianxia originates in Chinese internet fiction (web novel culture). Chinese Discord users are significant. DaoVerse (English-only) misses this segment entirely. | Genre terms in Chinese are canonical — verify correct simplified Chinese for each realm name. |
| **English (en)** | TERTIARY | International reach, diaspora, non-Vietnamese/Chinese xianxia fans (the genre has huge English-reading fandom via Wuxiaworld, WebNovel). | Should be polished but not the primary focus. English UI can use translated terms (e.g., "Foundation Building" for Trúc Cơ). |
| **中文繁體 (zh-TW)** | QUATERNARY (v2) | Traditional Chinese for Taiwan/HK audience. Same genre interest. Can derive from zh-CN with term adjustments. | Defer to v2. Avoid blocking v1 on a 4th locale. |

**Implementation rule:** Every single user-facing string goes through the i18n system from the first line of code. No exceptions. Retrofitting i18n later costs 3-5× the initial implementation effort (confirmed by every major bot team that has done it). Use a well-structured JSON locale file hierarchy.

---

## Player Psychology: Retention Drivers

> What keeps players engaged long-term. Informs feature prioritization and design choices.

### The Idle Game Retention Loop

Based on academic research (Hwang 2025, UC Santa Cruz) and community observation:

```
Player opens Discord → Checks tu vi gained passively → Small dopamine hit
  → Sees they're close to next cảnh giới → Goal is visible (near completion)
    → Engages actively: hunt, craft, marketplace → Bigger reward
      → Level up / breakthrough → Large dopamine hit + narrative moment
        → Shows off on leaderboard / tells server → Social validation
          → Returns tomorrow for daily reward + passive accumulation → Loop repeats
```

**Key insights:**
1. **Passive accumulation is the re-engagement hook** — players return because they know something has happened while they were away. Design tu vi gain to always have *something* waiting (never zero gain after 8+ hours of normal Discord use).
2. **Near-miss psychology for breakthroughs** — show players exactly how much tu vi they need for the next realm. The "I'm 87% of the way there" feeling is more motivating than abstract XP bars.
3. **Daily streaks beat daily flat rewards** — a streak multiplier (day 7 = 3× reward) drives more daily returns than a flat daily claim. OwO bot demonstrates this clearly with its daily streak system.
4. **Social triggers beat timers** — "Player X just broke through to Kim Đan" in a server announcement channel is more motivating than a personal cooldown reminder. Broadcast major achievements.
5. **Cooldown reminders prevent churn** — EPIC RPG spawned an entire ecosystem of reminder bots because the base bot doesn't DM players. Players who don't know their cooldown is up simply stop playing. Build reminders in natively.
6. **Prestige/season resets retain veterans, not beginners** — veterans love resets because it restores challenge. New players don't feel the "veteran dominance" problem yet. Design resets primarily for veterans. The "what persists" must feel meaningful to a veteran.
7. **Economic participation drives long-term engagement** — players with items in the marketplace check back to see if orders filled. Economy = external engagement driver beyond just progression.

### Anti-Patterns (what causes churn)

| Anti-Pattern | Why It Causes Churn | Mitigation |
|-------------|---------------------|------------|
| **Invisible progress** | If players don't know how much tu vi they've accumulated or need, they disengage. "I don't know what I'm doing" = quit. | Always show current tu vi, needed tu vi for next realm, percentage in profile/check command. |
| **Veteran dominance** | If top-realm players crush new players in PvP or dominate the economy irreversibly, new players quit immediately. | Season resets handle this. PvP should be realm-gated (can only attack ±1 realm). |
| **Surprise resets without warning** | Losing progress unexpectedly = rage quit and negative word-of-mouth. | Announce season end 7 days, 24h, 1h in advance. Post end-of-season hall of fame. |
| **Opaque marketplace** | If players can't see current prices, they won't trade. | Market price feed command. Show recent transaction history. |
| **Overly grindy active play requirement** | EPIC RPG's weakness: optimal play requires checking every few minutes. Discourages casual players. | TuTien's passive accumulation is the solution. Design so casual players feel meaningful progress. |
| **Spam farming detection that feels arbitrary** | If players get rate-limited unexpectedly with no explanation, they feel punished for normal behavior. | Clear messaging: "Tu vi đang hồi phục... (30s còn lại)" with thematic language. Never a cold "rate limited" error. |

---

## MVP Feature Recommendation

### Phase 1: Foundation (must ship together)
1. Registration + character creation (spiritual root, name)
2. Passive tu vi accumulation (chat + voice + reaction) with anti-farming
3. Cảnh giới progression (Luyện Khí → Trúc Cơ → Kim Đan → Nguyên Anh initially)
4. Breakthrough mechanic (manual `/đột_phá` with failure chance at major realms)
5. Profile display (`/profile`)
6. Linh thạch balance and daily reward (`/điểm_danh`)
7. i18n infrastructure (vi primary)
8. Help system (`/help`)
9. Cooldown notifications (opt-in DM when passive tu vi is ready to collect)

### Phase 2: Economy
10. Marketplace (listings, instant buy/sell, VWAP)
11. Basic professions (gathering inputs)
12. Crafting (alchemy: 3–5 pill types)

### Phase 3: Combat
13. PvE hunting (yêu thú encounters)
14. PvP dueling (opt-in, realm-gated)
15. Season leaderboard (by tu vi, by cảnh giới)

### Phase 4: Monetization + Season
16. Linh thạch purchase (Stripe integration)
17. Season end mechanics (announcement, reset, persistence logic)
18. Season 2 launch

### Defer to v2
- Guild/sect system
- Web dashboard
- Traditional Chinese (zh-TW) locale
- Multi-player raids / dungeons
- Gacha mechanics
- ELO ranked PvP

---

## Competitive Landscape Summary

| Bot | Servers | Theme | Tu vi Auto-Gain | Global Economy | Seasonal | i18n | Notes |
|-----|---------|-------|----------------|----------------|----------|------|-------|
| **DaoVerse** | ~238 | Xianxia EN | ❌ (active commands) | ❌ (per-server) | ❌ | EN only | Closest competitor. Lacks passive accumulation and global market. |
| **EPIC RPG** | 3M+ | Generic fantasy | ❌ (cooldown commands) | ❌ (per-server) | ✅ (time travel/prestige) | EN/ES/PT | Largest RPG bot. No xianxia theme. Cooldown-based, not passive. |
| **Tatsu** | Large | Anime/general | ✅ (chat XP) | ❌ (per-server) | ❌ | Limited | Has chat XP but no cultivation theme, no global market. |
| **Dank Memer** | 9M+ | Meme/economy | ❌ | ❌ (per-server) | ❌ | Limited | Different genre. Economy driven but no RPG depth. |
| **OwO Bot** | 4M+ | Anime/animals | ❌ | ❌ | ❌ | Limited | No RPG progression beyond collecting. |
| **TuTien Bot** | 0 (new) | Vietnamese xianxia | ✅ **core mechanic** | ✅ **VWAP** | ✅ **hard** | **vi/zh-CN/en** | Unique position in underserved market. |

**TuTien Bot's gap in the market:** No existing cultivation bot combines (1) passive activity-driven progression, (2) global VWAP marketplace, (3) Vietnamese-first i18n, and (4) hard seasonal resets. This is a genuinely differentiated product.

---

## Sources

- DaoVerse official site: https://cultivationbot.com/ [HIGH confidence — official source]
- top.gg cultivation tag: https://top.gg/tag/cultivation [HIGH confidence — live ecosystem data]
- top.gg xianxia tag: https://top.gg/tag/xianxia [HIGH confidence]
- EPIC RPG top.gg listing: https://top.gg/bot/555955826880413256 [HIGH confidence]
- Growmate.gg idle Discord games analysis: https://www.growmate.gg/blog/best-free-idle-discord-games [MEDIUM confidence]
- CommunityOne bot comparison 2025: https://blog.communityone.io/top-level-bots-discord-2025/ [MEDIUM confidence]
- Hwang, D. (2025). "Player Engagement with Idle Games." UC Santa Cruz thesis. [HIGH confidence — academic peer-reviewed]
- UnbelievaBoat official site: https://unbelievaboat.com/ [HIGH confidence]
- Cultivation realms reference: https://cultivationgames.com/wiki/the-complete-guide-to-cultivation-realms [MEDIUM confidence — genre reference]
- Game economy design (sink mechanisms): https://medium.com/@msahinn21/designing-game-economies-inflation-resource-management-and-balance [MEDIUM confidence]
