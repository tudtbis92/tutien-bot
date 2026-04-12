/**
 * /thutap - Gathering command.
 *
 * Allows cultivators to gather raw materials based on their profession level and realm.
 * Tier-gated gathering: higher-tier materials require higher profession level AND realm.
 * 5-minute cooldown per profession to prevent farming.
 *
 * Business rules:
 *  - materialTier inferred from item basePrice (0-99=common, 100-499=uncommon, 500-1999=rare, 2000+=epic)
 *  - Profession gating: GATHER_TIER_REQUIREMENTS[tier] min level required
 *  - Realm gating: GATHER_REALM_REQUIREMENTS[tier] min realmId required
 *  - Yield formula: computeGatheringYield(realmId, profLevel, tier)
 *  - Inventory: INSERT ... ON CONFLICT DO UPDATE SET quantity = quantity + qty
 *  - Cooldown: 5 minutes per profession key (T-02-GATHER-01)
 *
 * Threat mitigations:
 *  - T-02-GATHER-01: tryAcquireCooldown 5-min per profession; server-side, no client influence
 *  - T-02-GATHER-02: char.realmId checked server-side against GATHER_REALM_REQUIREMENTS
 */

/* eslint-disable i18next/no-literal-string -- slash command names/descriptions are Discord API static strings */
import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { eq, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { characters } from '../../db/schema/characters.js';
import { items } from '../../db/schema/items.js';
import { characterItems } from '../../db/schema/character_items.js';
import { GATHER_TIER_REQUIREMENTS, GATHER_REALM_REQUIREMENTS } from '../../constants/itemAttributes.js';
import { computeGatheringYield, getRealmTier } from '../../utils/realmUtils.js';
import { getProfessionLevel } from '../../types/professions.js';
import type { ProfessionKey } from '../../types/professions.js';
import { buildItemEmbed } from '../../ui/embeds/buildItemEmbed.js';
import { buildErrorEmbed } from '../../ui/embeds/buildErrorEmbed.js';
import { tryAcquireCooldown } from '../../cache/cooldown.js';
import { resolveLocale, getT } from '../../i18n/index.js';

// ── Material tier inference ───────────────────────────────────────────────

/**
 * Infer material tier (0-3) from item basePrice.
 * tier 0 (common):   0-99
 * tier 1 (uncommon): 100-499
 * tier 2 (rare):     500-1999
 * tier 3 (epic):     2000+
 */
function inferMaterialTier(basePrice: bigint): number {
  if (basePrice >= 2000n) return 3;
  if (basePrice >= 500n) return 2;
  if (basePrice >= 100n) return 1;
  return 0;
}

/**
 * Determine which profession is needed to gather a material item.
 * Uses item type mapping: material items default to 'duoc_su' unless overridden.
 * In Phase 2 each item type maps to the most relevant profession.
 */
function getProfessionForItemType(
  itemType: string,
): ProfessionKey {
  // Map item types to their corresponding gathering profession
  const TYPE_TO_PROFESSION: Record<string, ProfessionKey> = {
    material: 'duoc_su',      // Herb/material gathering = Herbalism
    stone: 'khai_linh',       // Spirit stones = Spirit Stone Mining
    artifact: 'luyen_co',     // Artifact materials = Artifact Refinement
    equipment: 'luyen_kim',   // Metal/weapon materials = Metal Refinement
    food: 'linh_tru',         // Food ingredients = Spirit Cooking
    companion: 'thuan_thu',   // Beast parts = Beast Taming
    formation: 'tran_phap',   // Formation materials = Formation Arrays
    scroll: 'thuat_su',       // Knowledge scrolls = Divination
    consumable: 'luyen_dan',  // Consumable ingredients = Pill Crafting
  };

  return (TYPE_TO_PROFESSION[itemType] as ProfessionKey | undefined) ?? 'duoc_su';
}

// ── Command definition ────────────────────────────────────────────────────

export const data = new SlashCommandBuilder()
  .setName('thutap')
  .setNameLocalizations({ 'en-US': 'gather', 'zh-CN': 'gather', vi: 'thu_thập' })
  .setDescription('Thu thập nguyên liệu từ thiên nhiên')
  .setDescriptionLocalizations({
    'en-US': 'Gather raw materials from nature',
    'zh-CN': '采集原材料',
  })
  .addIntegerOption((opt) =>
    opt
      .setName('item_id')
      .setNameLocalizations({ 'en-US': 'item_id', 'zh-CN': 'item_id' })
      .setDescription('ID của vật phẩm cần thu thập')
      .setDescriptionLocalizations({
        'en-US': 'ID of the item to gather',
        'zh-CN': '要采集的物品ID',
      })
      .setRequired(true)
      .setMinValue(1),
  );
/* eslint-enable i18next/no-literal-string */

// ── Execute ───────────────────────────────────────────────────────────────

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  const locale = resolveLocale(null, interaction.locale);
  const t = getT(locale);
  const shardId = interaction.client.shard?.ids[0];

  // 1. Fetch character by Discord ID
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

  // 2. Resolve item
  const itemId = interaction.options.getInteger('item_id', true);
  const item = await db
    .select()
    .from(items)
    .where(eq(items.id, itemId))
    .limit(1)
    .then((rows) => rows[0]);

  if (!item) {
    await interaction.editReply({
      embeds: [buildErrorEmbed(t('game:craft.recipe_not_found'), shardId)],
    });
    return;
  }

  // 3. Infer material tier from base price
  const materialTier = inferMaterialTier(item.basePrice);

  // 4. Determine profession needed for this item type
  const profKey = getProfessionForItemType(item.type);
  const profLevel = getProfessionLevel(char.professionPoints, profKey);

  // 5. Check profession level gate (T-02-GATHER-02 partial)
  const requiredProfLevel = GATHER_TIER_REQUIREMENTS[materialTier]!;
  if (profLevel < requiredProfLevel) {
    const profName = t(`game:profession.names.${profKey}`);
    await interaction.editReply({
      embeds: [
        buildErrorEmbed(
          t('game:gather.insufficient_level', {
            prof: profName,
            level: requiredProfLevel,
            item: t(item.nameI18nKey),
          }),
          shardId,
        ),
      ],
    });
    return;
  }

  // 6. Check realm gate (T-02-GATHER-02)
  const requiredRealmId = GATHER_REALM_REQUIREMENTS[materialTier]!;
  if (char.realmId < requiredRealmId) {
    let requiredRealmName: string;
    try {
      const realmTier = getRealmTier(requiredRealmId);
      requiredRealmName = t(realmTier.i18nKey);
    } catch {
      requiredRealmName = `Realm ${requiredRealmId}`;
    }
    await interaction.editReply({
      embeds: [
        buildErrorEmbed(
          t('game:gather.insufficient_realm', {
            realm: requiredRealmName,
            item: t(item.nameI18nKey),
          }),
          shardId,
        ),
      ],
    });
    return;
  }

  // 7. Cooldown check (T-02-GATHER-01): 5-minute per profession
  const cooldownKey = `gather:${profKey}`;
  const canProceed = await tryAcquireCooldown(
    interaction.user.id,
    cooldownKey,
    300_000, // 5 minutes in milliseconds
  );

  if (!canProceed) {
    await interaction.editReply({
      embeds: [buildErrorEmbed(t('game:gather.cooldown'), shardId)],
    });
    return;
  }

  // 8. Compute gathering yield
  const qty = computeGatheringYield(char.realmId, profLevel, materialTier);

  // 9. Upsert inventory: INSERT ... ON CONFLICT DO UPDATE SET quantity = quantity + qty
  await db
    .insert(characterItems)
    .values({
      characterId: char.id,
      itemId: item.id,
      quantity: qty,
    })
    .onConflictDoUpdate({
      target: [characterItems.characterId, characterItems.itemId],
      set: {
        quantity: sql`${characterItems.quantity} + ${qty}`,
      },
    });

  // 10. Build success embed
  await interaction.editReply({
    embeds: [
      buildItemEmbed(
        {
          type: 'gather',
          itemNameI18nKey: item.nameI18nKey,
          quantity: qty,
          shardId,
        },
        t,
      ),
    ],
  });
}
