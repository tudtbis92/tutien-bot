import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { eq, and } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { predictionChannels } from '../../db/schema/predictionChannels.js';
import { CURATED_LEAGUES } from '../../constants/footballLeagues.js';
import { fetchCommandContext } from '../../utils/commandContext.js';
import { buildErrorEmbed } from '../../ui/embeds/buildErrorEmbed.js';
import { buildSuccessEmbed } from '../../ui/embeds/buildSuccessEmbed.js';

/* eslint-disable i18next/no-literal-string -- slash commands name/description are static Discord API strings */
export const data = new SlashCommandBuilder()
  .setName('config')
  .setNameLocalizations({
    'en-US': 'config',
    'zh-CN': 'config',
  })
  .setDescription('Cấu hình các cài đặt cho hệ thống Tu Tiên')
  .setDescriptionLocalizations({
    'en-US': 'Configure system settings for Tu Tiên',
    'zh-CN': '配置修仙系统设置',
  })
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand((subcommand) =>
    subcommand
      .setName('predictions')
      .setNameLocalizations({
        'en-US': 'predictions',
        'zh-CN': 'predictions',
      })
      .setDescription('Cấu hình kênh nhận thông tin và cược bóng đá')
      .setDescriptionLocalizations({
        'en-US': 'Configure football prediction announcement and betting channel',
        'zh-CN': '配置足球预测公告和投注频道',
      })
      .addStringOption((option) =>
        option
          .setName('action')
          .setNameLocalizations({
            'en-US': 'action',
            'zh-CN': 'action',
          })
          .setDescription('Hành động cần thực hiện (on/off/league)')
          .setDescriptionLocalizations({
            'en-US': 'Action to perform (on/off/league)',
            'zh-CN': '要执行的操作 (on/off/league)',
          })
          .setRequired(true)
          .addChoices(
            { name: 'on (Bật kênh cược)', value: 'on' },
            { name: 'off (Tắt kênh cược)', value: 'off' },
            { name: 'league (Bật/Tắt giải đấu)', value: 'league' }
          )
      )
      .addStringOption((option) =>
        option
          .setName('league')
          .setNameLocalizations({
            'en-US': 'league',
            'zh-CN': 'league',
          })
          .setDescription('Giải đấu cần bật/tắt (chỉ dùng với action là league)')
          .setDescriptionLocalizations({
            'en-US': 'League to toggle (only used with league action)',
            'zh-CN': '要切换的联赛（仅在操作为 league 时使用）',
          })
          .setRequired(false)
          .addChoices(
            ...CURATED_LEAGUES.map((league) => ({
              name: `${league.name} (${league.country})`,
              value: String(league.id),
            }))
          )
      )
  );
/* eslint-enable i18next/no-literal-string */

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  const { t, shardId } = await fetchCommandContext(interaction);

  // Guild guard
  if (!interaction.guildId || !interaction.channelId) {
    await interaction.editReply({
      embeds: [buildErrorEmbed(t('common:errors.guild_only', 'This command can only be used in a server.'), shardId)],
    });
    return;
  }

  // Admin permission guard
  const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
  if (!isAdmin) {
    await interaction.editReply({
      embeds: [buildErrorEmbed(t('football:config.admin_only'), shardId)],
    });
    return;
  }

  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'predictions') {
    const action = interaction.options.getString('action', true);
    const leagueIdStr = interaction.options.getString('league');
    const channelId = interaction.channelId;
    const guildId = interaction.guildId;

    if (action === 'league' && !leagueIdStr) {
      await interaction.editReply({
        embeds: [buildErrorEmbed(t('football:config.league_required'), shardId)],
      });
      return;
    }

    if (action === 'on') {
      await db
        .insert(predictionChannels)
        .values({
          guildId,
          channelId,
          leagueId: 0,
          enabled: true,
        })
        .onConflictDoUpdate({
          target: [
            predictionChannels.guildId,
            predictionChannels.channelId,
            predictionChannels.leagueId,
          ],
          set: {
            enabled: true,
            updatedAt: new Date(),
          },
        });

      await interaction.editReply({
        embeds: [
          buildSuccessEmbed(
            t('football:predictions.title'),
            t('football:config.enabled'),
            shardId
          ),
        ],
      });
      return;
    }

    if (action === 'off') {
      await db
        .insert(predictionChannels)
        .values({
          guildId,
          channelId,
          leagueId: 0,
          enabled: false,
        })
        .onConflictDoUpdate({
          target: [
            predictionChannels.guildId,
            predictionChannels.channelId,
            predictionChannels.leagueId,
          ],
          set: {
            enabled: false,
            updatedAt: new Date(),
          },
        });

      await interaction.editReply({
        embeds: [
          buildSuccessEmbed(
            t('football:predictions.title'),
            t('football:config.disabled'),
            shardId
          ),
        ],
      });
      return;
    }

    if (action === 'league') {
      const targetLeagueId = parseInt(leagueIdStr!, 10);
      const leagueInfo = CURATED_LEAGUES.find((l) => l.id === targetLeagueId);
      if (!leagueInfo) {
        await interaction.editReply({
          embeds: [buildErrorEmbed(t('football:predictions.match_not_found'), shardId)],
        });
        return;
      }

      // Check existing row
      const existing = await db
        .select()
        .from(predictionChannels)
        .where(
          and(
            eq(predictionChannels.guildId, guildId),
            eq(predictionChannels.channelId, channelId),
            eq(predictionChannels.leagueId, targetLeagueId)
          )
        )
        .limit(1)
        .then((rows) => rows[0]);

      let newStatus = false;
      if (existing) {
        newStatus = !existing.enabled;
        await db
          .update(predictionChannels)
          .set({
            enabled: newStatus,
            updatedAt: new Date(),
          })
          .where(eq(predictionChannels.id, existing.id));
      } else {
        newStatus = false; // By default leagues are enabled for enabled prediction channels, so first toggle turns it off (false)
        await db.insert(predictionChannels).values({
          guildId,
          channelId,
          leagueId: targetLeagueId,
          enabled: newStatus,
        });
      }

      const statusText = newStatus
        ? t('football:config.league_status.on')
        : t('football:config.league_status.off');

      const text = t('football:config.league_toggled', {
        league: leagueInfo.name,
        status: statusText,
      });

      await interaction.editReply({
        embeds: [
          buildSuccessEmbed(
            t('football:predictions.title'),
            text,
            shardId
          ),
        ],
      });
    }
  }
}
