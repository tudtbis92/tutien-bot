---
status: diagnosed
trigger: "Pagination buttons missing from /recipes command"
created: 2026-04-14T00:00:00Z
updated: 2026-04-14T00:00:00Z
symptoms_prefilled: true
goal: find_root_cause_only
---

## Current Focus

hypothesis: recipes.ts never attaches an ActionRow with pagination buttons to the reply — and no button handler exists in interactionCreate.ts for recipe pagination
test: Read recipes.ts execute(), buildRecipesEmbed(), leaderboard.ts (reference pattern), interactionCreate.ts
expecting: Confirmed — no components: [...] in editReply, no ActionRow construction, no button handler
next_action: DONE — root cause confirmed, returning diagnosis

## Symptoms

expected: When more recipes than fit on one page, Previous/Next buttons appear and work
actual: No pagination buttons appear regardless of recipe count
errors: None reported
reproduction: Test 7 in UAT (blocked, confirmed missing from Test 6 observation)
started: Discovered during UAT of phase 02.1

## Eliminated

(none — root cause confirmed on first hypothesis)

## Evidence

- timestamp: 2026-04-14T00:00:00Z
  checked: src/commands/game/recipes.ts — execute() final reply block (lines 194–208)
  found: |
    await interaction.editReply({
      embeds: [buildRecipesEmbed(...)],
    });
    No `components:` key present. Only an embed is sent — no ActionRow, no ButtonBuilder.
  implication: Discord will never render any buttons because none are attached to the message.

- timestamp: 2026-04-14T00:00:00Z
  checked: src/ui/embeds/buildRecipesEmbed.ts — entire file
  found: |
    buildRecipesEmbed() returns only an EmbedBuilder. 
    The function signature is (data: RecipesEmbedData, t: TFunction): EmbedBuilder.
    No ActionRowBuilder, no ButtonBuilder, no components returned whatsoever.
    Pagination info (page, totalPages) IS accepted and rendered in the footer text only.
  implication: The embed builder was never designed to return buttons — it only surfaces page info as footer text.

- timestamp: 2026-04-14T00:00:00Z
  checked: src/commands/game/leaderboard.ts — buildLeaderboardPage() (lines 120–166)
  found: |
    The established pattern is:
    1. A dedicated buildLeaderboardPage() function returns { embed, row }.
    2. ActionRowBuilder<ButtonBuilder> with prev/next buttons is constructed there.
    3. ButtonBuilder customIds encode state: `bxh_prev_{page}_{scope}` / `bxh_next_{page}_{scope}`.
    4. execute() sends both: `await interaction.editReply({ embeds: [embed], components: [row] })`.
  implication: recipes.ts follows the embed-only pattern but NOT the leaderboard's full embed+ActionRow pattern.

- timestamp: 2026-04-14T00:00:00Z
  checked: src/events/interactionCreate.ts — button routing block (lines 14–61)
  found: |
    Only handles `bxh_prev_*` and `bxh_next_*` customIds (leaderboard buttons).
    No handler for any `recipes_*` customId exists.
    Unknown buttons hit the final `return;` no-op at line 60.
  implication: Even if buttons were accidentally added to the recipes message, clicking them would do nothing — there is no handler registered.

- timestamp: 2026-04-14T00:00:00Z
  checked: src/commands/game/recipes.ts — page option (lines 67–77, 93)
  found: |
    A `page` integer option IS declared on the slash command.
    The execute() function does compute `totalPages` and `clampedPage` correctly.
    Pagination LOGIC exists (slicing allRecipes to the correct window) but the NAVIGATION mechanism (buttons) was never implemented.
    Users can only navigate by re-running /recipes with a different `page:` option value — a manual, non-interactive approach.
  implication: The server-side pagination math is correct; only the UI layer (button components + interaction handler) is absent.

## Resolution

root_cause: |
  Two-part gap — the pagination UI layer was simply never implemented for /recipes:
  
  1. recipes.ts execute() sends only an embed, never a `components: [row]` with Previous/Next buttons.
     The ActionRowBuilder + ButtonBuilder construction (present in leaderboard.ts) is absent.
  
  2. interactionCreate.ts has no button handler for recipe pagination customIds. Even if buttons
     were added, clicks would silently no-op.
  
  The data and logic are correct (totalPages is computed, the page slice is applied, page/totalPages
  reach buildRecipesEmbed), but the Discord interactive component layer — ActionRow with disabled-aware
  prev/next buttons and a corresponding button handler — was never wired up.

fix: (not applied — goal: find_root_cause_only)
verification: (not applied)
files_changed: []
