import {
  ActionRowBuilder,
  SlashCommandSubcommandBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type MessageActionRowComponentBuilder,
} from 'discord.js';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { userHeroes } from '../../db/schema/userHeroes.js';
import { heroes } from '../../db/schema/heroes.js';
import { heroEmoji, type SanguoTier } from '../../assets/sanguoEmojis.js';
import type { SupportedLocale } from '../../i18n/index.js';
import { fetchCommandContext } from '../../utils/commandContext.js';
import { resolveComponentUser as resolveInteractionUser } from '../../utils/componentContext.js';
import { buildErrorEmbed } from '../../ui/embeds/buildErrorEmbed.js';
import { buildSanguoProgressionResultEmbed } from '../../ui/embeds/buildSanguoProgressionResultEmbed.js';
import { buildSanguoBagEmbed, type SanguoBagRow } from '../../ui/embeds/buildSanguoBagEmbed.js';
import { BAG_USE_PREFIX, buildBagUseButtons } from '../../ui/components/sanguoBagUseButtons.js';
import { listBag, useHeal, HEAL_ITEM_CODE } from '../../services/sanguo/bagService.js';
import { logger } from '../../utils/logger.js';

/**
 * /sanguo bag command (Phase 11 — TQC-16, D-13).
 *
 * Lists the owned items (user_sanguo_items) with quantities + a "Dùng" button
 * per USEABLE item:
 *  - heal_pill → the use button (heals the active companion — the D-04
 *    soft-lock recovery path; a selected copy routes through the D-04 copy
 *    selector in /sanguo hero).
 *  - booster_x2 → renders the owned booster HINT (convert.booster_hint) — the
 *    booster applies at the CONVERSION site (11-03), never here (D-13).
 *  - capture_key / capture_tier*_key → NO use button (they gate the T4/T5
 *    capture buttons already wired in sanguoCapture.ts).
 *
 * Identity rule: every service call keys on users.id — NEVER char.id.
 */
/* eslint-disable i18next/no-literal-string -- slash command name/description are static Discord API strings */
export const bagSubcommand = new SlashCommandSubcommandBuilder()
  .setName('bag')
  .setDescription('Xem và dùng vật phẩm trong túi')
  .setDescriptionLocalizations({
    'en-US': 'View and use items in your bag',
    'zh-CN': '查看并使用背包中的物品',
  });
/* eslint-enable i18next/no-literal-string */

interface PerLocaleName {
  nameVi: string;
  nameEn: string;
  nameZh: string | null;
}

/** Per-locale name column (D-07 content-in-DB — never i18n keys). */
function pickName(row: PerLocaleName, locale: SupportedLocale): string {
  if (locale === 'en') return row.nameEn;
  if (locale === 'zh-cn') return row.nameZh ?? row.nameVi;
  return row.nameVi;
}

function safeHeroEmoji(heroId: string, tier: number = 0): string | undefined {
  try {
    return heroEmoji(heroId, tier as SanguoTier);
  } catch {
    // EMOJI_NOT_FOUND → name-only rendering (map.ts:98 pattern)
    return undefined;
  }
}

/**
 * /sanguo bag execute — NO deferReply (the parent 'sanguo' command owns it,
 * map.ts execute).
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
    const rows = await listBag(user.id);
    const bagRows: SanguoBagRow[] = rows.map((r) => ({
      emoji: r.emoji,
      name: pickName(r, locale),
      quantity: r.quantity,
    }));

    const components: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [];
    // "Dùng" buttons ONLY for the healing item (D-13: booster shows the hint,
    // capture keys render no use button).
    const healRow = rows.find((r) => r.itemCode === HEAL_ITEM_CODE);
    if (healRow) {
      components.push(
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
          ...buildBagUseButtons(t, [{ itemCode: healRow.itemCode }]),
        ),
      );
    }

    await interaction.editReply({
      embeds: [
        buildSanguoBagEmbed(
          {
            count: bagRows.length,
            rows: bagRows,
            boosterHint: rows.some((r) => r.itemCode === 'booster_x2'),
            shardId,
          },
          t,
        ),
      ],
      components,
    });
  } catch (err) {
    logger.error('BagExecute', 'Error in /sanguo bag', err);
    await interaction.editReply({
      embeds: [buildErrorEmbed(t('sanguo:bag.error'), shardId)],
      components: [],
    });
  }
}

/**
 * Use press (sanguo:bag:use:{itemCode}) — heals the ACTIVE companion directly
 * (bag.use_button). The item code ONLY rides the customId; the heal effect
 * resolves server-side inside the bag tx.
 */
export async function handleUsePress(interaction: ButtonInteraction): Promise<void> {
  await interaction.deferUpdate();
  const ctx = await resolveInteractionUser(interaction);
  if (!ctx) return;
  const { userId, t, locale, shardId } = ctx;

  const itemCode = interaction.customId.slice(BAG_USE_PREFIX.length + 1);
  if (!itemCode) {
    await interaction.editReply({
      embeds: [buildErrorEmbed(t('sanguo:bag.error'), shardId)],
      components: [],
    });
    return;
  }

  try {
    const res = await useHeal(userId, itemCode, null);

    // Render the healed copy (per-locale name + tier-aware emoji) for the
    // result line.
    const [healed] = await db
      .select({
        heroId: userHeroes.heroId,
        heroHeroId: heroes.heroId,
        nameVi: heroes.nameVi,
        nameEn: heroes.nameEn,
        nameZh: heroes.nameZh,
        tier: userHeroes.tier,
      })
      .from(userHeroes)
      .innerJoin(heroes, eq(userHeroes.heroId, heroes.id))
      .where(eq(userHeroes.id, res.healedHeroId))
      .limit(1);

    const heroName = healed ? pickName(healed, locale) : '';
    const heroEmojiMarkup = healed ? safeHeroEmoji(healed.heroHeroId, healed.tier) : undefined;

    await interaction.editReply({
      embeds: [
        buildSanguoProgressionResultEmbed({
          state: 'success',
          title: t('sanguo:bag.title', { count: 0 }),
          lines: [
            t('sanguo:bag.healed', {
              hero_emoji: heroEmojiMarkup ?? '',
              hero: heroName,
              hp: res.hpAfter,
            }),
          ],
          shardId,
        }),
      ],
      components: [],
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'NO_TARGET') {
      await interaction.editReply({
        embeds: [
          buildSanguoProgressionResultEmbed({
            state: 'error',
            title: t('sanguo:bag.title', { count: 0 }),
            lines: [t('sanguo:bag.no_target')],
            shardId,
          }),
        ],
        components: [],
      });
      return;
    }
    logger.error('BagUsePress', 'Error in bag use press', err);
    await interaction.editReply({
      embeds: [buildErrorEmbed(t('sanguo:bag.error'), shardId)],
      components: [],
    });
  }
}
