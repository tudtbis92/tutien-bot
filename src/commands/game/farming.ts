import { SlashCommandBuilder, type ChatInputCommandInteraction, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, type ButtonInteraction, type ModalSubmitInteraction } from 'discord.js';
import { resolveLocale, getT } from '../../i18n/index.js';
import { db } from '../../db/client.js';
import { users } from '../../db/schema/users.js';
import { farmingAccounts, farmingSubscriptions } from '../../db/schema/farming.js';
import { EncryptionService } from '../../services/encryptionService.js';
import { eq } from 'drizzle-orm';
import { logger } from '../../utils/logger.js';
import { isAuthorizedAdmin } from '../../utils/adminGuard.js';
import { ProxyService } from '../../services/farming/proxyService.js';
import { createFarmingChannel, deleteFarmingChannel, getUserIdFromToken } from '../../services/farming/channelService.js';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';

dayjs.extend(utc);

/* eslint-disable i18next/no-literal-string */
export const data = new SlashCommandBuilder()
  .setName('farming')
  .setDescription('Manage your farming bot')
  .addSubcommand(subcommand =>
    subcommand
      .setName('setup')
      .setDescription('Setup the token provisioning service (Admin only)')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('status')
      .setDescription('Check your farming bot status')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('stop')
      .setDescription('Stop farming and delete your private farming channel')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('resume')
      .setDescription('Resume farming after solving a captcha')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('buy')
      .setDescription('Purchase or upgrade a farming subscription')
  );
/* eslint-enable i18next/no-literal-string */

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const subcommand = interaction.options.getSubcommand();
  
  if (subcommand === 'setup') {
    if (!isAuthorizedAdmin(interaction)) {
      const t = getT(resolveLocale(undefined, interaction.locale));
      await interaction.reply({ content: t('game:farming.errors.unauthorized'), ephemeral: true });
      return;
    }

    const [userRow] = await db.select({ id: users.id, locale: users.locale }).from(users).where(eq(users.discordId, interaction.user.id));
    const locale = resolveLocale(userRow?.locale, interaction.locale);
    const t = getT(locale);

    const embed = new EmbedBuilder()
      .setTitle(t('game:farming.setup.title'))
      .setDescription(t('game:farming.setup.description'))
      .setColor(0x00FF00);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('farming:start')
        .setLabel(t('game:farming.setup.button_label'))
        .setStyle(ButtonStyle.Success)
        .setEmoji('🌱'),
      new ButtonBuilder()
        .setCustomId('farming:buy_weekly')
        .setLabel(t('game:farming.setup.button_buy_weekly'))
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🎫'),
      new ButtonBuilder()
        .setCustomId('farming:buy_monthly')
        .setLabel(t('game:farming.setup.button_buy_monthly'))
        .setStyle(ButtonStyle.Primary)
        .setEmoji('👑'),
      new ButtonBuilder()
        .setCustomId('farming:buy_vip_monthly')
        // eslint-disable-next-line i18next/no-literal-string
        .setLabel('Mua Gói VIP (30 Ngày)')
        .setStyle(ButtonStyle.Success)
        .setEmoji('🌟')
    );

    const sub = await db.query.farmingSubscriptions.findFirst({
      where: eq(farmingSubscriptions.userId, userRow.id),
    });

    if (sub?.planType === 'basic' && sub.expiresAt) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId('farming:upgrade_vip')
          // eslint-disable-next-line i18next/no-literal-string
          .setLabel('Nâng cấp VIP / Upgrade VIP')
          .setStyle(ButtonStyle.Success)
          .setEmoji('💎')
      );
    }

    const planName = sub ? t(`game:farming.subscription.types.${sub.planType}`) : t('game:farming.subscription.types.free');
    // eslint-disable-next-line i18next/no-literal-string
    const expiryStr = sub?.expiresAt ? dayjs.utc(sub.expiresAt).format('YYYY-MM-DD HH:mm:ss [UTC]') : 'N/A';
    
    embed.addFields(
      { name: t('game:farming.subscription.status'), value: planName, inline: true },
      { name: t('game:farming.subscription.expiry'), value: expiryStr, inline: true }
    );

    await interaction.reply({ embeds: [embed], components: [row] });
  } else if (subcommand === 'status') {
    const [userRow] = await db.select({ id: users.id, locale: users.locale }).from(users).where(eq(users.discordId, interaction.user.id));
    const locale = resolveLocale(userRow?.locale, interaction.locale);
    const t = getT(locale);
    
    if (!userRow) {
      await interaction.reply({ content: t('game:farming.errors.not_registered'), ephemeral: true });
      return;
    }
    
    const account = await db.query.farmingAccounts.findFirst({
      where: eq(farmingAccounts.userId, userRow.id),
      with: {
        proxy: true,
      }
    });
    
    const sub = await db.query.farmingSubscriptions.findFirst({
      where: eq(farmingSubscriptions.userId, userRow.id),
    });

    const planName = sub ? t(`game:farming.subscription.types.${sub.planType}`) : t('game:farming.subscription.types.free');
    // eslint-disable-next-line i18next/no-literal-string
    const expiryStr = sub?.expiresAt ? dayjs.utc(sub.expiresAt).format('YYYY-MM-DD HH:mm:ss [UTC]') : 'N/A';

    const embed = new EmbedBuilder()
      .setTitle(t('game:farming.status.title'))
      .addFields(
        { name: t('game:farming.status.state'), value: account ? String(account.status) : 'No Account', inline: true },
        { name: t('game:farming.status.proxy'), value: account?.proxy ? account.proxy.url : 'None', inline: true },
        { name: t('game:farming.status.worker'), value: account?.workerId ? String(account.workerId) : 'Unassigned', inline: true },
        { name: t('game:farming.subscription.status'), value: planName, inline: true },
        { name: t('game:farming.subscription.expiry'), value: expiryStr, inline: true }
      )
      .setColor(account?.status === 'active' ? 0x00FF00 : (account?.status === 'captcha_waiting' ? 0xFF0000 : 0xFFFF00));
      
    await interaction.reply({ embeds: [embed], ephemeral: true });
  } else if (subcommand === 'resume') {
    const [userRow] = await db.select({ id: users.id, locale: users.locale }).from(users).where(eq(users.discordId, interaction.user.id));
    const locale = resolveLocale(userRow?.locale, interaction.locale);
    const t = getT(locale);
    
    if (!userRow) {
      await interaction.reply({ content: t('game:farming.errors.not_registered'), ephemeral: true });
      return;
    }
    
    const account = await db.query.farmingAccounts.findFirst({
      where: eq(farmingAccounts.userId, userRow.id),
    });
    
    if (!account) {
      await interaction.reply({ content: t('game:farming.errors.no_account'), ephemeral: true });
      return;
    }
    
    if (account.status !== 'captcha_waiting' && account.status !== 'stopped') {
      await interaction.reply({ content: t('game:farming.resume.already_active'), ephemeral: true });
      return;
    }
    
    await db.update(farmingAccounts)
      .set({ status: 'active', updatedAt: new Date() })
      .where(eq(farmingAccounts.userId, userRow.id));
      
    if (process.send) {
      process.send({ type: 'FARMING_ACCOUNT_UPDATED', userId: interaction.user.id });
    }
    
    await interaction.reply({ content: t('game:farming.resume.success'), ephemeral: true });
  } else if (subcommand === 'stop') {
    const [userRow] = await db.select({ id: users.id, locale: users.locale }).from(users).where(eq(users.discordId, interaction.user.id));
    const locale = resolveLocale(userRow?.locale, interaction.locale);
    const t = getT(locale);
    
    if (!userRow) {
      await interaction.reply({ content: t('game:farming.errors.not_registered'), ephemeral: true });
      return;
    }
    
    const account = await db.query.farmingAccounts.findFirst({
      where: eq(farmingAccounts.userId, userRow.id),
    });
    
    if (!account) {
      await interaction.reply({ content: t('game:farming.errors.no_account'), ephemeral: true });
      return;
    }
    
    if (account.channelId) {
      await deleteFarmingChannel(interaction.client, account.channelId);
    }
    
    await db.update(farmingAccounts)
      .set({ status: 'stopped', channelId: null, updatedAt: new Date() })
      .where(eq(farmingAccounts.userId, userRow.id));
      
    if (process.send) {
      process.send({ type: 'FARMING_ACCOUNT_UPDATED', userId: interaction.user.id });
    }
    
    // eslint-disable-next-line i18next/no-literal-string
    await interaction.reply({ content: t('game:farming.status.state') + ': stopped', ephemeral: true });
  } else if (subcommand === 'buy') {
    const [userRow] = await db.select({ id: users.id, locale: users.locale, balance: users.balance }).from(users).where(eq(users.discordId, interaction.user.id));
    const locale = resolveLocale(userRow?.locale, interaction.locale);
    const t = getT(locale);
    
    if (!userRow) {
      await interaction.reply({ content: t('game:farming.errors.not_registered'), ephemeral: true });
      return;
    }

    const sub = await db.query.farmingSubscriptions.findFirst({
      where: eq(farmingSubscriptions.userId, userRow.id),
    });

    const planName = sub ? t(`game:farming.subscription.types.${sub.planType}`) : t('game:farming.subscription.types.free');
    // eslint-disable-next-line i18next/no-literal-string
    const expiryStr = sub?.expiresAt ? dayjs.utc(sub.expiresAt).format('YYYY-MM-DD HH:mm:ss [UTC]') : 'N/A';

    const embed = new EmbedBuilder()
      .setTitle(t('game:farming.subscription.title'))
      .setDescription(t('game:farming.setup.description'))
      .addFields(
        { name: t('game:profile.balance'), value: String(userRow.balance), inline: true },
        { name: t('game:farming.subscription.status'), value: planName, inline: true },
        { name: t('game:farming.subscription.expiry'), value: expiryStr, inline: true }
      )
      .setColor(0x00AAFF);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('farming:buy_weekly')
        .setLabel(t('game:farming.setup.button_buy_weekly'))
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🎫'),
      new ButtonBuilder()
        .setCustomId('farming:buy_monthly')
        .setLabel(t('game:farming.setup.button_buy_monthly'))
        .setStyle(ButtonStyle.Primary)
        .setEmoji('👑'),
      new ButtonBuilder()
        .setCustomId('farming:buy_vip_monthly')
        // eslint-disable-next-line i18next/no-literal-string
        .setLabel('Mua Gói VIP (30 Ngày)')
        .setStyle(ButtonStyle.Success)
        .setEmoji('🌟')
    );

    if (sub?.planType === 'basic' && sub.expiresAt) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId('farming:upgrade_vip')
          // eslint-disable-next-line i18next/no-literal-string
          .setLabel('Nâng cấp VIP / Upgrade VIP')
          .setStyle(ButtonStyle.Success)
          .setEmoji('💎')
      );
    }

    await interaction.reply({ embeds: [embed], components: [row] });
  }
}

export async function handleFarmingStartButton(interaction: ButtonInteraction): Promise<void> {
  const [userRow] = await db.select({ id: users.id, locale: users.locale }).from(users).where(eq(users.discordId, interaction.user.id));
  const locale = resolveLocale(userRow?.locale, interaction.locale);
  const t = getT(locale);
  
  if (!userRow) {
    await interaction.reply({ content: t('game:farming.errors.not_registered'), ephemeral: true });
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId('farming:token_modal')
    .setTitle(t('game:farming.setup.modal_title'));

  const tokenInput = new TextInputBuilder()
    .setCustomId('token_input')
    .setLabel(t('game:farming.setup.token_label'))
    .setPlaceholder(t('game:farming.setup.token_placeholder'))
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMinLength(50); // Basic length check

  const actionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(tokenInput);
  modal.addComponents(actionRow);

  await interaction.showModal(modal);
}

export async function handleFarmingBuyWeeklyButton(interaction: ButtonInteraction): Promise<void> {
  const [userRow] = await db.select({ id: users.id, locale: users.locale, balance: users.balance }).from(users).where(eq(users.discordId, interaction.user.id));
  const locale = resolveLocale(userRow?.locale, interaction.locale);
  const t = getT(locale);

  if (!userRow) return;

  const sub = await db.query.farmingSubscriptions.findFirst({
    where: eq(farmingSubscriptions.userId, userRow.id),
  });

  const price = 10000n;
  const embed = new EmbedBuilder()
    .setTitle(t('game:farming.subscription.title'))
     
    .setDescription(`**Gói 7 Ngày / Weekly Plan**\nGiá / Price: ${price} Linh Thạch\n${t('game:profile.balance')}: ${userRow.balance}\n\n${sub ? t('game:farming.subscription.overwrite_warning') : ''}`)
    .setColor(0xFFFF00);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('farming:confirm_buy_weekly')
      // eslint-disable-next-line i18next/no-literal-string
      .setLabel('Xác nhận / Confirm')
      .setStyle(ButtonStyle.Success)
  );

  await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
}

export async function handleFarmingBuyMonthlyButton(interaction: ButtonInteraction): Promise<void> {
  const [userRow] = await db.select({ id: users.id, locale: users.locale, balance: users.balance }).from(users).where(eq(users.discordId, interaction.user.id));
  const locale = resolveLocale(userRow?.locale, interaction.locale);
  const t = getT(locale);

  if (!userRow) return;

  const sub = await db.query.farmingSubscriptions.findFirst({
    where: eq(farmingSubscriptions.userId, userRow.id),
  });

  const price = 35000n;
  const embed = new EmbedBuilder()
    .setTitle(t('game:farming.subscription.title'))
     
    .setDescription(`**Gói 30 Ngày / Monthly Plan**\nGiá / Price: ${price} Linh Thạch\n${t('game:profile.balance')}: ${userRow.balance}\n\n${sub ? t('game:farming.subscription.overwrite_warning') : ''}`)
    .setColor(0xFFFF00);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('farming:confirm_buy_monthly')
      // eslint-disable-next-line i18next/no-literal-string
      .setLabel('Xác nhận / Confirm')
      .setStyle(ButtonStyle.Success)
  );

  await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
}

export async function handleFarmingBuyVipMonthlyButton(interaction: ButtonInteraction): Promise<void> {
  const [userRow] = await db.select({ id: users.id, locale: users.locale, balance: users.balance }).from(users).where(eq(users.discordId, interaction.user.id));
  const locale = resolveLocale(userRow?.locale, interaction.locale);
  const t = getT(locale);

  if (!userRow) return;

  const sub = await db.query.farmingSubscriptions.findFirst({
    where: eq(farmingSubscriptions.userId, userRow.id),
  });

  const price = 50000n;
  const embed = new EmbedBuilder()
    .setTitle(t('game:farming.subscription.title'))
    .setDescription(`**Gói VIP 30 Ngày / 30D VIP Plan**\nGiá / Price: ${price} Linh Thạch\n${t('game:profile.balance')}: ${userRow.balance}\n\n${sub ? t('game:farming.subscription.overwrite_warning') : ''}`)
    .setColor(0xFFFF00);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('farming:confirm_buy_vip_monthly')
      // eslint-disable-next-line i18next/no-literal-string
      .setLabel('Xác nhận / Confirm')
      .setStyle(ButtonStyle.Success)
  );

  await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
}

export async function handleFarmingUpgradeVIPButton(interaction: ButtonInteraction): Promise<void> {
  const [userRow] = await db.select({ id: users.id, locale: users.locale, balance: users.balance }).from(users).where(eq(users.discordId, interaction.user.id));
  const locale = resolveLocale(userRow?.locale, interaction.locale);
  const t = getT(locale);

  if (!userRow) return;

  const sub = await db.query.farmingSubscriptions.findFirst({
    where: eq(farmingSubscriptions.userId, userRow.id),
  });

  if (!sub || sub.planType !== 'basic' || !sub.expiresAt) {
    // eslint-disable-next-line i18next/no-literal-string
    await interaction.reply({ content: 'Invalid upgrade state.', ephemeral: true });
    return;
  }

  const { FarmingSubscriptionService } = await import('../../services/farming/subscriptionService.js');
  const fee = FarmingSubscriptionService.calculateUpgradeFee(sub.expiresAt);

  const embed = new EmbedBuilder()
    .setTitle(t('game:farming.subscription.title'))
     
    .setDescription(`**Nâng cấp VIP / Upgrade VIP**\n${t('game:farming.subscription.upgrade_fee', { fee: fee.toString() })}\n${t('game:profile.balance')}: ${userRow.balance}`)
    .setColor(0xFFFF00);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('farming:confirm_upgrade_vip')
      // eslint-disable-next-line i18next/no-literal-string
      .setLabel('Xác nhận / Confirm')
      .setStyle(ButtonStyle.Success)
  );

  await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
}

export async function handleFarmingTokenModal(interaction: ModalSubmitInteraction): Promise<void> {
  const [userRow] = await db.select({ id: users.id, locale: users.locale }).from(users).where(eq(users.discordId, interaction.user.id));
  const locale = resolveLocale(userRow?.locale, interaction.locale);
  const t = getT(locale);

  const token = interaction.fields.getTextInputValue('token_input');
  
  // Basic format validation
  if (!token || token.length < 50) {
    await interaction.reply({ content: t('game:farming.errors.invalid_token'), ephemeral: true });
    return;
  }

  // Encrypt token
  const keyVersion = process.env.ACTIVE_FARM_KEY_VERSION || 'v1';
  let encryptedData, iv, tag;
  try {
    const encrypted = EncryptionService.encrypt(token, keyVersion);
    encryptedData = encrypted.encryptedData;
    iv = encrypted.iv;
    tag = encrypted.tag;
  } catch (error) {
    logger.error('Farming', 'Failed to encrypt token', error);
    await interaction.reply({ content: t('game:farming.errors.encryption_failed'), ephemeral: true });
    return;
  }

  if (!userRow) {
    await interaction.reply({ content: t('game:farming.errors.user_not_found'), ephemeral: true });
    return;
  }

  const selfBotId = getUserIdFromToken(token);
  if (!selfBotId) {
    await interaction.reply({ content: t('game:farming.errors.invalid_token'), ephemeral: true });
    return;
  }

  const account = await db.query.farmingAccounts.findFirst({
    where: eq(farmingAccounts.userId, userRow.id),
  });

  if (account?.channelId) {
    await deleteFarmingChannel(interaction.client, account.channelId);
  }

  const newChannelId = await createFarmingChannel(interaction.client, interaction.user.id, selfBotId);

  // Upsert into farming_accounts
  await db.insert(farmingAccounts)
    .values({
      userId: userRow.id,
      encryptedToken: encryptedData,
      iv: iv,
      tag: tag,
      keyVersion: keyVersion,
      channelId: newChannelId,
      status: 'active',
      updatedAt: new Date()
    })
    .onConflictDoUpdate({
      target: farmingAccounts.userId,
      set: {
        encryptedToken: encryptedData,
        iv: iv,
        tag: tag,
        keyVersion: keyVersion,
        channelId: newChannelId,
        status: 'active',
        updatedAt: new Date()
      }
    });

  if (!account?.proxyId) {
    const proxyUrl = await ProxyService.assignProxy(userRow.id);
    if (!proxyUrl) {
      logger.warn('Farming', `No proxy available for user ${userRow.id}`);
    }
  }

  // Trigger immediate worker loading/updating via IPC
  if (process.send) {
    process.send({ type: 'FARMING_ACCOUNT_UPDATED', userId: interaction.user.id });
  } else {
    logger.warn('Farming', 'process.send is undefined, cannot notify ShardingManager');
  }

  await interaction.reply({ content: t('game:farming.success.token_saved'), ephemeral: true });
}

export async function handleConfirmBuyWeekly(interaction: ButtonInteraction): Promise<void> {
  const [userRow] = await db.select({ id: users.id, locale: users.locale }).from(users).where(eq(users.discordId, interaction.user.id));
  const locale = resolveLocale(userRow?.locale, interaction.locale);
  const t = getT(locale);
  if (!userRow) return;

  const { FarmingSubscriptionService } = await import('../../services/farming/subscriptionService.js');
  try {
    const expiresAt = await FarmingSubscriptionService.purchasePlan(userRow.id, 'basic', 7);
    if (process.send) {
      process.send({ type: 'FARMING_ACCOUNT_UPDATED', userId: interaction.user.id });
    }
    await interaction.update({ content: t('game:farming.subscription.success', { expiry: dayjs.utc(expiresAt).format('YYYY-MM-DD HH:mm:ss [UTC]') }), embeds: [], components: [] });
  } catch (error) {
    if (error instanceof Error && error.message === 'INSUFFICIENT_BALANCE') {
      await interaction.update({ content: t('game:farming.subscription.insufficient_balance', { required: '10000', current: '?' }), embeds: [], components: [] });
    } else {
      logger.error('Farming', 'Failed to purchase weekly plan', error);
      // eslint-disable-next-line i18next/no-literal-string
      await interaction.update({ content: 'Transaction failed.', embeds: [], components: [] });
    }
  }
}

export async function handleConfirmBuyMonthly(interaction: ButtonInteraction): Promise<void> {
  const [userRow] = await db.select({ id: users.id, locale: users.locale }).from(users).where(eq(users.discordId, interaction.user.id));
  const locale = resolveLocale(userRow?.locale, interaction.locale);
  const t = getT(locale);
  if (!userRow) return;

  const { FarmingSubscriptionService } = await import('../../services/farming/subscriptionService.js');
  try {
    const expiresAt = await FarmingSubscriptionService.purchasePlan(userRow.id, 'basic', 30);
    if (process.send) {
      process.send({ type: 'FARMING_ACCOUNT_UPDATED', userId: interaction.user.id });
    }
    await interaction.update({ content: t('game:farming.subscription.success', { expiry: dayjs.utc(expiresAt).format('YYYY-MM-DD HH:mm:ss [UTC]') }), embeds: [], components: [] });
  } catch (error) {
    if (error instanceof Error && error.message === 'INSUFFICIENT_BALANCE') {
      await interaction.update({ content: t('game:farming.subscription.insufficient_balance', { required: '35000', current: '?' }), embeds: [], components: [] });
    } else {
      logger.error('Farming', 'Failed to purchase monthly plan', error);
      // eslint-disable-next-line i18next/no-literal-string
      await interaction.update({ content: 'Transaction failed.', embeds: [], components: [] });
    }
  }
}

export async function handleConfirmBuyVipMonthly(interaction: ButtonInteraction): Promise<void> {
  const [userRow] = await db.select({ id: users.id, locale: users.locale }).from(users).where(eq(users.discordId, interaction.user.id));
  const locale = resolveLocale(userRow?.locale, interaction.locale);
  const t = getT(locale);
  if (!userRow) return;

  const { FarmingSubscriptionService } = await import('../../services/farming/subscriptionService.js');
  try {
    const expiresAt = await FarmingSubscriptionService.purchasePlan(userRow.id, 'premium', 30);
    if (process.send) {
      process.send({ type: 'FARMING_ACCOUNT_UPDATED', userId: interaction.user.id });
    }
    await interaction.update({ content: t('game:farming.subscription.success', { expiry: dayjs.utc(expiresAt).format('YYYY-MM-DD HH:mm:ss [UTC]') }), embeds: [], components: [] });
  } catch (error) {
    if (error instanceof Error && error.message === 'INSUFFICIENT_BALANCE') {
      await interaction.update({ content: t('game:farming.subscription.insufficient_balance', { required: '50000', current: '?' }), embeds: [], components: [] });
    } else {
      logger.error('Farming', 'Failed to purchase VIP monthly plan', error);
      // eslint-disable-next-line i18next/no-literal-string
      await interaction.update({ content: 'Transaction failed.', embeds: [], components: [] });
    }
  }
}

export async function handleConfirmUpgradeVIP(interaction: ButtonInteraction): Promise<void> {
  const [userRow] = await db.select({ id: users.id, locale: users.locale }).from(users).where(eq(users.discordId, interaction.user.id));
  const locale = resolveLocale(userRow?.locale, interaction.locale);
  const t = getT(locale);
  if (!userRow) return;

  const { FarmingSubscriptionService } = await import('../../services/farming/subscriptionService.js');
  try {
    const expiresAt = await FarmingSubscriptionService.upgradePlan(userRow.id);
    if (process.send) {
      process.send({ type: 'FARMING_ACCOUNT_UPDATED', userId: interaction.user.id });
    }
    await interaction.update({ content: t('game:farming.subscription.success', { expiry: dayjs.utc(expiresAt).format('YYYY-MM-DD HH:mm:ss [UTC]') }), embeds: [], components: [] });
  } catch (error) {
    if (error instanceof Error && error.message === 'INSUFFICIENT_BALANCE') {
      await interaction.update({ content: t('game:farming.subscription.insufficient_balance', { required: '?', current: '?' }), embeds: [], components: [] });
    } else {
      logger.error('Farming', 'Failed to upgrade VIP plan', error);
      // eslint-disable-next-line i18next/no-literal-string
      await interaction.update({ content: 'Transaction failed.', embeds: [], components: [] });
    }
  }
}
