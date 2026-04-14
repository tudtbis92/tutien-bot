---
status: diagnosed
trigger: "Investigate why /recipes ignores profession level filter"
created: 2026-04-14T00:00:00Z
updated: 2026-04-14T00:00:00Z
---

## Current Focus

hypothesis: The DB query fetches ALL recipes without filtering by min_profession_level, and charProfLevel is only used for UI status icons (✅/🔒) — not to exclude recipes.
test: Traced full code path from DB query → embed rendering
expecting: No WHERE clause on min_profession_level in the query; charProfLevel conditional only drives icon rendering.
next_action: DIAGNOSED — root cause confirmed

## Symptoms

expected: Character with profession level 0 sees 0 recipes (or 'no recipes unlocked' message)
actual: Character with profession level 0 sees ALL recipes regardless of min_profession_level
errors: None reported
reproduction: Test 6 and Test 8 in UAT
started: Discovered during UAT of phase 02.1

## Eliminated

- hypothesis: Bug is in getProfessionLevel() returning wrong value for level 0
  evidence: getProfessionLevel() correctly returns 0 for missing/null JSONB keys via ProfessionPointsSchema.safeParse with .default(0). Function works correctly.
  timestamp: 2026-04-14T00:00:00Z

- hypothesis: charProfLevel is undefined even when professionFilter is set
  evidence: Line 177-179 of recipes.ts correctly computes charProfLevel = getProfessionLevel(char.professionPoints, professionFilter) when professionFilter is non-null. Value is passed correctly to buildRecipesEmbed.
  timestamp: 2026-04-14T00:00:00Z

- hypothesis: buildRecipesEmbed comparison is wrong (off-by-one)
  evidence: Line 73: `data.characterProfLevel >= recipe.minProfessionLevel` — comparison is correct for show/hide logic. Level 0 >= minLevel 1 is false → shows 🔒 icon. Logic is sound IF filtering is applied.
  timestamp: 2026-04-14T00:00:00Z

## Evidence

- timestamp: 2026-04-14T00:00:00Z
  checked: recipes.ts lines 96-105 — the DB query
  found: |
    const allRecipes = await db
      .select({ ... })
      .from(recipes)
      .where(professionFilter ? eq(recipes.professionType, professionFilter) : undefined)
      .orderBy(asc(recipes.professionType), asc(recipes.minProfessionLevel));
    
    The WHERE clause ONLY filters by professionType (if provided).
    There is NO filter on minProfessionLevel at all.
    Result: all recipes for the profession (or all professions) are returned regardless of char level.
  implication: Core bug — missing WHERE clause on min_profession_level.

- timestamp: 2026-04-14T00:00:00Z
  checked: recipes.ts lines 107-112 — the early-exit "empty" check
  found: |
    if (allRecipes.length === 0) {
      await interaction.editReply({ embeds: [buildErrorEmbed(t('game:recipes.empty'), shardId)] });
      return;
    }
    This check only triggers if the DB returns zero rows (e.g., no recipes exist for the profession at all).
    It does NOT check whether any recipe is accessible at the character's current level.
    A level-0 character sees ALL recipes because allRecipes is populated.
  implication: "No recipes unlocked" path does NOT exist for the level-filtered case.

- timestamp: 2026-04-14T00:00:00Z
  checked: recipes.ts lines 177-179 — charProfLevel calculation
  found: |
    const charProfLevel = professionFilter
      ? getProfessionLevel(char.professionPoints, professionFilter)
      : undefined;
    charProfLevel is ONLY computed when professionFilter is non-null.
    When no profession is selected (the default view), charProfLevel = undefined for EVERY recipe.
    This means the status icon is always '' (empty string) in the all-professions view.
  implication: Even the visual lock icon is suppressed when browsing all professions — zero filtering feedback at all in the default view.

- timestamp: 2026-04-14T00:00:00Z
  checked: buildRecipesEmbed.ts lines 72-75 — canCraft / status icon logic
  found: |
    const canCraft = data.characterProfLevel !== undefined
      ? data.characterProfLevel >= recipe.minProfessionLevel
      : undefined;
    const statusIcon = canCraft === true ? '✅' : canCraft === false ? '🔒' : '';
    The embed shows ✅/🔒 icons ONLY when characterProfLevel is defined (i.e., only when profession filter is active).
    Even with the icon shown, NO recipes are hidden — all are always rendered. The icon is purely decorative.
  implication: The embed has no mechanism to hide locked recipes; it can only annotate them. Hiding must happen before or during the DB query.

- timestamp: 2026-04-14T00:00:00Z
  checked: recipes.ts line 104 — where clause construction
  found: |
    .where(professionFilter ? eq(recipes.professionType, professionFilter) : undefined)
    When professionFilter is null, this passes `undefined` to .where() which Drizzle ORM
    treats as "no condition" — fetching all rows. This is intentional for the all-professions view,
    but the min_profession_level condition is missing entirely from BOTH branches.
  implication: The fix must add a `lte(recipes.minProfessionLevel, charProfLevel)` condition alongside the existing professionType condition.

- timestamp: 2026-04-14T00:00:00Z
  checked: recipes.ts line 177 — charProfLevel undefined when no profession filter
  found: |
    In the all-professions view, charProfLevel is undefined.
    If we add a DB filter using charProfLevel, we need to handle the multi-profession case.
    The character has DIFFERENT levels per profession — e.g., luyen_dan=3, phu_su=0.
    A single charProfLevel cannot represent the threshold for all 10 professions simultaneously.
    The correct behavior for the all-professions view is to show recipes where
    char's level in THAT recipe's profession >= recipe's minProfessionLevel.
  implication: The all-professions filter requires per-profession level lookup, which cannot be
    done as a simple SQL WHERE clause without passing all 10 profession levels to the query.
    Options: (a) filter in application code after fetching all recipes, or
    (b) fetch character's full profession_points JSONB and filter in JS before paginating.

- timestamp: 2026-04-14T00:00:00Z
  checked: recipes.ts line 83 — char object from fetchCommandContext
  found: |
    const { t, char, shardId } = await fetchCommandContext(interaction);
    char includes char.professionPoints (the full JSONB). This is available for all-professions filtering.
    Application-side filtering is feasible and appropriate here — recipe count is small enough
    that fetching all and filtering in JS is acceptable.
  implication: Fix can use char.professionPoints to filter allRecipes in JS after the DB fetch.

## Resolution

root_cause: |
  The DB query in recipes.ts has NO WHERE clause filtering by min_profession_level.
  The code fetches ALL recipes (optionally filtered by profession type only), then passes
  every recipe to the embed builder regardless of whether the character meets the level requirement.
  
  The charProfLevel variable (lines 177-179) is computed correctly but is only used to render
  ✅/🔒 icons in the embed — it never gates which recipes appear in the list.
  
  Additionally, the charProfLevel is only computed when professionFilter is non-null, so in the
  default all-professions view, charProfLevel = undefined and even the lock icons are suppressed.
  
  There is also no "no recipes unlocked" code path for the level-filtered scenario — the early
  exit at line 107 only checks if zero recipes exist in the DB, not whether any are accessible.

fix: |
  After fetching allRecipes from DB, apply an application-side filter:
  - When professionFilter is set: filter to recipes where getProfessionLevel(char.professionPoints, professionFilter) >= recipe.minProfessionLevel
  - When no filter (all professions): filter to recipes where getProfessionLevel(char.professionPoints, recipe.professionType) >= recipe.minProfessionLevel
  Then check if filteredRecipes.length === 0 and return 'no recipes unlocked' message.
  Also compute charProfLevel for the single-profession case for the ✅/🔒 icon to keep working.

verification: N/A — diagnose-only mode
files_changed: []
