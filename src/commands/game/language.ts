/**
 * /language — Set the user's preferred display language.
 *
 * Updates users.locale in the DB. Affects all subsequent command responses.
 * Supported locales: vi (default), en, zh-cn.
 *
 * The command itself responds in the NEW locale so the user immediately sees
 * the effect. If the locale is unchanged, responds in the current locale.
 */

/* eslint-disable i18next/no-literal-string -- slash command names/descriptions are Discord API static strings */
import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { users } from '../../db/schema/users.js';
import { buildSuccessEmbed } from '../../ui/embeds/buildSuccessEmbed.js';
import { buildErrorEmbed } from '../../ui/embeds/buildErrorEmbed.js';
import { resolveLocale, getT, SUPPORTED_LOCALES } from '../../i18n/index.js';
import type { SupportedLocale } from '../../i18n/index.js';

export const data = new SlashCommandBuilder()
  .setName('language')
  .setDescription('Đổi ngôn ngữ hiển thị')
  .setDescriptionLocalizations({
    'en-US': 'Change your display language',
    'zh-CN': '更改显示语言',
  })
  .addStringOption((opt) =>
    opt
      .setName('lang')
      .setDescription('Ngôn ngữ muốn dùng')
      .setDescriptionLocalizations({
        'en-US': 'Language to use',
        'zh-CN': '要使用的语言',
      })
      .setRequired(true)
      .addChoices(
        { name: 'Tiếng Việt', value: 'vi' },
        { name: 'English', value: 'en' },
        { name: '中文（简体）', value: 'zh-cn' },
      ),
  );
/* eslint-enable i18next/no-literal-string */

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const shardId = interaction.client.shard?.ids[0];
  const newLang = interaction.options.getString('lang', true) as SupportedLocale;

  // Validate — belt-and-suspenders (choices already constrain, but guard against future changes)
  if (!SUPPORTED_LOCALES.includes(newLang)) {
    const t = getT('vi');
    await interaction.editReply({
      embeds: [buildErrorEmbed(t('errors.internalError'), shardId)],
    });
    return;
  }

  // Upsert user record and get previous locale
  let user = await db
    .select({ locale: users.locale })
    .from(users)
    .where(eq(users.discordId, interaction.user.id))
    .limit(1)
    .then((rows) => rows[0]);

  if (!user) {
    // User doesn't exist yet — create with chosen locale
    const inserted = await db
      .insert(users)
      .values({ discordId: interaction.user.id, locale: newLang })
      .returning({ locale: users.locale });
    user = inserted[0]!;
  }

  const prevLocale = resolveLocale(user.locale, interaction.locale);

  // Respond in the NEW locale so user immediately sees the change
  const t = getT(newLang);
  const langName = t(`game:language.names.${newLang}`);

  if (prevLocale === newLang) {
    await interaction.editReply({
      embeds: [
        buildSuccessEmbed(
          t('game:language.title'),
          t('game:language.already_set', { lang: langName }),
          shardId,
        ),
      ],
    });
    return;
  }

  // Update locale in DB
  await db
    .update(users)
    .set({ locale: newLang })
    .where(eq(users.discordId, interaction.user.id));

  await interaction.editReply({
    embeds: [
      buildSuccessEmbed(
        t('game:language.title'),
        t('game:language.changed', { lang: langName }),
        shardId,
      ),
    ],
  });
}
