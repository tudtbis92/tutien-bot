# Feature Landscape: Tam Quốc Collection (Milestone v3.0)

**Domain:** Pokemon-style collection / monster-catching mini-game trên Discord bot (sưu tầm hero Tam Quốc, travel map, auto-battle, capture)
**Researched:** 2026-08-10
**Confidence:** MEDIUM (cross-checked: Pokétwo docs/ToS, Bulbapedia + Pokemon Fandom + Pokebattler catch formula, EA FC chemistry guides, GameGrowthAdvisor/Machinations economy, idle-game retention research)

---

## Executive Position

Tam Quốc Collection là một **collection game kiểu Pokemon** chạy trên Discord — không phải gacha roll (Mudae/Karuta), không phải chat-spawn race (Pokétwo). Mô hình tham chiếu gần nhất: **Pokemon GO** (travel + encounter + capture + IV + candy) phủ lên **EA FC chemistry** (team building) và gắn vào **kinh tế Linh thạch chung** của TuTien Bot. Điểm khác biệt lớn nhất so với mọi Discord collection bot hiện có: **encounter sinh ra từ hành động travel có chi phí (Linh thạch sink), không phải từ chat activity** — đây vừa là chống-bot tự nhiên, vừa là sink kinh tế chủ động.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Người chơi đã quen thuộc với thể loại (Pokétwo/PokéMeow/Pokemon GO) sẽ mặc định kỳ vọng các feature sau. Thiếu = cảm giác "game chưa xong".

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Chọn starter miễn phí** | Mọi game Pokemon-style đều bắt đầu bằng chọn starter (Pokétwo `p!pick`, GO chọn 3). Entry-point bắt buộc. | LOW | 3–5 hero starter miễn phí, chỉ số IV random lần đầu. Đây là faucet duy nhất được phép — miễn phí, có chủ đích. |
| **Bản đồ + di chuyển có thời gian thực** | Core loop của game. Travel-time tạo "clock" async — người chơi đặt lộ trình rồi quay lại, không bị ép session dài (idle-game retention research: async clocks giữ chân tốt hơn energy walls). | MEDIUM | Mốc địa danh (nodes), chọn đích → timer thực → arrival. Trả Linh thạch theo khoảng cách. Redis timer + pg-boss nếu cần cross-shard. |
| **Encounter dọc hành trình** | Không thể có collection game nếu không có "wild spawn". Pacing: mỗi chặng travel có ~30–50% chance encounter; cap ~20 encounter/giờ/user để chống farm. | MEDIUM | Roll RNG theo vùng (hero region) + boss thường. Rarity distribution: common ~60% / uncommon ~25% / rare ~10% / epic ~4% / legendary ~1%. |
| **Hiển thị % bắt trước khi catch** | Pokemon hiện sốc % bắt khi ném bóng; Pokétwo/PokéMeow đều có feedback rõ. Nhìn thấy % = hiểu vì sao fail, giảm frustrate. | LOW | Show base chance + HP modifier + item bonus ngay trên embed trước nút bắt. |
| **Capture sau trận với % (rarity + HP + item)** | Công thức catch chuẩn của Pokemon (cross-checked Bulbapedia/Pokebattler): base rate theo rarity × HP factor (HP càng thấp càng dễ — term `3×maxHP − 2×curHP`) × item multiplier (Razz 1.5× / Golden Razz 2.5× analog). | MEDIUM | Dùng đúng mô hình này: hero còn ít HP + xài bùa → % cao hơn. Feedback fail = "hero phá khóa" (shake analog), hero chạy sau N lần fail. |
| **Bộ sưu tập / pokedex theo vùng** | Bản chất game sưu tầm — người chơi cần xem đã bắt được gì, thiếu gì. Động lực quay lại vùng cũ. | MEDIUM | `/tq collection` — emoji hero + tier + IV, filter theo faction/vùng/đã bắt/chưa bắt. |
| **Leveling + duplicate → hồn ngọc** | Pokemon GO: mỗi catch cho species candy, dupe chuyển thành currency nâng cấp. Duplicate = không bao giờ vô dụng. | MEDIUM | Dupe hero → hồn ngọc (candy analog). Giá trị dupe **scale theo tier** — bắt trùng hero đã tiến hóa cho nhiều ngọc hơn (GO: evolved pokemon cho nhiều candy hơn). |
| **Tiến hóa theo level (L20 → t1, L50 → t2)** | Evolution là table stake của Pokemon-style game (Pokétwo evolve, GO candy evolution). | LOW–MED | Level-gate đúng thiết kế đã chốt. Spritesheet 4 bậc đã có sẵn (tiers.json). |
| **Quản lý đội hình (3 chủ lực + 9 slot buff)** | Design đã chốt legion battle. Users expect team management trong collection game (PokéMeow teams, EA FC squads). | MEDIUM | Chemistry tính khi chọn đội hình; hiển thị tổng chemistry + buff đang active. |
| **Item shop (bùa bắt, hồi máu)** | Item hỗ trợ là sink tùy chọn chuẩn — Pokétwo shop (Rare Candy, XP boosters), Pokemon ball/berry. | LOW | Mua bằng Linh thạch. Bùa tăng % bắt (Razz analog), vật hồi máu, vật thoát boss. |
| **i18n VI/EN/ZH-CN** | Đã là constraint của project (zero hardcoded string). | LOW | Hạ tầng i18next có sẵn — chỉ thêm namespace `tamquoc`. |
| **Help / guide commands** | Mọi game bot thành công đều có help tốt; hệ sinh thái reminder bot của EPIC RPG tồn tại vì thiếu hướng dẫn. | LOW | `/tq help` — giải thích travel, encounter, catch %, chemistry. |

### Differentiators (Competitive Advantage)

Điểm khiến Tam Quốc Collection khác biệt so với Pokétwo/PokéMeow/Mudae — đây là nơi cạnh tranh, align với Core Value và lợi thế hạ tầng sẵn có.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Chemistry 9-slot kiểu EA FC** | Không Discord collection bot nào có team-building depth này. 3 chủ lực đánh + 9 slot buff hệ theo faction/role. Thu thập đa faction trở thành động lực sưu tầm (muốn buff mạnh → phải có đủ hero các phe). | MEDIUM | EA FC lessons (cross-checked): **bonus only, 0 chemistry = không phạt**; FC26 bỏ adjacency — link bất kỳ thành viên nào với bất kỳ ai, chỉ cần cùng nation/league/club. Tương ứng: cùng faction / cùng role / không link. Đừng làm adjacency math phức tạp. |
| **Encounter gắn travel có chi phí = sink kinh tế chủ động** | Khác biệt cấu trúc so với Pokétwo (chat activity) và Mudae (roll miễn phí + premium). Mỗi lần travel trả Linh thạch — encounter có giá, capture có giá. Tích hợp chặt với kinh tế TuTien hiện có. | MEDIUM | Xem phần Economy. Đây là lý do tồn tại của game trong hệ sinh thái. |
| **IV 6 chỉ số** | Pokemon GO dùng 3 chỉ số (~4000 tổ hợp) — mỗi catch đã unique. 6 chỉ số (0–31 mỗi cái = ~1 tỷ tổ hợp) làm **mọi hero bắt được là độc nhất**, dupe luôn có giá trị so sánh, chase IV đẹp thành endgame content. | LOW–MED | Lưu JSON `{atk,def,hp,spd,crit,res}` per hero instance. Hiển thị tổng IV% để dễ so sánh. |
| **Star variant + 4-tier sprites (visual prestige)** | Shiny-analog. 132 heroes × 4 tiers × normal/star = 1056 emoji **đã upload sẵn** — asset cost đã trả, đây là bragging right thị giác không bot nào có (hero hiển thị bằng emoji Discord riêng). | LOW | Mapping `{hero_id}_{t0..t3}[_star]` từ `assets/emojis.json` — chỉ cần lookup table. |
| **t3 khóa sau event/item đặc biệt** | Scarcity thiết kế: t1/t2 là con đường chính, t3 là long-term goal gắn event — giữ game fresh sau khi player chạm trần. GO: XL candy gate 40–50 tạo endgame tương tự. | MEDIUM | Cần hệ thống event flag + special item inventory. Defer t3 event thực tế đến v1.x, nhưng **thiết kế schema phải có ngay** từ v1. |
| **Auto-battle có turn history** | Khác Pokétwo (battle abstract), khác GO (real-time). Turn log dạng text share được, spectator-friendly — người xem trong server thấy được trận đấu hay. | MEDIUM | Log lượt: tấn công/defend/buff, damage số. Lưu vòng đời ngắn (Redis) để share lại. |
| **Boss drop = ITEM không phải tiền** | Faucet an toàn: boss rơi item (bùa, vật liệu) chứ không rơi Linh thạch — không bơm currency vào hệ kinh tế chung (xem Economy). | MEDIUM | Boss thường (v1) như encounter hero solo; boss server để phase sau theo design note. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Trading hero giữa người chơi (v1)** | Pokétwo/Mudae đều có trade — users sẽ yêu cầu ngay. | RMT (bán hero lấy tiền thật), botting để farm hero hiếm bán, rò rỉ giá trị ra ngoài game. Trade = kênh faucet không kiểm soát được. | **Defer to v2+**. v1 tập trung capture; nếu cần, chỉ cho "release hero → hoàn lại hồn ngọc" (sink thêm, không tạo kênh trao đổi). |
| **PvP trong v1** | Collection game "phải có đánh nhau với người chơi". | Balance nightmare: 6 IV × chemistry × tier × items — chưa có dữ liệu meta để cân. PvP sớm = meta vỡ, người chơi bỏ. | Defer (design note đã chốt: PvP phase sau). v1 có boss thường + legion battle PvE để test balance. |
| **Server boss race real-time toàn server** | Boss server = sự kiện cộng đồng hấp dẫn. | Race cross-server đầu tiên-được (first-come) → latency/race conditions giữa shards, complexity cao ngay từ đầu. | v1: boss thường (encounter cá nhân). Server boss → phase sau khi hạ tầng shard đã chắc (design note đã chốt). |
| **Mua hero trực tiếp bằng Linh thạch / tiền thật** | "Tôi muốn Lữ Bố ngay". | Giết chết capture loop (mua thì cần gì bắt?), biến game thành pay-to-win, vi phạm tinh thần collection. | Không bao giờ bán hero trực tiếp. Chỉ bán **cơ hội**: item tăng % bắt, vé travel nhanh, item mở vùng. |
| **Energy system cứng (daily cap năng lượng)** | "Cần giới hạn chơi để cân bằng". | Idle-game research: người chơi **phạt** punishing energy walls ("come back in 4 hours"), churn ngay. | Travel-time + chi phí Linh thạch là clock async tự nhiên — không cần energy cap nhân tạo. |
| **Encounter từ chat activity (mô hình Pokétwo)** | "Mọi hoạt động Discord đều có ý nghĩa" (Core Value). | Farmable bằng spam/selfbot — Pokétwo phải cấm auto-catcher + anti-spam vì lý do này. Xung đột với travel loop có chi phí. | Giữ Core Value ở main game (tu vi passive). Tam Quốc encounter chỉ từ travel — hành động có chi phí thật. |
| **Bảo đảm bắt 100% sau N lần fail (pity quá mạnh)** | "Tôi fail 10 lần rồi, cho tôi bắt được đi". | Kill tension — % bắt trở thành trò đùa, item bùa mất giá trị, động lực mua bùa chết. | Chain/streak nhẹ (mỗi lần fail cùng hero vùng đó +1% nhỏ, cap ~10%) — giữ tension, thưởng kiên trì. |
| **Leaderboard toàn cục v1** | "Cần cạnh tranh". | Khuyến khích botting/multi-account để farm collection (Dank Memer/EPIC RPG bài học). | Defer đến khi anti-bot vững. v1 chỉ có pokedex cá nhân + "đã bắt được hero này chưa" (thu thập xã hội nhẹ). |

---

## Feature Dependencies

```
[Chọn starter]
    └──requires──> [Hero instance schema + emoji mapping]

[Travel bản đồ]
    └──requires──> [Bản đồ nodes + giá Linh thạch + Redis timer]
    └──generates──> [Encounter roll]
                       └──requires──> [Rarity table + region-hero mapping]

[Encounter] ──triggers──> [Auto-battle]
                             ├──requires──> [Hero stats + skill (solo 1 hero)]
                             └──requires──> [Chemistry system (legion 3+9)]

[Auto-battle] ──victory──> [Capture]
                             └──requires──> [Catch formula: rarity × HP × item]
                                                └──requires──> [Item shop (bùa bắt)]

[Capture] ──adds──> [Collection/pokedex]
                       └──requires──> [Hero instance lưu DB (IV, level, tier)]

[Collection] ──generates──> [Duplicate → hồn ngọc]
                                └──requires──> [Soul gem system + tier-scaled dupe value]

[Hồn ngọc + Level] ──enables──> [Tiến hóa L20→t1, L50→t2]
                                   └──requires──> [Level system + XP từ battle]

[Tiến hóa] ──extends──> [t3 (khóa)]
                            └──requires──> [Event/special item flag (schema từ v1)]

[Chemistry 3+9] ──requires──> [Sở hữu đa faction heroes] ──drives──> [Collection depth]

[Boss drop item] ──feeds──> [Item inventory] (không chạm users.balance)
```

### Dependency Notes

- **Travel → Encounter → Battle → Capture → Collection → Progression** là chuỗi tuyến tính bắt buộc. Phase 1 của game phải dựng nguyên chuỗi này dưới dạng thin slice (MVP vertical), không dựng từng module rời.
- **[Capture] requires [battle victory]:** quyết định thiết kế — capture chỉ sau chiến thắng (hoặc sau battle kết thúc dù thua, tỉ lệ thấp hơn). Đơn giản nhất v1: chỉ capture sau thắng. Tránh trạng thái "bắt được hero khi thua trận" gây confusion.
- **[Chemistry] requires [sở hữu ≥9 hero đa faction]:** đây chính là động lực sưu tầm vòng 2 — sau khi có đội hình đầu, người chơi bị kéo đi bắt thêm để fill slot buff. Không tách rời được chemistry khỏi collection.
- **[Soul gem] requires [duplicate]:** dupe là nguồn ngọc duy nhất (v1) → cần đảm bảo tỉ lệ gặp lại hero hợp lý (không quá hiếm để không bao giờ dupe, không quá phổ biến để nhàm).
- **[t3] requires [event system]:** khóa t3 nhưng **schema phải có cột tier/tier_locked từ ngày đầu** — thêm sau là migration đau.
- **[Item shop] conflicts với [energy system]:** bùa bắt/ hồi máu là sink tùy chọn; đừng biến chúng thành "energy refill" (xem Anti-Features).

---

## MVP Definition

### Launch With (v1)

Phạm vi v1 theo design note: **core loop + legion battle**. Mọi thứ dưới đây là P1.

- [x] **Chọn starter** — 3–5 hero miễn phí, IV random lần đầu (onboarding của game)
- [ ] **Bản đồ travel** — nodes, chọn đích, timer thực, trả Linh thạch theo khoảng cách (sink bắt buộc)
- [ ] **Encounter roll** — hero theo vùng + boss thường; rarity distribution theo vùng
- [ ] **Auto-battle turn history** — solo (1 hero) + legion (3 chủ lực + 9 slot chemistry)
- [ ] **Capture** — công thức % (rarity × HP × item), hiển thị % trước khi bắt, hero chạy sau N fail
- [ ] **Collection/pokedex** — emoji hero + tier + IV, filter theo vùng/faction/đã bắt
- [ ] **Duplicate → hồn ngọc** — tier-scaled, dùng nâng level
- [ ] **Level + tiến hóa L20→t1, L50→t2** — t3 khóa (schema sẵn, unlock v1.x)
- [ ] **Item shop** — bùa bắt (Razz analog), hồi máu; mua Linh thạch
- [ ] **Boss drop item** — boss thường rơi item (không rơi tiền)
- [ ] **i18n VI/EN/ZH-CN** + `/tq help`

### Add After Validation (v1.x)

- [ ] **t3 event unlock** — trigger: event theo season (tận dụng season system sẵn có của TuTien)
- [ ] **Star variant chase** — bản `_star` emoji đã có sẵn; thêm tỉ lệ star riêng (1/4096 analog nhưng thấp hơn, ~1/512)
- [ ] **Chain/streak catch** — fail cùng vùng tăng nhẹ % (anti-frustration, giữ tension)
- [ ] **Daily quest Tam Quốc** — "đi đến X", "bắt Y hero phe Thục" → thưởng item (không thưởng tiền)
- [ ] **Server boss event** — boss toàn server theo lịch pg-boss, reward item pool

### Future Consideration (v2+)

- [ ] **PvP arena** — cần dữ liệu balance từ v1 legion battle; meta phải đủ chín
- [ ] **Trading hero (gated)** — sau khi anti-bot + kinh tế vững; trade fee burn để không thành kênh faucet
- [ ] **Leaderboard / achievements** — sau khi anti-bot solid
- [ ] **Guild/legion war** — phụ thuộc hệ guild (đang out of scope main game v2)

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Starter choice | HIGH (entry) | LOW | P1 |
| Map travel + Linh thạch cost | HIGH (core loop + sink) | MEDIUM | P1 |
| Encounter roll | HIGH (core loop) | MEDIUM | P1 |
| Auto-battle turn history (solo) | HIGH (core loop) | MEDIUM | P1 |
| Legion battle 3+9 chemistry | HIGH (differentiator) | MEDIUM | P1 |
| Capture formula + % display | HIGH (satisfaction) | MEDIUM | P1 |
| Collection/pokedex | HIGH (collection identity) | MEDIUM | P1 |
| Duplicate → hồn ngọc | HIGH (retention) | MEDIUM | P1 |
| Evolution L20/L50 + t3 lock | HIGH (progression goal) | LOW–MED | P1 |
| Item shop (bùa bắt, heal) | MEDIUM (sink tùy chọn) | LOW | P1 |
| Boss drop item | MEDIUM (faucet an toàn) | MEDIUM | P1 |
| i18n + help | HIGH (platform constraint) | LOW | P1 |
| t3 event unlock | MEDIUM (endgame) | MEDIUM | P2 |
| Star variant | MEDIUM (prestige) | LOW–MED | P2 |
| Chain/streak catch | MEDIUM (anti-frustration) | LOW | P2 |
| Daily quest | MEDIUM (retention) | MEDIUM | P2 |
| Server boss | HIGH (community) | HIGH | P2 (phase sau) |
| PvP | HIGH (long-term) | HIGH | P3 |
| Trading | MEDIUM (economy risk) | HIGH | P3 |

**Priority key:**
- P1: Bắt buộc cho v1 — MVP vertical slice của core loop
- P2: Sau khi core loop hoạt động và có dữ liệu người chơi
- P3: Cần hạ tầng chín + dữ liệu balance

---

## Competitor Feature Analysis

| Feature | Pokétwo | Pokemon GO | Mudae/Karuta | Tam Quốc Collection (our approach) |
|---------|---------|------------|--------------|--------------------------------------|
| Encounter source | Chat activity (1 spawn / ~24 msgs) | Real-world GPS travel | Roll command (gacha) | **Travel map trả Linh thạch** — có chi phí, chống bot tự nhiên |
| Capture | Gõ tên nhanh nhất (race) | Ném bóng + berry/curve/medal | N/A (roll thẳng vào collection) | **% sau trận (rarity × HP × item)** — skill qua battle, không race |
| Rarity chase | Shiny 1/4096, redeem (Patreon) | Shiny, raid legendaries | Hiếm cards, wishlist | Star variant + t3 event lock — no paywall cho rarity |
| Progression | Level bằng XP từ chat, evolve bằng candy từ dupe | Candy per catch, IV 3 stats, XL candy gate 40–50 | Level by "companionship" (thời gian) | **Hồn ngọc từ dupe (tier-scaled), IV 6 stats, L20→t1 L50→t2** |
| Team building | Battle đơn giản | Type matchup | N/A | **Chemistry 9-slot EA FC style (3 chủ lực + 9 buff)** — depth độc nhất |
| Economy | Pokécoins premium + market (trade người chơi) | PokéCoins real-money | Kakera premium | **Linh thạch chung với TuTien** — sink qua travel, faucet chỉ item |
| Anti-bot | Anti-spam, cấm selfbot/auto-catcher, ToS ban | Spoofing detection | Rate limit rolls | Travel-time + cooldown Redis + encounter cap — không có "free tap" |
| Monetization | Premium: XP boosters, shiny charm, redeems | PokéCoins items, boxes | Patreon: +rolls, wishlist | Đã có sẵn monetization TuTien (nạp Linh thạch) — game con không cần model riêng |

---

## Economy Notes (Sink/Faucet cho Tam Quốc)

Áp dụng research economy (taps/sinks, GameGrowthAdvisor + Machinations + Yodo1 4S):

- **Sink bắt buộc:** travel cost — mỗi chuyến đi trả Linh thạch theo khoảng cách. Đây là sink chính, phải đủ "đau" để có ý nghĩa nhưng không chặn người chơi mới (pinch point: scarce enough to matter, abundant enough to keep active).
- **Sink tùy chọn:** item shop (bùa bắt, hồi máu) — chi tiêu gia tăng khi gặp hero hiếm (escalating investment cho rare target, giống GO dùng Golden Razz + Ultra Ball cho legendary).
- **Faucet chỉ có 2, đều nhỏ và có chủ đích:** (1) starter miễn phí (1 lần), (2) boss drop = **ITEM không phải Linh thạch** — không bơm currency.
- **KHÔNG có** reward tiền từ battle, không có "sell hero lấy Linh thạch" (v1), không có daily cash reward riêng của game con.
- **Vì sao quan trọng:** `users.balance` là chung. Main game đã có faucet (tu vi season, football betting win, farming service). Tam Quốc **phải net-sink hoặc trung tính** — nếu không, nó bơm thêm currency vào hệ kinh tế chung và làm mất giá Linh thạch trên marketplace toàn cục.
- **Scarcity:** travel-time là clock async (không phải energy wall) — người chơi không bị phạt vì nghỉ 2 ngày, nhưng vẫn có nhịp quay lại (idle-game retention).

---

## Anti-Botting / Farming Notes (v1)

- Encounter chỉ từ **travel action có chi phí** — không có "free tap" để bot khai thác (khác chat-activity spawn của Pokétwo vốn bị auto-catcher lạm dụng).
- **Cooldown Redis per user action:** travel bắt đầu, capture attempt, item use — cap ~20 encounter/giờ/user.
- **Velocity detection:** phát hiện pattern tự động (cùng thời điểm mỗi ngày, cùng chuỗi action) → log + audit flag; không ban tự động v1.
- Tận dụng hạ tầng đã có: Redis cooldown pattern (đã dùng cho tu vi), `SELECT FOR UPDATE` cho mọi giao dịch chạm `users.balance` (pattern football betting đã validate).
- Discord rate limit (50 req/s global) là trần nền tảng — thiết kế giao diện bằng **embeds + components** (1 message per action), không spam messages.

---

## Sources

- Pokétwo official site + docs (poketwo.net, docs.poketwo.net — spawning/catching, evolutions, ToS anti-bot) — MEDIUM (verified cross-source)
- Zelda.zone Pokétwo guide (commands, spawn rates, shiny odds) — MEDIUM
- Bulbapedia + Pokemon Fandom + Pokebattler catch rate formula (base rate, HP term, berry/ball multipliers) — MEDIUM (cross-checked 3 sources)
- Pokemon GO Help Center (candy, evolution) + XL candy analysis — MEDIUM
- EA FC 25/26 chemistry guides (FootballGPT, TeamGullit, OperationSports, Red Bull) — MEDIUM (cross-checked)
- GameGrowthAdvisor game economy design (taps/sinks, inflation control) — MEDIUM
- Machinations.io economy design + Yodo1 4S framework (sources/sinks/scarcity/stability) — MEDIUM
- GameAnalytics idle game retention + Apptrove idle pacing + mobilegamereport (energy walls vs async clocks) — MEDIUM
- discordbotlist.com / top.gg Pokemon bots landscape (Pokétwo, PokéMeow, PokéHunt, Mewbot, Pokéverse) — MEDIUM
- **Project internal:** `.planning/notes/sanguo-game-design.md` (design decisions), `.planning/PROJECT.md` (constraints, economy), existing STACK.md (infra) — HIGH

---

*Feature research for: Tam Quốc Collection (Milestone v3.0)*
*Researched: 2026-08-10*
