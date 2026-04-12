import { Events, type Interaction } from 'discord.js';
import { eq } from 'drizzle-orm';
import { logger } from '../utils/logger.js';
import { buildErrorEmbed } from '../ui/embeds/buildErrorEmbed.js';
import { resolveLocale, getT } from '../i18n/index.js';
import { db } from '../db/client.js';
import { users } from '../db/schema/users.js';
import { buildLeaderboardPage } from '../commands/game/bxh.js';

export const name = Events.InteractionCreate;

export async function execute(interaction: Interaction): Promise<void> {
  // ── Button interaction routing ──────────────────────────────────────────────
  if (interaction.isButton()) {
    const customId = interaction.customId;

    // /bxh pagination buttons: customId = 'bxh_prev_{page}_{scope}' or 'bxh_next_{page}_{scope}'
    if (customId.startsWith('bxh_prev_') || customId.startsWith('bxh_next_')) {
      const parts = customId.split('_');
      // Format: ['bxh', 'prev'|'next', '{page}', '{scope...}']
      const direction = parts[1] as 'prev' | 'next';
      const rawPage = parseInt(parts[2] ?? '', 10);

      // T-02-BXH-01: NaN guard — malformed customId should not trigger a query
      if (isNaN(rawPage)) {
        await interaction.deferUpdate();
        return;
      }

      const currentPage = rawPage;
      const newPage = direction === 'prev' ? currentPage - 1 : currentPage + 1;

      // Negative page guard — cannot go before page 0
      if (newPage < 0) {
        await interaction.deferUpdate();
        return;
      }

      await interaction.deferUpdate();

      // T-02-BXH-02: scope is guildId snowflake or literal 'global'
      // parts[3..] re-joined in case guildId somehow contains '_' (it shouldn't — Discord snowflakes are numeric)
      const scope = parts.slice(3).join('_');

      // Resolve user locale from DB; fallback to 'vi' if not found
      const [userRow] = await db
        .select({ locale: users.locale })
        .from(users)
        .where(eq(users.discordId, interaction.user.id));
      const locale = resolveLocale(userRow?.locale, null);
      const t = getT(locale);

      const shardId = interaction.client.shard?.ids[0];

      const { embed, row } = await buildLeaderboardPage(scope, newPage, t, shardId);
      await interaction.editReply({ embeds: [embed], components: [row] });
      return;
    }

    // Unknown button — no-op (future button types handled here)
    return;
  }

  // ── Slash command routing ───────────────────────────────────────────────────
  if (!interaction.isChatInputCommand()) return;

  const command = interaction.client.commands?.get(interaction.commandName);

  if (!command) {
    logger.warn('InteractionCreate', `Unknown command: ${interaction.commandName}`);
    return;
  }

  try {
    await command.execute(interaction);
  } catch (err) {
    logger.error('InteractionCreate', `Error in command ${interaction.commandName}`, err);

    // TODO (Phase 2): Fetch user locale from DB for stored preference
    const locale = resolveLocale(null, interaction.locale);
    const t = getT(locale);

    const errorEmbed = buildErrorEmbed(t('errors.internalError'));

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
    } else {
      await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
  }
}
