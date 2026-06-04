import { SlashCommandBuilder, type ChatInputCommandInteraction, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle, type ButtonInteraction, type ModalSubmitInteraction } from 'discord.js';
import { resolveLocale, getT } from '../../i18n/index.js';
import { db } from '../../db/client.js';
import { users } from '../../db/schema/users.js';
import { farmingAccounts } from '../../db/schema/farming.js';
import { EncryptionService } from '../../services/encryptionService.js';
import { eq } from 'drizzle-orm';
import { logger } from '../../utils/logger.js';

/* eslint-disable i18next/no-literal-string */
export const data = new SlashCommandBuilder()
  .setName('farming_setup')
  .setDescription('Setup the token provisioning service (Admin only)')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);
/* eslint-enable i18next/no-literal-string */

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
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
      .setEmoji('🌱')
  );

  await interaction.reply({ embeds: [embed], components: [row] });
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

  // Upsert into farming_accounts
  await db.insert(farmingAccounts)
    .values({
      userId: userRow.id,
      encryptedToken: encryptedData,
      iv: iv,
      tag: tag,
      keyVersion: keyVersion,
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
        status: 'active',
        updatedAt: new Date()
      }
    });

  // Trigger immediate worker loading/updating via IPC
  if (process.send) {
    process.send({ type: 'FARMING_ACCOUNT_UPDATED', userId: interaction.user.id });
  } else {
    logger.warn('Farming', 'process.send is undefined, cannot notify ShardingManager');
  }

  await interaction.reply({ content: t('game:farming.success.token_saved'), ephemeral: true });
}
