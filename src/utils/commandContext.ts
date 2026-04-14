import { eq } from 'drizzle-orm';
import type { ChatInputCommandInteraction } from 'discord.js';
import type { TFunction } from 'i18next';
import { db } from '../db/client.js';
import { users } from '../db/schema/users.js';
import { characters, type Character } from '../db/schema/characters.js';
import { resolveLocale, getT, type SupportedLocale } from '../i18n/index.js';

export interface CommandContext {
  locale: SupportedLocale;
  t: TFunction;
  char: Character | undefined;
  /** Linh thạch wallet — from users.balance. Undefined if user row not found. */
  user: { balance: bigint } | undefined;
  shardId: number | undefined;
}

/**
 * Fetch locale and character for a slash command interaction in one parallel query.
 *
 * Resolves locale priority: stored DB preference → Discord interaction locale → 'vi'.
 * `char` is undefined if the user has not registered via /start.
 * Callers are responsible for handling the not-registered case before using `char`.
 *
 * @example
 *   const { t, char, shardId } = await fetchCommandContext(interaction);
 *   if (!char) {
 *     await interaction.editReply({ embeds: [buildErrorEmbed(t('game:start.not_registered'), shardId)] });
 *     return;
 *   }
 */
export async function fetchCommandContext(
  interaction: ChatInputCommandInteraction,
): Promise<CommandContext> {
  const shardId = interaction.client.shard?.ids[0];

  const [userRow, char] = await Promise.all([
    db
      .select({ locale: users.locale, balance: users.balance })
      .from(users)
      .where(eq(users.discordId, interaction.user.id))
      .limit(1)
      .then((rows) => rows[0]),
    db
      .select()
      .from(characters)
      .where(eq(characters.discordId, interaction.user.id))
      .limit(1)
      .then((rows) => rows[0]),
  ]);

  const locale = resolveLocale(userRow?.locale, interaction.locale);
  const t = getT(locale);

  return { locale, t, char, user: userRow ?? undefined, shardId };
}
