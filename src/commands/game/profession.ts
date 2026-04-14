/**
 * /profession — Profession allocation command.
 *
 * Subcommands:
 *  - view: View all 10 professions with current skill point allocations
 *  - allocate: Allocate skill points to a specific profession
 *
 * Business rules:
 *  - Total available points = char.realmId (lifetime total, 1 per tier advanced, per D-24)
 *  - Total allocated can never exceed realmId (no over-allocation)
 *  - No respec — points only increase, never decrease (per D-24)
 *  - Zod validates JSONB profession_points on every read (T-02-PROF-04)
 *
 * Threat model mitigations:
 *  - T-02-PROF-01: totalAllocated + amount <= realmId enforced before write
 *  - T-02-PROF-02: SlashCommandBuilder choices constrain to PROFESSION_KEYS; runtime check as backstop
 *  - T-02-PROF-03: setMinValue(1) — Discord rejects < 1
 *  - T-02-PROF-04: ProfessionPointsSchema.safeParse() on every DB read
 */

/* eslint-disable i18next/no-literal-string -- slash command names/descriptions are Discord API static strings */
import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { characters } from '../../db/schema/characters.js';
import {
  PROFESSION_KEYS,
  ProfessionPointsSchema,
  getTotalProfessionPoints,
} from '../../types/professions.js';
import type { ProfessionKey } from '../../types/professions.js';
import { buildProfessionEmbed } from '../../ui/embeds/buildProfessionEmbed.js';
import { buildErrorEmbed } from '../../ui/embeds/buildErrorEmbed.js';
import { buildSuccessEmbed } from '../../ui/embeds/buildSuccessEmbed.js';
import { fetchCommandContext } from '../../utils/commandContext.js';

// Static profession name map for SlashCommandBuilder choices (evaluated at module load).
// Choices must be static strings — cannot use t() at build time.
const PROFESSION_CHOICE_NAMES: Record<ProfessionKey, string> = {
  luyen_dan: 'Luyện Đan',
  luyen_khi_nc: 'Luyện Khí',
  tran_phap: 'Trận Pháp',
  linh_tru: 'Linh Trù',
  luyen_co: 'Luyện Cổ',
  duoc_su: 'Dược Sư',
  thuan_thu: 'Thuần Thú',
  luyen_kim: 'Luyện Kim',
  phu_su: 'Phù Sư',
  thuat_su: 'Thuật Sư',
};

export const data = new SlashCommandBuilder()
  .setName('profession')
  .setNameLocalizations({ vi: 'nghề_nghiệp', 'zh-CN': 'profession' })
  .setDescription('Quản lý nghề nghiệp tu sĩ')
  .setDescriptionLocalizations({
    'en-US': 'Manage cultivator professions',
    'zh-CN': '管理修仙职业',
  })
  .addSubcommand((sub) =>
    sub
      .setName('view')
      .setNameLocalizations({ vi: 'xem', 'zh-CN': 'view' })
      .setDescription('Xem nghề nghiệp của bạn')
      .setDescriptionLocalizations({
        'en-US': 'View your profession allocations',
        'zh-CN': '查看你的职业分配',
      }),
  )
  .addSubcommand((sub) =>
    sub
      .setName('allocate')
      .setNameLocalizations({ vi: 'phân_bổ', 'zh-CN': 'allocate' })
      .setDescription('Phân bổ điểm kỹ năng')
      .setDescriptionLocalizations({
        'en-US': 'Allocate skill points',
        'zh-CN': '分配技能点',
      })
      .addStringOption((opt) =>
        opt
          .setName('profession')
          .setNameLocalizations({ vi: 'nghề', 'zh-CN': 'profession' })
          .setDescription('Tên nghề nghiệp')
          .setDescriptionLocalizations({
            'en-US': 'Profession name',
            'zh-CN': '职业名称',
          })
          .setRequired(true)
          .addChoices(
            ...PROFESSION_KEYS.map((k) => ({
              name: PROFESSION_CHOICE_NAMES[k],
              value: k,
            })),
          ),
      )
      .addIntegerOption((opt) =>
        opt
          .setName('points')
          .setNameLocalizations({ vi: 'điểm', 'zh-CN': 'points' })
          .setDescription('Số điểm muốn phân bổ')
          .setDescriptionLocalizations({
            'en-US': 'Number of points to allocate',
            'zh-CN': '要分配的点数',
          })
          .setMinValue(1)
          .setRequired(true),
      ),
  );
/* eslint-enable i18next/no-literal-string */

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  const { t, char, shardId } = await fetchCommandContext(interaction);

  if (!char) {
    await interaction.editReply({
      embeds: [buildErrorEmbed(t('game:start.not_registered'), shardId)],
    });
    return;
  }

  // Validate JSONB on every read — T-02-PROF-04: strips unknown keys, coerces NaN to 0
  const points =
    ProfessionPointsSchema.safeParse(char.professionPoints ?? {}).data ?? {};

  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'view') {
    await interaction.editReply({
      embeds: [
        buildProfessionEmbed(
          { points, realmId: char.realmId },
          t,
          shardId,
        ),
      ],
    });
    return;
  }

  if (subcommand === 'allocate') {
    const prof = interaction.options.getString('profession', true) as ProfessionKey;
    const amount = interaction.options.getInteger('points', true);

    // T-02-PROF-02: Belt-and-suspenders validation (choices already constrain, but runtime check added)
    if (!PROFESSION_KEYS.includes(prof)) {
      await interaction.editReply({
        embeds: [buildErrorEmbed(t('game:start.not_registered'), shardId)],
      });
      return;
    }

    const totalAllocated = getTotalProfessionPoints(points);
    const totalAvailable = char.realmId;

    // T-02-PROF-01: Enforce cap — never allow totalAllocated to exceed realmId
    if (totalAllocated + amount > totalAvailable) {
      await interaction.editReply({
        embeds: [buildErrorEmbed(t('game:profession.insufficient_points'), shardId)],
      });
      return;
    }

    // Build updated points — no respec (only increase, per D-24)
    const updatedPoints = {
      ...points,
      [prof]: (points[prof] ?? 0) + amount,
    };

    // Persist atomically to characters.profession_points
    await db
      .update(characters)
      .set({ professionPoints: updatedPoints })
      .where(eq(characters.id, char.id));

    const profName = t(`game:profession.names.${prof}`);
    await interaction.editReply({
      embeds: [
        buildSuccessEmbed(
          t('game:profession.title'),
          t('game:profession.allocated', { amount, profession: profName }),
          shardId,
        ),
      ],
    });
    return;
  }
}
