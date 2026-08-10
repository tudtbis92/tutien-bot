---
title: Resume Milestone v3.0 new-milestone workflow (research step)
date: 2026-08-10
context: New-milestone workflow interrupted at Step 8 (research) — needs opencode restart
---

# Resume: Milestone v3.0 — Research Step

## Vị trí dừng

Workflow `/gsd-new-milestone` cho **v3.0 Tam Quốc Collection** đã hoàn thành:
- ✅ Milestone switch sang v3.0 (STATE.md) — commit `daa1b4c`
- ✅ Phase archive v2.0 → `.planning/milestones/v2.0-phases/` — commit `a1c613f`
- ✅ PROJECT.md cập nhật Current Milestone v3.0 — commit `daa1b4c`
- ✅ Xác nhận milestone summary + tên milestone
- ✅ Quyết định: Research trước (4 researchers)

**Bị chặn ở:** Step 8 Research — subagent GSD spawn lỗi model.

## Nguyên nhân & đã sửa

- GSD agent files hardcode `model: anthropic/claude-sonnet-5` — không tồn tại trên runtime này (`opencode-go/deepseek-v4-flash`)
- **Đã sửa:** xóa dòng `model:` khỏi tất cả `C:\Users\901107\.config\opencode\agents\gsd-*.md` (30 files) — theo `model_profile: inherit`
- **Cần restart opencode** để nạp config mới — config không hot-reload

## Resume lại từ đâu

Sau restart, tiếp tục từ **Step 8 (Research)** của new-milestone:

1. Spawn 4 `gsd-project-researcher` (Stack, Features, Architecture, Pitfalls) — ghi vào `.planning/research/`
2. Spawn `gsd-research-synthesizer` → `.planning/research/SUMMARY.md`
3. Step 9: Define requirements (REQ-ID `TQC-*` hoặc theo category) → commit
4. Step 10: Spawn `gsd-roadmapper` → ROADMAP.md → approve → commit
5. Step 10.5: link pending todos (không có seeds/todos hiện tại)
6. Done: dẫn sang `/gsd-discuss-phase [N]`

## Context thiết kế

Xem `.planning/notes/sanguo-game-design.md` — đầy đủ quyết định thiết kế đã thống nhất.

Lưu ý: phase numbering tiếp tục từ milestone trước (Phase 8 trở đi, vì v2.0 kết thúc ở Phase 07).
