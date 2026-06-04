import { SlashCommandBuilder, type ChatInputCommandInteraction, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, type ButtonInteraction, type ModalSubmitInteraction } from 'discord.js';
import { resolveLocale, getT } from '../../i18n/index.js';
import { db } from '../../db/client.js';
import { users } from '../../db/schema/users.js';
import { farmingAccounts } from '../../db/schema/farming.js';
import { EncryptionService } from '../../services/encryptionService.js';
import { eq } from 'drizzle-orm';
import { logger } from '../../utils/logger.js';
import { isAuthorizedAdmin } from '../../utils/adminGuard.js';
import { ProxyService } from '../../services/farming/proxyService.js';
import { createFarmingChannel, deleteFarmingChannel } from '../../services/farming/channelService.js';

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

    const [userRow] = await db.select({ locale: users.locale }).from(users).where(eq(users.discordId, interaction.user.id));
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
        .setEmoji('👑')
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
    
    if (!account) {
      await interaction.reply({ content: t('game:farming.errors.no_account'), ephemeral: true });
      return;
    }
    
    const embed = new EmbedBuilder()
      .setTitle(t('game:farming.status.title'))
      .addFields(
        { name: t('game:farming.status.state'), value: String(account.status), inline: true },
        { name: t('game:farming.status.proxy'), value: account.proxy ? account.proxy.url : 'None', inline: true },
        { name: t('game:farming.status.worker'), value: String(account.workerId || 'Unassigned'), inline: true }
      )
      .setColor(account.status === 'active' ? 0x00FF00 : (account.status === 'captcha_waiting' ? 0xFF0000 : 0xFFFF00));
      
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
  const [userRow] = await db.select({ locale: users.locale }).from(users).where(eq(users.discordId, interaction.user.id));
  const locale = resolveLocale(userRow?.locale, interaction.locale);
  const t = getT(locale);

  await interaction.reply({ content: t('game:farming.setup.buy_under_development'), ephemeral: true });
}

export async function handleFarmingBuyMonthlyButton(interaction: ButtonInteraction): Promise<void> {
  const [userRow] = await db.select({ locale: users.locale }).from(users).where(eq(users.discordId, interaction.user.id));
  const locale = resolveLocale(userRow?.locale, interaction.locale);
  const t = getT(locale);

  await interaction.reply({ content: t('game:farming.setup.buy_under_development'), ephemeral: true });
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

  const account = await db.query.farmingAccounts.findFirst({
    where: eq(farmingAccounts.userId, userRow.id),
  });

  if (account?.channelId) {
    await deleteFarmingChannel(interaction.client, account.channelId);
  }

  const newChannelId = await createFarmingChannel(interaction.client, interaction.user.id);

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
