/**
 * /đột_phá — Breakthrough attempt command.
 *
 * Handles all 4 outcomes: success, fail, insufficient, max_realm.
 * No retry cooldown per D-18 — player grinds back tu vi naturally.
 *
 * Flow:
 *  1. deferReply
 *  2. Resolve locale → t
 *  3. SELECT character by discordId — not found → error embed
 *  4. canAttemptBreakthrough check — if denied → embed and return
 *  5. rollBreakthrough — probabilistic outcome
 *  6. Apply DB update (success or failure penalty)
 *  7. Build embed → editReply
 */

/* eslint-disable i18next/no-literal-string -- slash command name/description are static Discord API strings */
import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { characters } from '../../db/schema/characters.js';
import {
  canAttemptBreakthrough,
  rollBreakthrough,
  applyBreakthroughSuccess,
  applyBreakthroughFailure,
} from '../../services/breakthrough.js';
import { buildBreakthroughEmbed } from '../../ui/embeds/buildBreakthroughEmbed.js';
import { buildErrorEmbed } from '../../ui/embeds/buildErrorEmbed.js';
import { resolveLocale, getT } from '../../i18n/index.js';

export const data = new SlashCommandBuilder()
  .setName('đột_phá')
  .setNameLocalizations({ 'en-US': 'breakthrough', 'zh-CN': 'breakthrough' })
  .setDescription('Thực hiện đột phá cảnh giới')
  .setDescriptionLocalizations({
    'en-US': 'Attempt a realm breakthrough',
    'zh-CN': '尝试境界突破',
  });
/* eslint-enable i18next/no-literal-string */

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  const locale = resolveLocale(null, interaction.locale);
  const t = getT(locale);
  const shardId = interaction.client.shard?.ids[0];

  // Fetch character by Discord ID
  const char = await db
    .select()
    .from(characters)
    .where(eq(characters.discordId, interaction.user.id))
    .limit(1)
    .then((rows) => rows[0]);

  if (!char) {
    await interaction.editReply({
      embeds: [buildErrorEmbed(t('game:start.not_registered'), shardId)],
    });
    return;
  }

  // Check eligibility
  const check = canAttemptBreakthrough(char);

  if (!check.allowed) {
    if (check.reason === 'max_realm') {
      await interaction.editReply({
        embeds: [
          buildBreakthroughEmbed(
            { outcome: 'max_realm', currentRealmId: char.realmId },
            t,
            shardId,
          ),
        ],
      });
      return;
    }

    if (check.reason === 'insufficient_tuvi') {
      await interaction.editReply({
        embeds: [
          buildBreakthroughEmbed(
            {
              outcome: 'insufficient',
              currentRealmId: char.realmId,
              required: check.required,
              current: check.current,
            },
            t,
            shardId,
          ),
        ],
      });
      return;
    }
  }

  // Roll the breakthrough
  const result = rollBreakthrough(char);

  if (result.outcome === 'success') {
    await applyBreakthroughSuccess(char.id, result.newRealmId);
    await interaction.editReply({
      embeds: [
        buildBreakthroughEmbed(
          {
            outcome: 'success',
            currentRealmId: char.realmId,
            newRealmId: result.newRealmId,
          },
          t,
          shardId,
        ),
      ],
    });
    return;
  }

  // Failure path
  await applyBreakthroughFailure(char.id, result.penaltyAmount);
  await interaction.editReply({
    embeds: [
      buildBreakthroughEmbed(
        {
          outcome: 'fail',
          currentRealmId: char.realmId,
          penaltyAmount: result.penaltyAmount,
        },
        t,
        shardId,
      ),
    ],
  });
}
