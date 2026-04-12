import { EmbedBuilder, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { eq, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { users } from '../../db/schema/users.js';
import { characters, type SpiritualRoot } from '../../db/schema/characters.js';
import { GAME_CONFIG } from '../../constants/game.js';
import { COLORS, embedFooter } from '../../ui/theme.js';
import { buildErrorEmbed } from '../../ui/embeds/buildErrorEmbed.js';
import { resolveLocale, getT } from '../../i18n/index.js';

/* eslint-disable i18next/no-literal-string -- slash command descriptions are static Discord API strings, not runtime i18n */
export const data = new SlashCommandBuilder()
  .setName('start')
  .setNameLocalizations({ 'en-US': 'start', 'zh-CN': 'start' })
  .setDescription('Bắt đầu hành trình tu tiên')
  .setDescriptionLocalizations({
    'en-US': 'Begin your cultivation journey',
    'zh-CN': '开始你的修仙旅程',
  });
/* eslint-enable i18next/no-literal-string */

/**
 * Roll spiritual root using weighted random selection.
 * Weights from GAME_CONFIG.SPIRITUAL_ROOT_WEIGHTS (sum = 100).
 * Kim: 15%, Hỏa: 20%, Mộc: 25%, Thủy: 25%, Thổ: 15%
 */
function rollSpiritualRoot(): SpiritualRoot {
  const weights = GAME_CONFIG.SPIRITUAL_ROOT_WEIGHTS;
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  let roll = Math.floor(Math.random() * total);
  for (const [root, weight] of Object.entries(weights)) {
    roll -= weight;
    if (roll < 0) return root as SpiritualRoot;
  }
  // Fallback — should never happen if weights sum correctly
  return 'tho';
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  // Check if user already has a character — prevent duplicate registration
  const existingChar = await db
    .select({ id: characters.id })
    .from(characters)
    .where(eq(characters.discordId, interaction.user.id))
    .limit(1);

  if (existingChar.length > 0) {
    // Fetch user locale for error message
    const existingUser = await db
      .select({ locale: users.locale })
      .from(users)
      .where(eq(users.discordId, interaction.user.id))
      .limit(1)
      .then((rows) => rows[0]);

    const locale = resolveLocale(existingUser?.locale, interaction.locale);
    const t = getT(locale);
    await interaction.editReply({
      embeds: [buildErrorEmbed(t('game:start.already_registered'))],
    });
    return;
  }

  // Look up or create user in users table
  let user = await db
    .select()
    .from(users)
    .where(eq(users.discordId, interaction.user.id))
    .limit(1)
    .then((rows) => rows[0]);

  if (!user) {
    const inserted = await db
      .insert(users)
      .values({ discordId: interaction.user.id })
      .returning();
    user = inserted[0]!;
  }

  const locale = resolveLocale(user.locale, interaction.locale);
  const t = getT(locale);

  // Roll spiritual root with weighted random
  const spiritualRoot = rollSpiritualRoot();

  // INSERT new character.
  // onConflictDoNothing guards against the rare concurrent /start race: the UNIQUE constraint
  // on discord_id ensures only one row is ever created; a second concurrent INSERT is a no-op.
  await db.insert(characters).values({
    userId: user.id,
    discordId: interaction.user.id,
    spiritualRoot,
    realmId: 0,
    tuVi: sql`0`,
    dailyTuvi: 0,
    professionPoints: {},
  }).onConflictDoNothing();

  // Build success embed with spiritual root reveal
  const rootName = t(`game:spiritual_root.${spiritualRoot}`);
  const embed = new EmbedBuilder()
    .setColor(COLORS.GOLD)
    .setTitle(t('game:start.welcome', { root: rootName }))
    .setDescription(t('game:start.welcome_flavor'))
    .setFooter(embedFooter());

  await interaction.editReply({ embeds: [embed] });
}
