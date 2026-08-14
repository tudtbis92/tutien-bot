import type { ButtonInteraction, StringSelectMenuInteraction } from 'discord.js';
import type { TFunction } from 'i18next';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { users } from '../db/schema/users.js';
import { resolveLocale, getT, type SupportedLocale } from '../i18n/index.js';
import { buildErrorEmbed } from '../ui/embeds/buildErrorEmbed.js';

/**
 * Shared component-press user context (IN-05 — dedup of the 5× copy-pasted
 * resolveInteractionUser in battle/hero/heroes/travel).
 *
 * Identity rule (grep-gated): every sanguo service call keys on users.id —
 * NEVER char.id. This resolves the users row from the presser's Discord id,
 * then builds the locale/t/shardId context. Not-registered → notRegistered
 * embed + components cleared, returns null.
 */
export interface InteractionUserCtx {
  userId: number;
  t: TFunction;
  locale: SupportedLocale;
  shardId: number | undefined;
}

export async function resolveComponentUser(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
): Promise<InteractionUserCtx | null> {
  const [userRow] = await db
    .select({ id: users.id, locale: users.locale })
    .from(users)
    .where(eq(users.discordId, interaction.user.id))
    .limit(1);
  const locale = resolveLocale(userRow?.locale, interaction.locale);
  const t = getT(locale);
  const shardId = interaction.client.shard?.ids[0];

  if (!userRow) {
    await interaction.editReply({
      embeds: [buildErrorEmbed(t('common:errors.notRegistered'), shardId)],
      components: [],
    });
    return null;
  }
  return { userId: userRow.id, t, locale, shardId };
}
