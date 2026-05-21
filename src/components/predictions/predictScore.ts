import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, type ButtonInteraction } from 'discord.js';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { users } from '../../db/schema/users.js';
import { characters } from '../../db/schema/characters.js';
import { footballMatches } from '../../db/schema/footballMatches.js';
import { resolveLocale, getT } from '../../i18n/index.js';
import { buildErrorEmbed } from '../../ui/embeds/buildErrorEmbed.js';

export async function handlePredictScore(interaction: ButtonInteraction): Promise<void> {
  const customId = interaction.customId; // predict:score:{matchId}:{score}
  const parts = customId.split(':');
  const matchId = parseInt(parts[2] || '', 10);
  const score = parts[3] || '';

  if (isNaN(matchId) || !score) {
    const locale = resolveLocale(undefined, interaction.locale);
    const t = getT(locale);
    await interaction.reply({
      embeds: [buildErrorEmbed(t('football:errors.invalid_score', 'Tỷ số lựa chọn không hợp lệ.'))],
      ephemeral: true,
    });
    return;
  }

  // 1. Resolve user locale, user, and character
  const [userRow, charRow] = await Promise.all([
    db
      .select({ locale: users.locale })
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

  // 2. Validate character registration
  if (!charRow) {
    await interaction.reply({
      embeds: [buildErrorEmbed(t('game:start.not_registered', 'Bạn chưa bước vào con đường tu tiên! Dùng /start để bắt đầu.'))],
      ephemeral: true,
    });
    return;
  }

  // 3. Fetch and validate match status & kickoff
  const [match] = await db
    .select()
    .from(footballMatches)
    .where(eq(footballMatches.id, matchId))
    .limit(1);

  if (!match) {
    await interaction.reply({
      embeds: [buildErrorEmbed(t('football:errors.match_not_found', 'Trận đấu không tồn tại.'))],
      ephemeral: true,
    });
    return;
  }

  const now = new Date();
  if (match.status !== 'NS' || new Date(match.kickoffAt) <= now) {
    await interaction.reply({
      embeds: [buildErrorEmbed(t('football:errors.match_already_started', 'Trận đấu đã bắt đầu hoặc đã đóng cổng dự đoán.'))],
      ephemeral: true,
    });
    return;
  }

  // 4. Show Modal for Wager Amount
  const modal = new ModalBuilder()
    .setCustomId(`predict:modal:score:${matchId}:${score}`)
    .setTitle(t('football:bet.modal_title', 'Đặt Cược Trận Đấu'));

  const wagerInput = new TextInputBuilder()
    .setCustomId('wager')
    .setLabel(t('football:bet.modal_wager_label', 'Số lượng linh thạch cược'))
    .setStyle(TextInputStyle.Short)
    .setPlaceholder(t('football:bet.modal_wager_placeholder', 'Nhập số linh thạch (ví dụ: 100)'))
    .setRequired(true);

  const actionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(wagerInput);
  modal.addComponents(actionRow);

  await interaction.showModal(modal);
}
