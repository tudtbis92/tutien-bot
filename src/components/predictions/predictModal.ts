import { type ModalSubmitInteraction } from 'discord.js';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/client.js';
import { users } from '../../db/schema/users.js';
import { resolveLocale, getT } from '../../i18n/index.js';
import { buildErrorEmbed } from '../../ui/embeds/buildErrorEmbed.js';
import { buildSuccessEmbed } from '../../ui/embeds/buildSuccessEmbed.js';
import { formatBalance } from '../../utils/format.js';
import {
  placeBet,
  MatchAlreadyStartedError,
  MatchNotFoundError,
  InvalidWagerAmountError,
  OddsNotFoundError,
  InsufficientBalanceError,
} from '../../services/football/predictionService.js';

const wagerSchema = z.string().regex(/^\d+$/, 'Wager must be a positive integer');

export async function handlePredictModalSubmit(interaction: ModalSubmitInteraction): Promise<void> {
  const customId = interaction.customId; // predict:modal:{betType}:{matchId}:{prediction}
  const parts = customId.split(':');
  const betType = parts[2] as 'result' | 'score';
  const matchId = parseInt(parts[3] || '', 10);
  const prediction = parts[4] || '';

  // 1. Fetch user to get database user ID and locale
  const [userRow] = await db
    .select({ id: users.id, locale: users.locale })
    .from(users)
    .where(eq(users.discordId, interaction.user.id))
    .limit(1);

  const locale = resolveLocale(userRow?.locale, interaction.locale);
  const t = getT(locale);
  const shardId = interaction.client.shard?.ids[0];

  if (!userRow) {
    await interaction.reply({
      embeds: [buildErrorEmbed(t('game:start.not_registered', 'Bạn chưa bước vào con đường tu tiên! Dùng /start để bắt đầu.'))],
      ephemeral: true,
    });
    return;
  }

  if (isNaN(matchId) || !prediction || (betType !== 'result' && betType !== 'score')) {
    await interaction.reply({
      embeds: [buildErrorEmbed(t('football:errors.invalid_prediction', 'Thông tin dự đoán không hợp lệ.'))],
      ephemeral: true,
    });
    return;
  }

  // 2. Extract and validate text input wager
  const wagerStr = interaction.fields.getTextInputValue('wager').trim();
  const validation = wagerSchema.safeParse(wagerStr);

  if (!validation.success) {
    await interaction.reply({
      embeds: [buildErrorEmbed(t('football:errors.invalid_wager_format', 'Số linh thạch cược phải là một số nguyên dương hợp lệ.'))],
      ephemeral: true,
    });
    return;
  }

  const wagerAmount = BigInt(wagerStr);

  try {
    // 3. Place or edit bet
    const { payout, isEdit } = await placeBet(
      db,
      userRow.id,
      matchId,
      betType,
      prediction,
      wagerAmount
    );

    // 4. Send success reply
    let successMessage = '';
    
    // Custom labels for the chosen prediction
    let displayPrediction = prediction;
    if (betType === 'result') {
      if (prediction === 'home') displayPrediction = t('football:embed.home_win_label', 'Home Win');
      else if (prediction === 'draw') displayPrediction = t('football:embed.draw_label', 'Draw');
      else if (prediction === 'away') displayPrediction = t('football:embed.away_win_label', 'Away Win');
    }

    if (isEdit) {
      successMessage = t(
        'football:bet.edit_success',
        {
          prediction: displayPrediction,
          wager: formatBalance(wagerAmount),
          payout: formatBalance(payout),
          defaultValue: `Cập nhật dự đoán thành công! Cược mới: **${displayPrediction}** với **${formatBalance(wagerAmount)}** linh thạch. Payout tối đa: **${formatBalance(payout)}** linh thạch.`,
        }
      );
    } else {
      successMessage = t(
        'football:bet.place_success',
        {
          prediction: displayPrediction,
          wager: formatBalance(wagerAmount),
          payout: formatBalance(payout),
          defaultValue: `Dự đoán thành công! Đã cược **${displayPrediction}** với **${formatBalance(wagerAmount)}** linh thạch. Payout tối đa: **${formatBalance(payout)}** linh thạch.`,
        }
      );
    }

    const title = t('football:bet.success_title', 'Dự Đoán Bóng Đá');
    await interaction.reply({
      embeds: [buildSuccessEmbed(title, successMessage, shardId)],
      ephemeral: true,
    });
  } catch (err: unknown) {
    let errorMsg = t('common:errors.internalError', 'Đã xảy ra lỗi hệ thống.');

    if (err instanceof MatchNotFoundError) {
      errorMsg = t('football:errors.match_not_found', 'Trận đấu không tồn tại.');
    } else if (err instanceof MatchAlreadyStartedError) {
      errorMsg = t('football:errors.match_already_started', 'Trận đấu đã bắt đầu hoặc đã đóng cổng dự đoán.');
    } else if (err instanceof InvalidWagerAmountError) {
      errorMsg = t('football:errors.invalid_wager_amount', err.message);
    } else if (err instanceof OddsNotFoundError) {
      errorMsg = t('football:errors.odds_not_found', 'Lựa chọn của bạn không có tỷ lệ cược hợp lệ.');
    } else if (err instanceof InsufficientBalanceError) {
      errorMsg = t('football:errors.insufficient_balance', 'Bạn không có đủ linh thạch để thực hiện giao dịch này.');
    }

    await interaction.reply({
      embeds: [buildErrorEmbed(errorMsg, shardId)],
      ephemeral: true,
    });
  }
}
