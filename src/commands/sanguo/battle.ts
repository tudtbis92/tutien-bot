import {
  ActionRowBuilder,
  SlashCommandSubcommandBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type MessageActionRowComponentBuilder,
} from 'discord.js';
import { eq, and, desc } from 'drizzle-orm';
import type { TFunction } from 'i18next';
import { db } from '../../db/client.js';
import { heroes } from '../../db/schema/heroes.js';
import { userHeroes } from '../../db/schema/userHeroes.js';
import { userSanguoState } from '../../db/schema/userSanguoState.js';
import { encounterRuns } from '../../db/schema/encounterRuns.js';
import { sanguoBattles } from '../../db/schema/sanguoBattles.js';
import { mapZones } from '../../db/schema/mapZones.js';
import type { SupportedLocale } from '../../i18n/index.js';
import { fetchCommandContext } from '../../utils/commandContext.js';
import {
  resolveComponentUser as resolveInteractionUser,
} from '../../utils/componentContext.js';
import { buildErrorEmbed } from '../../ui/embeds/buildErrorEmbed.js';
import { logger } from '../../utils/logger.js';
import { buildSanguoBattleLogEmbed } from '../../ui/embeds/buildSanguoBattleLogEmbed.js';
import { buildSanguoCaptureEmbed } from '../../ui/embeds/buildSanguoCaptureEmbed.js';
import { buildCaptureOpenButton } from '../../ui/components/sanguoBattleButtons.js';
import {
  CAPTURE_TIER_PREFIX,
  buildCaptureTierButtons,
  buildCaptureRetryButton,
  buildCaptureRetreatButton,
} from '../../ui/components/sanguoCaptureButtons.js';
import {
  startEncounterBattle,
  startSparBattle,
  skipEncounter,
  type BattleOutcome,
} from '../../services/sanguo/battleCheckInService.js';
import { attemptCapture, captureChance } from '../../services/sanguo/captureService.js';
import { CAPTURE_TIERS } from '../../constants/sanguoCapture.js';
import { heroEmoji } from '../../assets/sanguoEmojis.js';
import type { TurnLog } from '../../services/sanguo/battleEngine.js';

/**
 * /sanguo battle command + the encounter-battle/capture button handlers
 * (Phase 10 — D-01/D-09/D-10/D-17/D-18, TQC-10/TQC-11).
 *
 * D-17 spar (/sanguo battle): free practice vs a random hero — NEUTRAL embed,
 * no stakes, no HP loss, no reward, NO capture CTA. Gates on the same
 * HERO_FAINTED active-companion check as the encounter battle (D-04).
 *
 * Button flow (D-01/D-10): encounter embed fight/skip row → handleBattleStart
 * (startEncounterBattle → SEASON battle log; win = Bắt row, loss = no buttons)
 * → handleCaptureOpen (capture view: THE single mechanic % + 3 tier buttons +
 * retreat in ONE row, T-10-06-05) → handleCaptureTierPress (attemptCapture:
 * fee/roll/pity/flee all server-side — T-10-06-01) → success/flee/retreat
 * terminal states clear components (CR-09-03/04), fail keeps retry open.
 *
 * Identity rule: every service call keys on users.id — NEVER char.id
 * (grep-gated). Errors are Error('MACHINE_CODE') matched on err.message
 * (travel.ts:496-509 pattern); known codes render documented copy, everything
 * else falls back to the section error with components: [].
 */

/* eslint-disable i18next/no-literal-string -- slash command name/description are static Discord API strings */
export const battleSubcommand = new SlashCommandSubcommandBuilder()
  .setName('battle')
  .setDescription('Tập luyện với một hero ngẫu nhiên')
  .setDescriptionLocalizations({
    'en-US': 'Train against a random hero',
    'zh-CN': '与随机英雄对战练习',
  });
/* eslint-enable i18next/no-literal-string */

interface PerLocaleName {
  nameVi: string;
  nameEn: string;
  nameZh: string | null;
}

/** Per-locale name column (D-07 content-in-DB — heroes/zones, never i18n keys). */
function pickName(row: PerLocaleName, locale: SupportedLocale): string {
  if (locale === 'en') return row.nameEn;
  if (locale === 'zh-cn') return row.nameZh ?? row.nameVi;
  return row.nameVi;
}

function safeHeroEmoji(heroId: string): string | undefined {
  try {
    return heroEmoji(heroId);
  } catch {
    // EMOJI_NOT_FOUND → name-only rendering (map.ts:98 pattern)
    return undefined;
  }
}

/** The active companion's per-locale name — for the HERO_FAINTED block copy. */
async function fetchActiveCompanionName(
  userId: number,
  locale: SupportedLocale,
): Promise<string | null> {
  const [state] = await db
    .select()
    .from(userSanguoState)
    .where(eq(userSanguoState.userId, userId))
    .limit(1);
  if (!state || state.activeHeroId == null) return null;
  const [uh] = await db
    .select()
    .from(userHeroes)
    .where(eq(userHeroes.id, state.activeHeroId))
    .limit(1);
  if (!uh) return null;
  const [h] = await db.select().from(heroes).where(eq(heroes.id, uh.heroId)).limit(1);
  if (!h) return null;
  return pickName(h, locale);
}

interface BattleDisplay {
  playerName: string;
  enemyName: string;
  enemyEmoji?: string;
  playerHeroId?: string;
  enemyHeroId?: string;
}

/**
 * Resolve the battle log's display names from the active companion + the
 * enemy heroId embedded in the round logs (D-07 per-locale names; the enemy
 * heroId = the distinct non-player id, which also covers spar opponents).
 */
async function resolveBattleDisplay(
  userId: number,
  roundLogs: TurnLog[],
  locale: SupportedLocale,
): Promise<BattleDisplay> {
  let playerName = '?';
  let playerHeroId: string | undefined;
  const [state] = await db
    .select()
    .from(userSanguoState)
    .where(eq(userSanguoState.userId, userId))
    .limit(1);
  if (state?.activeHeroId != null) {
    const [uh] = await db
      .select()
      .from(userHeroes)
      .where(eq(userHeroes.id, state.activeHeroId))
      .limit(1);
    if (uh) {
      const [h] = await db.select().from(heroes).where(eq(heroes.id, uh.heroId)).limit(1);
      if (h) {
        playerName = pickName(h, locale);
        playerHeroId = h.heroId;
      }
    }
  }

  const distinct = [...new Set(roundLogs.flatMap((l) => [l.attacker, l.defender]))];
  const enemyHeroId = distinct.find((id) => id !== playerHeroId) ?? distinct[0];
  let enemyName = enemyHeroId ?? '?';
  let enemyEmoji: string | undefined;

  if (enemyHeroId && !enemyHeroId.startsWith('boss:')) {
    const [enemy] = await db
      .select()
      .from(heroes)
      .where(eq(heroes.heroId, enemyHeroId))
      .limit(1);
    if (enemy) {
      enemyName = pickName(enemy, locale);
      enemyEmoji = safeHeroEmoji(enemy.heroId);
    }
  } else if (enemyHeroId?.startsWith('boss:')) {
    const [zoneRow] = await db
      .select()
      .from(mapZones)
      .where(eq(mapZones.code, enemyHeroId.slice('boss:'.length)))
      .limit(1);
    if (zoneRow) enemyName = pickName(zoneRow, locale);
  }

  return { playerName, enemyName, enemyEmoji, playerHeroId, enemyHeroId };
}

function renderBattleLog(
  outcome: BattleOutcome,
  display: BattleDisplay,
  spar: boolean,
  t: TFunction,
  shardId: number | undefined,
) {
  const roundLogs = outcome.roundLogs as TurnLog[];
  return buildSanguoBattleLogEmbed(
    {
      playerName: display.playerName,
      enemyName: display.enemyName,
      enemyEmoji: display.enemyEmoji,
      roundLogs,
      winner: outcome.winner,
      rounds: roundLogs.reduce((max, l) => Math.max(max, l.round), 0),
      playerHpAfter: outcome.playerHpAfter,
      enemyHpAfter: outcome.enemyHpAfter,
      spar,
      playerHeroId: display.playerHeroId,
      enemyHeroId: display.enemyHeroId,
      shardId,
    },
    t,
  );
}

interface CaptureTarget {
  heroName: string;
  heroEmoji?: string;
  boss: boolean;
}

/** The pending encounter's display target — hero or boss zone name (D-07). */
async function resolveCaptureTarget(
  userId: number,
  locale: SupportedLocale,
): Promise<CaptureTarget> {
  const [encounter] = await db
    .select()
    .from(encounterRuns)
    .where(and(eq(encounterRuns.userId, userId), eq(encounterRuns.status, 'pending')))
    .orderBy(desc(encounterRuns.id))
    .limit(1);
  if (!encounter) throw new Error('NO_PENDING_ENCOUNTER');

  if (encounter.heroId != null) {
    const [hero] = await db.select().from(heroes).where(eq(heroes.id, encounter.heroId)).limit(1);
    if (hero) return { heroName: pickName(hero, locale), heroEmoji: safeHeroEmoji(hero.heroId), boss: false };
    return { heroName: '?', boss: false };
  }
  const [zoneRow] = await db
    .select()
    .from(mapZones)
    .where(eq(mapZones.code, encounter.zone))
    .limit(1);
  return { heroName: zoneRow ? pickName(zoneRow, locale) : '?', boss: true };
}

export interface CaptureView {
  embed: ReturnType<typeof buildSanguoCaptureEmbed>;
  row: ActionRowBuilder<MessageActionRowComponentBuilder>;
}

/**
 * The capture view render path (handleCaptureOpen + retry + travel.ts F4
 * abandoned-capture routing all use this). Chance = captureService.captureChance
 * at render time with the TIER-1 multiplier (the single displayed mechanic
 * number — D-12); the ATTEMPT re-computes the exact chance inside its tx with
 * the pressed tier's multiplier (flagged assumption: small drift possible, the
 * attempt always wins).
 */
export async function renderCaptureView(
  userId: number,
  t: TFunction,
  locale: SupportedLocale,
  shardId?: number,
): Promise<CaptureView> {
  const [encounter] = await db
    .select()
    .from(encounterRuns)
    .where(and(eq(encounterRuns.userId, userId), eq(encounterRuns.status, 'pending')))
    .orderBy(desc(encounterRuns.id))
    .limit(1);
  if (!encounter) throw new Error('NO_PENDING_ENCOUNTER');

  // Chance from the LOCKED-Row-equivalent read path (Pitfall 2): HP from the
  // battle snapshot, rarity from the heroes row (boss = 5), pity from the
  // encounter row — same inputs captureService reads inside its tx.
  // CR-01: the view ALSO fails closed when the won-battle precondition is
  // missing (no battle / not a player win) — mirrors attemptCapture so a
  // crafted capture:open press can never render a pay-to-roll 0% view.
  const [battle] = await db
    .select()
    .from(sanguoBattles)
    .where(and(eq(sanguoBattles.encounterId, encounter.id), eq(sanguoBattles.type, 'encounter')))
    .orderBy(desc(sanguoBattles.id))
    .limit(1);
  const storedResult = (battle?.result ?? {}) as { winner?: string };
  if (!battle || storedResult.winner !== 'player') throw new Error('CAPTURE_NOT_AVAILABLE');
  const input = (battle.input ?? {}) as { enemy?: { base?: { hp?: number } } };
  const result = (battle.result ?? {}) as { enemyHpAfter?: number };
  const hpMax = input.enemy?.base?.hp;
  const hpCurrent = result.enemyHpAfter;
  if (hpMax == null || hpCurrent == null) throw new Error('NO_BATTLE_SNAPSHOT');

  let rarity = 5; // boss rarity constant (A3 templates are rarity 5)
  let heroName = '?';
  let heroEmojiMarkup: string | undefined;
  const boss = encounter.encounterType === 'boss';

  if (encounter.heroId != null) {
    const [hero] = await db.select().from(heroes).where(eq(heroes.id, encounter.heroId)).limit(1);
    if (hero) {
      rarity = hero.rarity;
      heroName = pickName(hero, locale);
      heroEmojiMarkup = safeHeroEmoji(hero.heroId);
    }
  } else {
    const [zoneRow] = await db
      .select()
      .from(mapZones)
      .where(eq(mapZones.code, encounter.zone))
      .limit(1);
    if (zoneRow) heroName = pickName(zoneRow, locale);
  }

  const chance = captureChance({
    rarity,
    hpMax,
    hpCurrent,
    tierMultiplier: 1, // the view shows the tier-1 chance — the single number
    pity: encounter.pityCount,
  });
  const percent = Math.floor(chance * 100); // floor(chance×100) — D-10/D-12

  const activeTiers = CAPTURE_TIERS.filter((cfg) => cfg.requiresItem === null).map((cfg) => ({
    tier: cfg.tier,
    fee: String(cfg.fee),
  }));

  // T-10-06-05: exactly 3 tiers + retreat in ONE ActionRow (4 ≤ 5).
  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    ...buildCaptureTierButtons(t, activeTiers),
    buildCaptureRetreatButton(t),
  );

  return {
    embed: buildSanguoCaptureEmbed(
      { heroName, heroEmoji: heroEmojiMarkup, percent, state: 'view', boss, shardId },
      t,
    ),
    row,
  };
}

/**
 * /sanguo battle execute — D-17 spar practice vs a random hero. NEUTRAL embed,
 * spar hint, NO capture button. No deferReply (the parent 'sanguo' command
 * owns it, map.ts execute).
 */
export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const { t, char, user, locale, shardId } = await fetchCommandContext(interaction);
  if (!char || !user) {
    await interaction.editReply({
      embeds: [buildErrorEmbed(t('common:errors.notRegistered'), shardId)],
    });
    return;
  }

  try {
    const outcome = await startSparBattle(user.id);
    const display = await resolveBattleDisplay(user.id, outcome.roundLogs as TurnLog[], locale);
    await interaction.editReply({
      embeds: [renderBattleLog(outcome, display, true, t, shardId)],
      components: [], // D-17: spar never offers capture
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'HERO_FAINTED') {
      const name = (await fetchActiveCompanionName(user.id, locale)) ?? '';
      await interaction.editReply({
        embeds: [buildErrorEmbed(t('sanguo:battle.blocked_fainted', { name }), shardId)],
        components: [],
      });
      return;
    }
    logger.error('BattleExecute', 'Error in /sanguo battle', err);
    await interaction.editReply({
      embeds: [buildErrorEmbed(t('sanguo:battle.error'), shardId)],
      components: [],
    });
  }
}

/**
 * D-01 encounter battle entry — the fight button on the encounter embed.
 * Win → SEASON battle log + the Bắt row (capture window opens, D-10);
 * loss → the loss resolution, no buttons.
 */
export async function handleBattleStart(interaction: ButtonInteraction): Promise<void> {
  await interaction.deferUpdate();
  const ctx = await resolveInteractionUser(interaction);
  if (!ctx) return;

  try {
    const outcome = await startEncounterBattle(ctx.userId);
    const display = await resolveBattleDisplay(ctx.userId, outcome.roundLogs as TurnLog[], ctx.locale);
    const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [];
    if (outcome.winner === 'player') {
      rows.push(
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
          buildCaptureOpenButton(ctx.t),
        ),
      );
    }
    await interaction.editReply({
      embeds: [renderBattleLog(outcome, display, false, ctx.t, ctx.shardId)],
      components: rows, // loss → [] (CR-09-04)
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'HERO_FAINTED') {
      const name = (await fetchActiveCompanionName(ctx.userId, ctx.locale)) ?? '';
      await interaction.editReply({
        embeds: [buildErrorEmbed(ctx.t('sanguo:battle.blocked_fainted', { name }), ctx.shardId)],
        components: [],
      });
      return;
    }
    if (err instanceof Error && err.message === 'NO_PENDING_ENCOUNTER') {
      await interaction.editReply({
        embeds: [buildErrorEmbed(ctx.t('sanguo:battle.no_encounter'), ctx.shardId)],
        components: [],
      });
      return;
    }
    // CR-02: a stale fight button from an earlier check-in embed reached a
    // pending encounter that ALREADY has a completed battle (usually a win —
    // the capture window is open). Do NOT re-battle (free IV/HP re-roll +
    // capture-window loss on a re-battle loss). Route to the capture view —
    // same F4 pattern as travel.ts — so the player captures, not re-fights.
    if (err instanceof Error && err.message === 'BATTLE_ALREADY_FOUGHT') {
      try {
        const view = await renderCaptureView(ctx.userId, ctx.t, ctx.locale, ctx.shardId);
        await interaction.editReply({ embeds: [view.embed], components: [view.row] });
      } catch {
        await interaction.editReply({
          embeds: [buildErrorEmbed(ctx.t('sanguo:battle.no_encounter'), ctx.shardId)],
          components: [],
        });
      }
      return;
    }
    logger.error('BattleStart', 'Error in encounter battle start', err);
    await interaction.editReply({
      embeds: [buildErrorEmbed(ctx.t('sanguo:battle.error'), ctx.shardId)],
      components: [],
    });
  }
}

/** D-18: skip the encounter from the encounter embed — wild departs, travel resumes. */
export async function handleBattleSkip(interaction: ButtonInteraction): Promise<void> {
  await interaction.deferUpdate();
  const ctx = await resolveInteractionUser(interaction);
  if (!ctx) return;

  try {
    const target = await resolveCaptureTarget(ctx.userId, ctx.locale);
    await skipEncounter(ctx.userId);
    await interaction.editReply({
      embeds: [
        buildSanguoCaptureEmbed(
          { heroName: target.heroName, heroEmoji: target.heroEmoji, percent: 0, state: 'retreat', boss: target.boss, shardId: ctx.shardId },
          ctx.t,
        ),
      ],
      components: [],
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'NO_PENDING_ENCOUNTER') {
      await interaction.editReply({
        embeds: [buildErrorEmbed(ctx.t('sanguo:battle.no_encounter'), ctx.shardId)],
        components: [],
      });
      return;
    }
    logger.error('BattleSkip', 'Error in encounter skip', err);
    await interaction.editReply({
      embeds: [buildErrorEmbed(ctx.t('sanguo:battle.error'), ctx.shardId)],
      components: [],
    });
  }
}

/** D-10: the Bắt button on the battle-win row — opens the capture view. */
export async function handleCaptureOpen(interaction: ButtonInteraction): Promise<void> {
  await interaction.deferUpdate();
  const ctx = await resolveInteractionUser(interaction);
  if (!ctx) return;

  try {
    const view = await renderCaptureView(ctx.userId, ctx.t, ctx.locale, ctx.shardId);
    await interaction.editReply({ embeds: [view.embed], components: [view.row] });
  } catch (err) {
    if (err instanceof Error && err.message === 'NO_PENDING_ENCOUNTER') {
      await interaction.editReply({
        embeds: [buildErrorEmbed(ctx.t('sanguo:battle.no_encounter'), ctx.shardId)],
        components: [],
      });
      return;
    }
    if (err instanceof Error && err.message === 'CAPTURE_NOT_AVAILABLE') {
      await interaction.editReply({
        embeds: [buildErrorEmbed(ctx.t('sanguo:capture.not_available'), ctx.shardId)],
        components: [],
      });
      return;
    }
    logger.error('CaptureOpen', 'Error opening capture view', err);
    await interaction.editReply({
      embeds: [buildErrorEmbed(ctx.t('sanguo:capture.error'), ctx.shardId)],
      components: [],
    });
  }
}

/**
 * D-10 tier press — the tier rides the customId (`sanguo:capture:tier:{n}`,
 * parseInt + isNaN guard); the fee/multiplier resolve server-side inside
 * attemptCapture (T-10-06-01 anti-tamper). Success → SUCCESS embed with no
 * buttons; fail-no-flee → WARNING + retry/retreat row (new fee); flee →
 * DANGER embed with no buttons.
 */
export async function handleCaptureTierPress(interaction: ButtonInteraction): Promise<void> {
  await interaction.deferUpdate();
  const ctx = await resolveInteractionUser(interaction);
  if (!ctx) return;
  const { userId, t, locale, shardId } = ctx;

  const rawTier = interaction.customId.slice(CAPTURE_TIER_PREFIX.length + 1);
  const tier = parseInt(rawTier, 10);
  if (isNaN(tier)) {
    await interaction.editReply({
      embeds: [buildErrorEmbed(t('sanguo:capture.error'), shardId)],
      components: [],
    });
    return;
  }

  try {
    const target = await resolveCaptureTarget(userId, locale);
    const result = await attemptCapture(userId, tier);

    if (result.outcome === 'success') {
      await interaction.editReply({
        embeds: [
          buildSanguoCaptureEmbed(
            { heroName: target.heroName, heroEmoji: target.heroEmoji, state: 'success', boss: target.boss, shardId },
            t,
          ),
        ],
        components: [],
      });
      return;
    }
    if (result.outcome === 'flee') {
      await interaction.editReply({
        embeds: [
          buildSanguoCaptureEmbed(
            { heroName: target.heroName, heroEmoji: target.heroEmoji, state: 'flee', boss: target.boss, shardId },
            t,
          ),
        ],
        components: [],
      });
      return;
    }
    // fail, no flee — the encounter stays pending: retry open (WARNING, D-11).
    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      buildCaptureRetryButton(t),
      buildCaptureRetreatButton(t),
    );
    await interaction.editReply({
      embeds: [
        buildSanguoCaptureEmbed(
          { heroName: target.heroName, heroEmoji: target.heroEmoji, state: 'fail', boss: target.boss, shardId },
          t,
        ),
      ],
      components: [row],
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'NO_PENDING_ENCOUNTER') {
      await interaction.editReply({
        embeds: [buildErrorEmbed(t('sanguo:battle.no_encounter'), shardId)],
        components: [],
      });
      return;
    }
    if (err instanceof Error && err.message === 'CAPTURE_NOT_AVAILABLE') {
      await interaction.editReply({
        embeds: [buildErrorEmbed(t('sanguo:capture.not_available'), shardId)],
        components: [],
      });
      return;
    }
    if (err instanceof Error && err.message === 'NO_BATTLE_SNAPSHOT') {
      await interaction.editReply({
        embeds: [buildErrorEmbed(t('sanguo:capture.error'), shardId)],
        components: [],
      });
      return;
    }
    if (err instanceof Error && err.message === 'INSUFFICIENT_BALANCE') {
      // Fee from the server config — the required amount in the copy (D-20).
      const fee = CAPTURE_TIERS.find((cfg) => cfg.tier === tier)?.fee ?? 0n;
      await interaction.editReply({
        embeds: [buildErrorEmbed(t('sanguo:capture.insufficient', { fee: String(fee) }), shardId)],
        components: [],
      });
      return;
    }
    logger.error('CaptureTierPress', 'Error in capture tier press', err);
    await interaction.editReply({
      embeds: [buildErrorEmbed(t('sanguo:capture.error'), shardId)],
      components: [],
    });
  }
}

/** After a failed attempt (no flee) — re-render the capture view with the recomputed %. */
export async function handleCaptureRetryPress(interaction: ButtonInteraction): Promise<void> {
  await interaction.deferUpdate();
  const ctx = await resolveInteractionUser(interaction);
  if (!ctx) return;

  try {
    const view = await renderCaptureView(ctx.userId, ctx.t, ctx.locale, ctx.shardId);
    await interaction.editReply({ embeds: [view.embed], components: [view.row] });
  } catch (err) {
    if (err instanceof Error && err.message === 'NO_PENDING_ENCOUNTER') {
      await interaction.editReply({
        embeds: [buildErrorEmbed(ctx.t('sanguo:battle.no_encounter'), ctx.shardId)],
        components: [],
      });
      return;
    }
    if (err instanceof Error && err.message === 'CAPTURE_NOT_AVAILABLE') {
      await interaction.editReply({
        embeds: [buildErrorEmbed(ctx.t('sanguo:capture.not_available'), ctx.shardId)],
        components: [],
      });
      return;
    }
    logger.error('CaptureRetry', 'Error re-rendering capture view', err);
    await interaction.editReply({
      embeds: [buildErrorEmbed(ctx.t('sanguo:capture.error'), ctx.shardId)],
      components: [],
    });
  }
}

/** D-18 retreat from the capture view — resolves the encounter, travel resumes. */
export async function handleCaptureRetreatPress(interaction: ButtonInteraction): Promise<void> {
  await interaction.deferUpdate();
  const ctx = await resolveInteractionUser(interaction);
  if (!ctx) return;

  try {
    const target = await resolveCaptureTarget(ctx.userId, ctx.locale);
    await skipEncounter(ctx.userId);
    await interaction.editReply({
      embeds: [
        buildSanguoCaptureEmbed(
          { heroName: target.heroName, heroEmoji: target.heroEmoji, percent: 0, state: 'retreat', boss: target.boss, shardId: ctx.shardId },
          ctx.t,
        ),
      ],
      components: [],
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'NO_PENDING_ENCOUNTER') {
      await interaction.editReply({
        embeds: [buildErrorEmbed(ctx.t('sanguo:battle.no_encounter'), ctx.shardId)],
        components: [],
      });
      return;
    }
    logger.error('CaptureRetreat', 'Error in capture retreat', err);
    await interaction.editReply({
      embeds: [buildErrorEmbed(ctx.t('sanguo:capture.error'), ctx.shardId)],
      components: [],
    });
  }
}
