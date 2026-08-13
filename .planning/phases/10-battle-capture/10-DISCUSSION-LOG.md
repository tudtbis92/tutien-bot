# Phase 10: Battle & Capture - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-13
**Phase:** 10-battle-capture
**Areas discussed:** Battle entry & stats, Battle engine & replay, Capture fee + rarity + pity, Starter & collection UX, Spar/practice chi tiết, Retreat/abandon encounter, Capture UI flow, XP/leveling

---

## Battle Entry & Stats

| Option | Description | Selected |
|--------|-------------|----------|
| Chỉ từ encounter | Nút ack thay bằng nút 'Chiến đấu'; /sanguo battle mở battle cho pending encounter. Không sinh thêm encounter. | |
| Thêm spar/practice | /sanguo battle luyện tập miễn phí đánh hero hoang tưởng tượng — không capture, không phí. | ✓ |
| Wild battle trả phí | /sanguo battle gọi 1 hero hoang dã ngay lập tức (trả phí) — cần cơ chế không vượt cap. | |

**User's choice:** Thêm spar/practice
**Notes:** Player-initiated /sanguo battle = free spar only; encounter-initiated battle comes from the pending encounter (replaces the Phase 9 ack button).

| Option | Description | Selected |
|--------|-------------|----------|
| Base trong heroes | Thêm 6 cột base STR/AGI/INT/MOV/LEA/CHA vào heroes + seed research. | ✓ |
| Derive từ class/role | Base sinh deterministic từ class/role/faction qua template. | |
| Derive + roll IV hoang dã | Base = template class, hero hoang dã roll 6 IV tạm lúc encounter. | |

**User's choice:** Base trong heroes
**Notes:** User asked to confirm base stat ≠ IV stat (species stat vs individual variance). Clarified: `combatStat = base + IV`. Base stats are per-species, IV varies per captured instance.

| Option | Description | Selected |
|--------|-------------|----------|
| Base + IV roll mỗi encounter | Mỗi encounter roll 6 IV (0-31) rồi lưu seed/IV vào battle record. | ✓ |
| Base cố định không IV | Hero hoang dã dùng đúng base stats. | |
| IV theo class cố định | IV hoang dã cố định theo class. | |

**User's choice:** Base + IV roll mỗi encounter
**Notes:** Wild hero IV stored in battle record → replayable + variable difficulty.

| Option | Description | Selected |
|--------|-------------|----------|
| Flee + full heal | Thua → encounter bỏ chạy, hero hồi full HP sau mỗi trận. | |
| Retry thoải mái | Thua → encounter vẫn còn đó, đánh lại tới khi thắng. | |
| HP persist | HP hero PERSIST giữa các trận — cần chiến thuật. | ✓ |

**User's choice:** HP persist
**Notes:** Consequence (user): player can switch to another owned hero, or heal via items (Phase 11). If not, they cannot continue encountering (accepted soft-lock). Active hero fainted → battle blocked with switch prompt.

**Follow-up — HP recovery:**
| Option | Description | Selected |
|--------|-------------|----------|
| Hồi theo thời gian/đến node | HP hồi dần theo thời gian thực. | |
| Thắng hồi % + hồi thời gian | Thắng trận hồi 1 phần HP. | |
| Daily reset / item | HP hồi full mỗi ngày hoặc qua item (Phase 11). | |

**User's choice (freeform):** "người chơi có thể đổi Hero khác đang có, hoặc hồi máu bằng item (Phase 11). Nếu không thì sẽ không thể encounter tiếp."

**HP/MP model (follow-up):**
| Option | Description | Selected |
|--------|-------------|----------|
| Base HP + MP riêng | Thêm HP + MP vào base stats (cột riêng trong heroes, không phải IV). | ✓ |
| Chỉ base HP, no MP | MP bỏ hẳn — auto-battle chỉ tấn công thường. | |
| HP derived từ STR | HP = STR×10, không thêm cột. | |

**User's choice:** Base HP + MP riêng

**Skills (follow-up):**
**User's choice (freeform):** "phase 11 mới có skill sao?... mỗi hero sẽ có 2 slot skill, slot skill đánh thường và slot skill đòn special. Đánh thường sẽ tăng MP, đánh special sẽ tiêu tốn MP." → skills deferred to Phase 11; MP stored but unused in Phase 10.

**Boss capture (follow-up):**
| Option | Description | Selected |
|--------|-------------|----------|
| Capture được | Boss battle xong cũng capture như hero thường (tỉ lệ thấp theo rarity). | ✓ |
| Không capture | Boss chỉ battle thử sức, drop items Phase 11. | |
| Capture nhưng hiếm + đắt | Tỉ lệ rất thấp + phí cao hơn. | |

**User's choice:** Capture được

---

## Battle Engine & Replay

| Option | Description | Selected |
|--------|-------------|----------|
| atk-def, min 1 | Damage = max(atk - def, 1), hit theo AGI, MOV thứ tự. | |
| Roll % damage | (atk - def) × rng(0.8-1.2). | |
| atk-def + crit | atk-def kèm crit nhân đôi damage. | ✓ |

**User's choice:** atk-def + crit

| Option | Description | Selected |
|--------|-------------|----------|
| Seed + input, recompute | Lưu seed + input, roundLogs tính khi battle, replay = chạy lại engine. | ✓ |
| Chỉ lưu transcript | Chỉ lưu roundLogs đã tính sẵn. | |
| Cả seed + transcript | Lưu cả hai — dư thừa. | |

**User's choice:** Seed + input, recompute

| Option | Description | Selected |
|--------|-------------|----------|
| Full log 1 embed | Toàn bộ round log trong 1 embed, cap round. | ✓ |
| Step-by-step buttons | Nút 'Xem tiếp' từng bước. | |
| Summary + detail toggle | Tóm tắt trước, nút mở chi tiết. | |

**User's choice:** Full log 1 embed

| Option | Description | Selected |
|--------|-------------|----------|
| Sudden death by HP% | So HP% còn lại — cao hơn thắng. | |
| Draw, encounter flees | Trận hòa, encounter bỏ chạy. | |

**User's choice (freeform):** "so tổng sát thương gây ra rồi mới so HP%" → winner = higher total damage dealt; tie → higher HP%.

**Formula gaps (follow-up, user wanted all locked):**
- **Attack type:** theo class (STR: vanguard/cavalry/archer; INT: spellcaster/schemer; MAX: vu_co/thu_binh/cong_binh)
- **hitChance + crit:** để agent quyết con số (giữ nguyên tắc AGI ↑ hit/crit, defAGI ↓)
- **IV + HP:** HP = base chỉ, IV không cộng HP
- **MOV tie-break:** so AGI, vẫn bằng → attacker trước

---

## Capture Fee + Rarity + Pity

| Option | Description | Selected |
|--------|-------------|----------|
| Cột rarity trong heroes | Thêm cột rarity (1-5) + seed research. | ✓ |
| Derive từ zone rate | Rarity derived từ hero_zone_rates. | |
| Theo class | Rarity theo class. | |

**User's choice:** Cột rarity trong heroes

| Option | Description | Selected |
|--------|-------------|----------|
| 1 cơ hội, fail = flee | Fail → hero bỏ chạy, 1 cơ hội/encounter. | |
| Retry được, phí mỗi lần | Fail → retry với phí, tỉ lệ tăng qua pity. | |
| 1 retry miễn phí | Fail → retry miễn phí 1 lần. | |

**User's choice (freeform):** "có thể retry, nhưng sau mỗi lần fail lại random để xác định flee, tỷ lệ này cũng phụ thuộc rarity, rarity càng hiếm thì tỷ lệ flee càng cao"

| Option | Description | Selected |
|--------|-------------|----------|
| Theo rarity | Phí theo rarity — sink chính, researcher định giá khi re-sign. | |
| Flat per attempt | Flat phí mỗi lần bắt. | |
| Theo vùng | Flat theo vùng. | |

**User's choice (freeform):** "có 5 tier capture fee, mỗi tier sẽ tăng tỷ lệ bắt khác nhau"

**Tier select (follow-up):**
| Option | Description | Selected |
|--------|-------------|----------|
| Chọn tier tại capture | 3 button tier đầu, trả phí ngay. | |
| Auto theo rarity | Tier auto theo rarity. | |
| Tier = item (Phase 11) | Tier dùng như item phải sở hữu. | |

**User's choice (freeform):** "tại UI capture thêm 3 button tương ứng với 3 tier đầu, 2 tier sau chỉ hiển thị khi có item đặc biệt (nhận được trong sự kiện, hoặc mua với ở shop)"

| Option | Description | Selected |
|--------|-------------|----------|
| Per-encounter | Mỗi fail +X% cho lần sau trên cùng con; flee thì reset. | ✓ |
| Per-rarity global | Tích lũy toàn game theo rarity. | |
| Global | Toàn cục cho mọi capture. | |

**User's choice:** Per-encounter

---

## Starter & Collection UX

| Option | Description | Selected |
|--------|-------------|----------|
| /sanguo start | Subcommand mới, lần đầu mở select starter. | |
| Trong /sanguo heroes | Collection rỗng → hiển thị UI chọn starter. | ✓ |
| Nhét vào /start | Bước trong /start chính của game tu tiên. | |

**User's choice:** Trong /sanguo heroes

| Option | Description | Selected |
|--------|-------------|----------|
| 4 hero 4 hệ | 4 hero đại diện 4 hệ, researcher chốt. | |
| Bạn chọn cụ thể | 3 hero cụ thể do user chỉ định. | |
| Mọi rarity 1 | Bất kỳ rarity 1. | |

**User's choice (freeform):** "3 hero: Tào Tháo, Lưu Bị, Tôn Kiên + 1 option ẩn, nếu gọi lệnh heroes 3 lần mà không chọn starter hiện ra, thì lần gọi lệnh thứ 4 sẽ ra 3 starter khác là: Trương Giác, Viên Thiệu, Đổng Trác"

**Hidden option (follow-up):**
| Option | Description | Selected |
|--------|-------------|----------|
| Random rarity-1 ẩn | Option ẩn = random rarity-1. | |
| Hero đặc biệt ẩn | Hero chỉ nhận qua option ẩn. | |
| Nút ?? phải bấm mới thấy | Nút ẩn không preview. | |

**User's choice (freeform):** "option ẩn là lần gọi lệnh thứ 4 đó" → the "hidden option" IS set 2 (Trương Giác/Viên Thiệu/Đổng Trác) shown from the 4th call; no 4th option in set 1.

| Option | Description | Selected |
|--------|-------------|----------|
| Owned-only theo zone | Mỗi hero 1 dòng, group theo zone bắt. | |
| Pokedex seen+caught | Mờ hero chưa bắt. | |
| Owned + filter zone | Owned-only + filter theo zone (select). | ✓ |

**User's choice:** Owned + filter zone

| Option | Description | Selected |
|--------|-------------|----------|
| Trong collection | Nút 'Chọn làm hero đồng hành' trong /sanguo heroes. | |
| Subcommand /sanguo hero riêng | Tách chi tiết hero, mở rộng Phase 11. | ✓ |
| Trong travel | Chọn hero đồng hành lúc bắt đầu hành trình. | |

**User's choice:** Subcommand /sanguo hero riêng

**Fainted active hero (follow-up):**
| Option | Description | Selected |
|--------|-------------|----------|
| Chặn battle, nhắc đổi hero | Encounter vẫn xuất hiện nhưng battle bị chặn. | ✓ |
| Bỏ qua encounter khi gục | Không roll encounter nữa. | |
| Auto-thua | Đánh được nhưng auto-thua. | |

**User's choice:** Chặn battle, nhắc đổi hero

---

## Spar/Practice chi tiết

| Option | Description | Selected |
|--------|-------------|----------|
| Random hero thật | Random 1 hero từ roster (base + IV) — luyện đúng diễn biến thật. | ✓ |
| Dummy scale theo player | Con bù nhìn stats theo level. | |
| Đấu vs hero của mình | Người chơi chọn hero sở hữu để đấu thử. | |

**User's choice:** Random hero thật

| Option | Description | Selected |
|--------|-------------|----------|
| Không mất HP | Spar là trận ảo, không rủi ro. | ✓ |
| Mất HP thật | Spar mất HP như battle thường. | |

**User's choice:** Không mất HP

| Option | Description | Selected |
|--------|-------------|----------|
| Không thưởng | Spar thuần test, không XP/item/linh thạch. | ✓ |
| Thưởng nhỏ | Thắng spar nhận 1 chút gì đó. | |

**User's choice:** Không thưởng

| Option | Description | Selected |
|--------|-------------|----------|
| Chặn, nhắc đổi hero | Spar bị chặn như encounter khi active hero gục. | ✓ |
| Không chặn | Spar vẫn được vì không mất HP. | |

**User's choice:** Chặn, nhắc đổi hero

---

## Retreat/Abandon encounter

| Option | Description | Selected |
|--------|-------------|----------|
| Rút lui được | Nút 'Bỏ qua/Rút lui' trên encounter embed, travel tiếp tục. | ✓ |
| Bắt buộc đánh | Gặp encounter là phải đánh. | |
| Timeout tự hết | Encounter tự hết sau thời gian timeout. | |

**User's choice:** Rút lui được
**Notes:** Retreat resolves the pending encounter + releases travel pause. Cap unchanged (cap counts roll hits, not resolutions).

---

## Capture UI flow

| Option | Description | Selected |
|--------|-------------|----------|
| 2 bước: battle → capture view | Battle result + nút 'Bắt' → capture view (%, 3 nút tier, bỏ qua). | ✓ |
| Tier ngay trên result | 3 nút tier có sẵn trên battle result. | |

**User's choice:** 2 bước: battle → capture view
**Notes:** Player walking away mid-capture → pending encounter re-fetched on next `/sanguo travel` (existing F2 pattern).

---

## XP/leveling

| Option | Description | Selected |
|--------|-------------|----------|
| Chưa có XP | Phase 10 hero luôn level 1. | ✓ |
| XP cơ bản | Thắng battle +XP, level tăng nhẹ stats. | |
| Level ngẫu nhiên lúc capture | Level khác nhau theo rarity/vùng. | |

**User's choice (freeform question first):** "Level có ảnh hưởng đến stat của hero không? hay level chỉ dùng để làm mốc để evolution? và khi evolution thì stat của hero có bị ảnh hưởng không?"
**Agent answer:** Phase 10 no XP/level (static level 1). Level-as-evolution-milestone (L20→t1 / L50→t2) + whether level scales stats + evolution stat model are Phase 11 decisions (Pokémon Go-style: level ↑ stats, evolution boosts base stats — proposed default, deferred).

**Final:** Xác nhận: chưa có XP

---

## the agent's Discretion

- Exact hitChance / crit formulas and numeric values (principle locked: AGI ↑ hit/crit, defender AGI ↓).
- Exact round cap number (~20) and battle embed layout / customId naming.
- Capture fee tier values + capture multipliers (researcher prices for the D-18 re-sign).
- Flee rate values per rarity; pity increment value; IV roll distribution (uniform 0-31 default).
- Base-stats + rarity per hero (research content); starter roster confirmation (names locked).
- Where current HP + active-companion state are stored.
- `sanguo_battles` schema extension (seed + input columns).

## Deferred Ideas

- **Skill 2-slot system** (Phase 11): "mỗi hero sẽ có 2 slot skill, slot skill đánh thường và slot skill đòn special. Đánh thường sẽ tăng MP, đánh special sẽ tiêu tốn MP."
- **XP/leveling + evolution stat model** — Phase 11 (Pokémon Go-style default proposed).
- **Capture tiers 4-5 special items** — events / Phase 11 shop; engine models all 5 tiers now.
- **Healing items** — Phase 11 shop (TQC-16).
- **LEA/CHA buff/debuff combat** — Phase 11 chemistry.
- **Boss drops (items, never money)** — Phase 11.
- **Legion / multi-hero team** — Phase 11.
