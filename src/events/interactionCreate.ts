import { Events, type Interaction, type StringSelectMenuInteraction, type ButtonInteraction } from 'discord.js';
import { eq, asc, inArray } from 'drizzle-orm';
import { logger } from '../utils/logger.js';
import { buildErrorEmbed } from '../ui/embeds/buildErrorEmbed.js';
import { resolveLocale, getT } from '../i18n/index.js';
import { db } from '../db/client.js';
import { users } from '../db/schema/users.js';
import { characters } from '../db/schema/characters.js';
import { recipes as recipesSchema } from '../db/schema/recipes.js';
import { recipeIngredients } from '../db/schema/recipe_ingredients.js';
import { items } from '../db/schema/items.js';
import { getProfessionLevel } from '../types/professions.js';
import type { ProfessionKey } from '../types/professions.js';
import { buildLeaderboardPage } from '../commands/game/leaderboard.js';
import { buildRecipesPage } from '../ui/embeds/buildRecipesEmbed.js';
import { buildBagPage } from '../commands/game/bag.js';
import { handlePredictResult, handlePredictButtonMarket, handlePredictModalSubmit } from '../components/predictions/index.js';
import { buildHistoryPage } from '../commands/predictions/predictions.js';
import { handleFarmingStartButton, handleFarmingTokenModal, handleFarmingBuyWeeklyButton, handleFarmingBuyMonthlyButton, handleFarmingUpgradeVIPButton, handleConfirmBuyWeekly, handleConfirmBuyMonthly, handleConfirmUpgradeVIP, handleFarmingBuyVipMonthlyButton, handleConfirmBuyVipMonthly } from '../commands/game/farming.js';
import { DEST_MENU_ID } from '../ui/components/sanguoTravelDestinationMenu.js';
import { START_BTN_ID } from '../ui/components/sanguoTravelButtons.js';
import { BATTLE_START_ID, BATTLE_SKIP_ID, CAPTURE_OPEN_ID } from '../ui/components/sanguoBattleButtons.js';
import {
  CAPTURE_TIER_PREFIX,
  CAPTURE_RETRY_ID,
  CAPTURE_RETREAT_ID,
} from '../ui/components/sanguoCaptureButtons.js';
import { ZONE_MENU_ID } from '../ui/components/sanguoHeroesZoneMenu.js';
import { STARTER_PICK_PREFIX } from '../ui/components/sanguoStarterButtons.js';
import { COMPANION_PREFIX } from '../ui/components/sanguoHeroCompanionButton.js';
import { COPY_MENU_ID } from '../ui/components/sanguoHeroCopyMenu.js';
import { COPY_PAGE_PREFIX } from '../ui/components/sanguoHeroPageButtons.js';
import { CONVERT_PREFIX } from '../ui/components/sanguoConvertButton.js';
import { LEVEL_PREFIX } from '../ui/components/sanguoLevelButton.js';
import { EVOLVE_PREFIX } from '../ui/components/sanguoEvolveButton.js';
import { REROLL_OPEN_PREFIX, REROLL_SLOT_PREFIX } from '../ui/components/sanguoRerollSlotMenu.js';
import { REROLL_GO_PREFIX } from '../ui/components/sanguoRerollButton.js';
import { SHOP_TAB_PREFIX } from '../ui/components/sanguoShopTabs.js';
import { SHOP_BUY_PREFIX } from '../ui/components/sanguoShopBuyButtons.js';
import { BAG_USE_PREFIX } from '../ui/components/sanguoBagUseButtons.js';
import { LEGION_FORMATION_MENU_ID } from '../ui/components/sanguoLegionFormationMenu.js';
import { LEGION_SLOT_MENU_ID } from '../ui/components/sanguoLegionSlotMenu.js';
import { LEGION_HERO_PREFIX } from '../ui/components/sanguoLegionHeroMenu.js';
import { LEGION_SAVE_ID } from '../ui/components/sanguoLegionSaveButton.js';
import { HEROES_FACTION_MENU_ID } from '../ui/components/sanguoHeroesFactionMenu.js';
import { HEROES_IV_MENU_ID } from '../ui/components/sanguoHeroesIvMenu.js';

export const name = Events.InteractionCreate;

const RECIPES_PER_PAGE = 5;

/** Component handlers exposed by the 'sanguo' command module (map.ts re-exports). */
interface SanguoComponentHandlers {
  handleDestinationSelect?: (interaction: StringSelectMenuInteraction) => Promise<void>;
  handleStartPress?: (interaction: ButtonInteraction) => Promise<void>;
  handleBattleStart?: (interaction: ButtonInteraction) => Promise<void>;
  handleBattleSkip?: (interaction: ButtonInteraction) => Promise<void>;
  handleCaptureOpen?: (interaction: ButtonInteraction) => Promise<void>;
  handleCaptureTierPress?: (interaction: ButtonInteraction) => Promise<void>;
  handleCaptureRetryPress?: (interaction: ButtonInteraction) => Promise<void>;
  handleCaptureRetreatPress?: (interaction: ButtonInteraction) => Promise<void>;
  handleStarterPick?: (interaction: ButtonInteraction) => Promise<void>;
  handleZoneFilterSelect?: (interaction: StringSelectMenuInteraction) => Promise<void>;
  handleFactionFilterSelect?: (interaction: StringSelectMenuInteraction) => Promise<void>;
  handleIvFilterSelect?: (interaction: StringSelectMenuInteraction) => Promise<void>;
  handleCompanionPress?: (interaction: ButtonInteraction) => Promise<void>;
  handleCopyPress?: (interaction: StringSelectMenuInteraction) => Promise<void>;
  handleCopyPage?: (interaction: ButtonInteraction) => Promise<void>;
  handleConvertPress?: (interaction: ButtonInteraction) => Promise<void>;
  handleLevelPress?: (interaction: ButtonInteraction) => Promise<void>;
  handleEvolvePress?: (interaction: ButtonInteraction) => Promise<void>;
  handleRerollPress?: (interaction: ButtonInteraction) => Promise<void>;
  handleRerollSlot?: (interaction: StringSelectMenuInteraction) => Promise<void>;
  handleRerollGo?: (interaction: ButtonInteraction) => Promise<void>;
  handleShopTabPress?: (interaction: ButtonInteraction) => Promise<void>;
  handleShopBuyPress?: (interaction: ButtonInteraction) => Promise<void>;
  handleBagUsePress?: (interaction: ButtonInteraction) => Promise<void>;
  handleFormationPress?: (interaction: StringSelectMenuInteraction) => Promise<void>;
  handleSlotPress?: (interaction: StringSelectMenuInteraction) => Promise<void>;
  handleHeroPress?: (interaction: StringSelectMenuInteraction) => Promise<void>;
  handleSavePress?: (interaction: ButtonInteraction) => Promise<void>;
}

export async function execute(interaction: Interaction): Promise<void> {
  // ── StringSelectMenu interaction routing ────────────────────────────────────
  if (interaction.isStringSelectMenu()) {
    const customId = interaction.customId;
    if (customId.startsWith('predict:result:')) {
      try {
        await handlePredictResult(interaction);
      } catch (err) {
        logger.error('InteractionCreate', 'Error in handlePredictResult', err);
      }
      return;
    }
    // sanguo travel destination select (D-26) — dispatches to the 'sanguo'
    // command module's handler (map.ts re-exports it from travel.ts)
    if (customId === DEST_MENU_ID) {
      try {
        const cmd = interaction.client.commands?.get('sanguo') as
          | SanguoComponentHandlers
          | undefined;
        if (cmd && typeof cmd.handleDestinationSelect === 'function') {
          await cmd.handleDestinationSelect(interaction);
        }
      } catch (err) {
        logger.error('InteractionCreate', 'Error in sanguo travel destination select', err);
      }
      return;
    }

    // sanguo heroes zone filter (D-15) — dispatches to the 'sanguo' command
    // module's handler; the select value is validated server-side against
    // map_zones codes (T-10-07-05: unknown → full collection, never a crash).
    if (customId === ZONE_MENU_ID) {
      try {
        const cmd = interaction.client.commands?.get('sanguo') as
          | SanguoComponentHandlers
          | undefined;
        if (cmd && typeof cmd.handleZoneFilterSelect === 'function') {
          await cmd.handleZoneFilterSelect(interaction);
        }
      } catch (err) {
        logger.error('InteractionCreate', 'Error in sanguo heroes zone filter', err);
      }
      return;
    }

    // sanguo:heroes:faction — SC5 faction filter select (static customId; the
    // CHOSEN faction code rides interaction.values[0], validated server-side
    // against heroFactions codes — T-11-07-05).
    if (customId === HEROES_FACTION_MENU_ID) {
      try {
        const cmd = interaction.client.commands?.get('sanguo') as
          | SanguoComponentHandlers
          | undefined;
        if (cmd && typeof cmd.handleFactionFilterSelect === 'function') {
          await cmd.handleFactionFilterSelect(interaction);
        }
      } catch (err) {
        logger.error('InteractionCreate', 'Error in sanguo heroes faction filter', err);
      }
      return;
    }

    // sanguo:heroes:iv — SC5 IV-grade filter select (static customId; the
    // CHOSEN iv_grade KEY rides interaction.values[0], validated against the
    // 5 grade keys — grade, never raw IV, D-12).
    if (customId === HEROES_IV_MENU_ID) {
      try {
        const cmd = interaction.client.commands?.get('sanguo') as
          | SanguoComponentHandlers
          | undefined;
        if (cmd && typeof cmd.handleIvFilterSelect === 'function') {
          await cmd.handleIvFilterSelect(interaction);
        }
      } catch (err) {
        logger.error('InteractionCreate', 'Error in sanguo heroes IV filter', err);
      }
      return;
    }

    // sanguo:hero:copy — D-04 copy selector (select menu, static customId; the
    // CHOSEN copy rides interaction.values[0], parsed with the parseInt +
    // isNaN guard inside the handler — the pressed userHeroId is re-validated
    // server-side on every press, never trusted on its own).
    if (customId === COPY_MENU_ID) {
      try {
        const cmd = interaction.client.commands?.get('sanguo') as
          | SanguoComponentHandlers
          | undefined;
        if (cmd && typeof cmd.handleCopyPress === 'function') {
          await cmd.handleCopyPress(interaction);
        }
      } catch (err) {
        logger.error('InteractionCreate', 'Error in sanguo hero copy select', err);
      }
      return;
    }

    // sanguo:reroll:slot — D-32 reroll SLOT pick (select menu, customId
    // 'sanguo:reroll:slot:{userHeroId}'; the CHOSEN slot ('normal'|'special')
    // rides interaction.values[0], validated inside the handler).
    if (customId.startsWith(REROLL_SLOT_PREFIX)) {
      try {
        const cmd = interaction.client.commands?.get('sanguo') as
          | SanguoComponentHandlers
          | undefined;
        if (cmd && typeof cmd.handleRerollSlot === 'function') {
          await cmd.handleRerollSlot(interaction);
        }
      } catch (err) {
        logger.error('InteractionCreate', 'Error in sanguo reroll slot select', err);
      }
      return;
    }

    // sanguo:legion:formation — D-22 formation select (static customId; the
    // CHOSEN formation rides interaction.values[0], validated server-side).
    if (customId === LEGION_FORMATION_MENU_ID) {
      try {
        const cmd = interaction.client.commands?.get('sanguo') as
          | SanguoComponentHandlers
          | undefined;
        if (cmd && typeof cmd.handleFormationPress === 'function') {
          await cmd.handleFormationPress(interaction);
        }
      } catch (err) {
        logger.error('InteractionCreate', 'Error in sanguo legion formation select', err);
      }
      return;
    }

    // sanguo:legion:slot — D-22 slot pick (static customId; the CHOSEN slot
    // 0-11 rides interaction.values[0], bounds-validated server-side).
    if (customId === LEGION_SLOT_MENU_ID) {
      try {
        const cmd = interaction.client.commands?.get('sanguo') as
          | SanguoComponentHandlers
          | undefined;
        if (cmd && typeof cmd.handleSlotPress === 'function') {
          await cmd.handleSlotPress(interaction);
        }
      } catch (err) {
        logger.error('InteractionCreate', 'Error in sanguo legion slot pick', err);
      }
      return;
    }

    // sanguo:legion:hero:{slotIndex} — D-22 hero pick (customId prefix carries
    // the slot; the CHOSEN userHeroId rides interaction.values[0], re-validated
    // server-side for ownership + class-match V4/D-20).
    if (customId.startsWith(LEGION_HERO_PREFIX)) {
      try {
        const cmd = interaction.client.commands?.get('sanguo') as
          | SanguoComponentHandlers
          | undefined;
        if (cmd && typeof cmd.handleHeroPress === 'function') {
          await cmd.handleHeroPress(interaction);
        }
      } catch (err) {
        logger.error('InteractionCreate', 'Error in sanguo legion hero pick', err);
      }
      return;
    }
  }

  // ── ModalSubmit interaction routing ──────────────────────────────────────────
  if (interaction.isModalSubmit()) {
    const customId = interaction.customId;
    if (customId.startsWith('predict:modal:')) {
      try {
        await handlePredictModalSubmit(interaction);
      } catch (err) {
        logger.error('InteractionCreate', 'Error in handlePredictModalSubmit', err);
      }
      return;
    }

    if (customId === 'farming:token_modal') {
      try {
        await handleFarmingTokenModal(interaction);
      } catch (err) {
        logger.error('InteractionCreate', 'Error in handleFarmingTokenModal', err);
      }
      return;
    }
  }

  // ── Button interaction routing ──────────────────────────────────────────────
  if (interaction.isButton()) {
    const customId = interaction.customId;

    // sanguo travel Start button (D-26 confirm gate). F1: the destination rides
    // in the customId suffix ('sanguo:travel:start:{code}'), so the match is a
    // PREFIX match, not === — a ButtonInteraction carries no select values.
    if (customId.startsWith(START_BTN_ID)) {
      try {
        const cmd = interaction.client.commands?.get('sanguo') as
          | SanguoComponentHandlers
          | undefined;
        if (cmd && typeof cmd.handleStartPress === 'function') {
          await cmd.handleStartPress(interaction);
        }
      } catch (err) {
        logger.error('InteractionCreate', 'Error in sanguo travel start button', err);
      }
      return;
    }

    // sanguo starter pick (D-14) — customId 'sanguo:heroes:starter:{heroId}';
    // prefix match (F1-suffixed); the handler validates the heroId against
    // STARTER_SET_1/2 (T-10-07-03) — the FREE grant, no wallet call (D-19).
    if (customId.startsWith(STARTER_PICK_PREFIX)) {
      try {
        const cmd = interaction.client.commands?.get('sanguo') as
          | SanguoComponentHandlers
          | undefined;
        if (cmd && typeof cmd.handleStarterPick === 'function') {
          await cmd.handleStarterPick(interaction);
        }
      } catch (err) {
        logger.error('InteractionCreate', 'Error in sanguo starter pick', err);
      }
      return;
    }

    // sanguo companion switch (D-16) — customId 'sanguo:hero:companion:{heroId}';
    // prefix match; the handler validates ownership inside its FOR UPDATE tx.
    if (customId.startsWith(COMPANION_PREFIX)) {
      try {
        const cmd = interaction.client.commands?.get('sanguo') as
          | SanguoComponentHandlers
          | undefined;
        if (cmd && typeof cmd.handleCompanionPress === 'function') {
          await cmd.handleCompanionPress(interaction);
        }
      } catch (err) {
        logger.error('InteractionCreate', 'Error in sanguo companion switch', err);
      }
      return;
    }

    // sanguo:hero:page — D-04 copy-list paging (customId
    // 'sanguo:hero:page:{dir}:{offset}:{targetUhId}'); dir/offset parsed with
    // the parseInt + isNaN guard inside the handler.
    if (customId.startsWith(COPY_PAGE_PREFIX)) {
      try {
        const cmd = interaction.client.commands?.get('sanguo') as
          | SanguoComponentHandlers
          | undefined;
        if (cmd && typeof cmd.handleCopyPage === 'function') {
          await cmd.handleCopyPage(interaction);
        }
      } catch (err) {
        logger.error('InteractionCreate', 'Error in sanguo hero copy page', err);
      }
      return;
    }

    // sanguo:convert:go — D-03 dupe conversion (customId
    // 'sanguo:convert:go:{userHeroId}' carries ONLY the copy id — the yield
    // NEVER rides the payload; it resolves server-side inside the tx).
    if (customId.startsWith(CONVERT_PREFIX)) {
      try {
        const cmd = interaction.client.commands?.get('sanguo') as
          | SanguoComponentHandlers
          | undefined;
        if (cmd && typeof cmd.handleConvertPress === 'function') {
          await cmd.handleConvertPress(interaction);
        }
      } catch (err) {
        logger.error('InteractionCreate', 'Error in sanguo convert button', err);
      }
      return;
    }

    // sanguo:level:go — D-05 explicit leveling (customId
    // 'sanguo:level:go:{userHeroId}' carries ONLY the copy id — the cost
    // NEVER rides the payload; LEVEL_COST resolves server-side inside the tx).
    if (customId.startsWith(LEVEL_PREFIX)) {
      try {
        const cmd = interaction.client.commands?.get('sanguo') as
          | SanguoComponentHandlers
          | undefined;
        if (cmd && typeof cmd.handleLevelPress === 'function') {
          await cmd.handleLevelPress(interaction);
        }
      } catch (err) {
        logger.error('InteractionCreate', 'Error in sanguo level button', err);
      }
      return;
    }

    // sanguo:evolve:go — D-06 explicit evolution (customId
    // 'sanguo:evolve:go:{userHeroId}' carries ONLY the copy id — the cost
    // NEVER rides the payload; EVOLUTION_COSTS resolve server-side).
    if (customId.startsWith(EVOLVE_PREFIX)) {
      try {
        const cmd = interaction.client.commands?.get('sanguo') as
          | SanguoComponentHandlers
          | undefined;
        if (cmd && typeof cmd.handleEvolvePress === 'function') {
          await cmd.handleEvolvePress(interaction);
        }
      } catch (err) {
        logger.error('InteractionCreate', 'Error in sanguo evolve button', err);
      }
      return;
    }

    // sanguo:reroll:open — D-32 reroll flow ENTRY (the action-row reroll
    // button, customId 'sanguo:reroll:open:{userHeroId}'): re-renders the
    // copy detail with the slot-pick select replacing the action row.
    if (customId.startsWith(REROLL_OPEN_PREFIX)) {
      try {
        const cmd = interaction.client.commands?.get('sanguo') as
          | SanguoComponentHandlers
          | undefined;
        if (cmd && typeof cmd.handleRerollPress === 'function') {
          await cmd.handleRerollPress(interaction);
        }
      } catch (err) {
        logger.error('InteractionCreate', 'Error in sanguo reroll open button', err);
      }
      return;
    }

    // sanguo:reroll:go — D-32 reroll CONFIRM (customId
    // 'sanguo:reroll:go:{userHeroId}:{slot}' carries ONLY the copy id + the
    // slot — the cost NEVER rides the payload; REROLL_COST resolves
    // server-side; the slot is validated inside the handler).
    if (customId.startsWith(REROLL_GO_PREFIX)) {
      try {
        const cmd = interaction.client.commands?.get('sanguo') as
          | SanguoComponentHandlers
          | undefined;
        if (cmd && typeof cmd.handleRerollGo === 'function') {
          await cmd.handleRerollGo(interaction);
        }
      } catch (err) {
        logger.error('InteractionCreate', 'Error in sanguo reroll button', err);
      }
      return;
    }

    // sanguo:shop:tab — D-16 currency tab toggle (customId
    // 'sanguo:shop:tab:{linh|event}' — the tab key only; the handler
    // validates it against the two known values, unknown → Linh thạch tab).
    if (customId.startsWith(SHOP_TAB_PREFIX)) {
      try {
        const cmd = interaction.client.commands?.get('sanguo') as
          | SanguoComponentHandlers
          | undefined;
        if (cmd && typeof cmd.handleShopTabPress === 'function') {
          await cmd.handleShopTabPress(interaction);
        }
      } catch (err) {
        logger.error('InteractionCreate', 'Error in sanguo shop tab button', err);
      }
      return;
    }

    // sanguo:shop:buy — D-16 purchase (customId 'sanguo:shop:buy:{itemCode}'
    // carries ONLY the code — the PRICE NEVER rides the payload, anti-tamper
    // T-11-04-01; prices resolve server-side inside the shop tx).
    if (customId.startsWith(SHOP_BUY_PREFIX)) {
      try {
        const cmd = interaction.client.commands?.get('sanguo') as
          | SanguoComponentHandlers
          | undefined;
        if (cmd && typeof cmd.handleShopBuyPress === 'function') {
          await cmd.handleShopBuyPress(interaction);
        }
      } catch (err) {
        logger.error('InteractionCreate', 'Error in sanguo shop buy button', err);
      }
      return;
    }

    // sanguo:bag:use — D-13 item use (customId 'sanguo:bag:use:{itemCode}'
    // carries ONLY the item code; the heal effect resolves server-side inside
    // the bag tx — T-11-04-04 single-writer, no double-heal).
    if (customId.startsWith(BAG_USE_PREFIX)) {
      try {
        const cmd = interaction.client.commands?.get('sanguo') as
          | SanguoComponentHandlers
          | undefined;
        if (cmd && typeof cmd.handleBagUsePress === 'function') {
          await cmd.handleBagUsePress(interaction);
        }
      } catch (err) {
        logger.error('InteractionCreate', 'Error in sanguo bag use button', err);
      }
      return;
    }

    // sanguo:legion:save — D-22 save button (exact-id; carries no payload —
    // the formation + slots resolve server-side from the persisted legion).
    if (customId === LEGION_SAVE_ID) {
      try {
        const cmd = interaction.client.commands?.get('sanguo') as
          | SanguoComponentHandlers
          | undefined;
        if (cmd && typeof cmd.handleSavePress === 'function') {
          await cmd.handleSavePress(interaction);
        }
      } catch (err) {
        logger.error('InteractionCreate', 'Error in sanguo legion save button', err);
      }
      return;
    }

    // sanguo encounter battle entry (D-01) — REPLACES the D-25 ack route
    // (Pitfall 7: the old route is REMOVED, not dormant). Prefix match keeps
    // the sanguo:battle:* namespace future-proof; dispatch by exact id.
    if (customId.startsWith('sanguo:battle:')) {
      try {
        const cmd = interaction.client.commands?.get('sanguo') as
          | SanguoComponentHandlers
          | undefined;
        if (cmd) {
          if (customId === BATTLE_START_ID && typeof cmd.handleBattleStart === 'function') {
            await cmd.handleBattleStart(interaction);
          } else if (customId === BATTLE_SKIP_ID && typeof cmd.handleBattleSkip === 'function') {
            await cmd.handleBattleSkip(interaction);
          }
        }
      } catch (err) {
        logger.error('InteractionCreate', 'Error in sanguo battle button', err);
      }
      return;
    }

    // sanguo capture view (D-10) — the Bắt button on the battle-win row.
    if (customId === CAPTURE_OPEN_ID) {
      try {
        const cmd = interaction.client.commands?.get('sanguo') as
          | SanguoComponentHandlers
          | undefined;
        if (cmd && typeof cmd.handleCaptureOpen === 'function') {
          await cmd.handleCaptureOpen(interaction);
        }
      } catch (err) {
        logger.error('InteractionCreate', 'Error in sanguo capture open button', err);
      }
      return;
    }

    // sanguo capture tier press — customId 'sanguo:capture:tier:{n}' carries
    // ONLY the tier (anti-tamper, T-10-06-01). parseInt + isNaN guard first
    // (interactionCreate.ts bxh pattern); the server validates 1-5 (V5).
    if (customId.startsWith(CAPTURE_TIER_PREFIX)) {
      try {
        const rawTier = customId.slice(CAPTURE_TIER_PREFIX.length + 1);
        const tier = parseInt(rawTier, 10);
        if (isNaN(tier)) {
          await interaction.deferUpdate();
          return;
        }
        const cmd = interaction.client.commands?.get('sanguo') as
          | SanguoComponentHandlers
          | undefined;
        if (cmd && typeof cmd.handleCaptureTierPress === 'function') {
          await cmd.handleCaptureTierPress(interaction);
        }
      } catch (err) {
        logger.error('InteractionCreate', 'Error in sanguo capture tier button', err);
      }
      return;
    }

    // sanguo capture retry (after a failed attempt) / retreat (D-18).
    if (customId === CAPTURE_RETRY_ID) {
      try {
        const cmd = interaction.client.commands?.get('sanguo') as
          | SanguoComponentHandlers
          | undefined;
        if (cmd && typeof cmd.handleCaptureRetryPress === 'function') {
          await cmd.handleCaptureRetryPress(interaction);
        }
      } catch (err) {
        logger.error('InteractionCreate', 'Error in sanguo capture retry button', err);
      }
      return;
    }

    if (customId === CAPTURE_RETREAT_ID) {
      try {
        const cmd = interaction.client.commands?.get('sanguo') as
          | SanguoComponentHandlers
          | undefined;
        if (cmd && typeof cmd.handleCaptureRetreatPress === 'function') {
          await cmd.handleCaptureRetreatPress(interaction);
        }
      } catch (err) {
        logger.error('InteractionCreate', 'Error in sanguo capture retreat button', err);
      }
      return;
    }

    if (
      customId.startsWith('predict:score:') ||
      customId.startsWith('predict:over_under:') ||
      customId.startsWith('predict:spread:')
    ) {
      try {
        await handlePredictButtonMarket(interaction);
      } catch (err) {
        logger.error('InteractionCreate', 'Error in handlePredictButtonMarket', err);
      }
      return;
    }

    if (customId === 'farming:start') {
      try {
        await handleFarmingStartButton(interaction);
      } catch (err) {
        logger.error('InteractionCreate', 'Error in handleFarmingStartButton', err);
      }
      return;
    }

    if (customId === 'farming:buy_weekly') {
      try {
        await handleFarmingBuyWeeklyButton(interaction);
      } catch (err) {
        logger.error('InteractionCreate', 'Error in handleFarmingBuyWeeklyButton', err);
      }
      return;
    }

    if (customId === 'farming:buy_monthly') {
      try {
        await handleFarmingBuyMonthlyButton(interaction);
      } catch (err) {
        logger.error('InteractionCreate', 'Error in handleFarmingBuyMonthlyButton', err);
      }
      return;
    }

    if (customId === 'farming:buy_vip_monthly') {
      try {
        await handleFarmingBuyVipMonthlyButton(interaction);
      } catch (err) {
        logger.error('InteractionCreate', 'Error in handleFarmingBuyVipMonthlyButton', err);
      }
      return;
    }

    if (customId === 'farming:upgrade_vip') {
      try {
        await handleFarmingUpgradeVIPButton(interaction);
      } catch (err) {
        logger.error('InteractionCreate', 'Error in handleFarmingUpgradeVIPButton', err);
      }
      return;
    }

    if (customId === 'farming:confirm_buy_weekly') {
      try {
        await handleConfirmBuyWeekly(interaction);
      } catch (err) {
        logger.error('InteractionCreate', 'Error in handleConfirmBuyWeekly', err);
      }
      return;
    }

    if (customId === 'farming:confirm_buy_monthly') {
      try {
        await handleConfirmBuyMonthly(interaction);
      } catch (err) {
        logger.error('InteractionCreate', 'Error in handleConfirmBuyMonthly', err);
      }
      return;
    }

    if (customId === 'farming:confirm_buy_vip_monthly') {
      try {
        await handleConfirmBuyVipMonthly(interaction);
      } catch (err) {
        logger.error('InteractionCreate', 'Error in handleConfirmBuyVipMonthly', err);
      }
      return;
    }

    if (customId === 'farming:confirm_upgrade_vip') {
      try {
        await handleConfirmUpgradeVIP(interaction);
      } catch (err) {
        logger.error('InteractionCreate', 'Error in handleConfirmUpgradeVIP', err);
      }
      return;
    }

    // /bxh pagination buttons: customId = 'bxh_prev_{page}_{scope}' or 'bxh_next_{page}_{scope}'
    if (customId.startsWith('bxh_prev_') || customId.startsWith('bxh_next_')) {
      const parts = customId.split('_');
      // Format: ['bxh', 'prev'|'next', '{page}', '{scope...}']
      const direction = parts[1] as 'prev' | 'next';
      const rawPage = parseInt(parts[2] ?? '', 10);

      // T-02-BXH-01: NaN guard — malformed customId should not trigger a query
      if (isNaN(rawPage)) {
        await interaction.deferUpdate();
        return;
      }

      const newPage = direction === 'prev' ? rawPage - 1 : rawPage + 1;

      // Negative page guard — cannot go before page 0
      if (newPage < 0) {
        await interaction.deferUpdate();
        return;
      }

      await interaction.deferUpdate();

      // T-02-BXH-02: scope is guildId snowflake or literal 'global'
      // parts[3..] re-joined in case guildId somehow contains '_' (it shouldn't — Discord snowflakes are numeric)
      const scope = parts.slice(3).join('_');

      // Resolve user locale from DB; fallback to 'vi' if not found
      const [userRow] = await db
        .select({ locale: users.locale })
        .from(users)
        .where(eq(users.discordId, interaction.user.id));
      const locale = resolveLocale(userRow?.locale, null);
      const t = getT(locale);

      const shardId = interaction.client.shard?.ids[0];

      const { embed, row } = await buildLeaderboardPage(scope, newPage, t, shardId);
      await interaction.editReply({ embeds: [embed], components: [row] });
      return;
    }

    // /predictions history pagination buttons: customId = 'pred_hist_prev_{page}_{userId}' or 'pred_hist_next_{page}_{userId}'
    if (customId.startsWith('pred_hist_prev_') || customId.startsWith('pred_hist_next_')) {
      const parts = customId.split('_');
      const direction = parts[2] as 'prev' | 'next';
      const rawPage = parseInt(parts[3] ?? '', 10);
      const targetUserId = parseInt(parts[4] ?? '', 10);

      if (isNaN(rawPage) || isNaN(targetUserId)) {
        await interaction.deferUpdate();
        return;
      }

      const [currentUser] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.discordId, interaction.user.id));

      if (!currentUser || currentUser.id !== targetUserId) {
        await interaction.deferUpdate();
        return;
      }

      const newPage = direction === 'prev' ? rawPage - 1 : rawPage + 1;
      if (newPage < 0) {
        await interaction.deferUpdate();
        return;
      }

      await interaction.deferUpdate();

      const [userRow] = await db
        .select({ locale: users.locale })
        .from(users)
        .where(eq(users.discordId, interaction.user.id));
      const locale = resolveLocale(userRow?.locale, null);
      const t = getT(locale);
      const shardId = interaction.client.shard?.ids[0];

      const { embed, row } = await buildHistoryPage(targetUserId, newPage, t, shardId);
      await interaction.editReply({ embeds: [embed], components: [row] });
      return;
    }

    // /recipes pagination buttons: customId = 'recipes_prev_{page}_{profession|none}' or 'recipes_next_{page}_{profession|none}'
    if (customId.startsWith('recipes_prev_') || customId.startsWith('recipes_next_')) {
      const parts = customId.split('_');
      // Format: ['recipes', 'prev'|'next', '{page}', '{profession|none}']
      const direction = parts[1] as 'prev' | 'next';
      const rawPage = parseInt(parts[2] ?? '', 10);

      // T-GAP-01: NaN guard
      if (isNaN(rawPage)) {
        await interaction.deferUpdate();
        return;
      }

      const newPage = direction === 'prev' ? rawPage - 1 : rawPage + 1;

      // Underflow guard — recipes are 1-indexed
      if (newPage < 1) {
        await interaction.deferUpdate();
        return;
      }

      await interaction.deferUpdate();

      // T-GAP-02: profession string is parameterized via Drizzle WHERE — no SQL injection risk
      const professionRaw = parts.slice(3).join('_');
      const professionFilter = professionRaw === 'none' ? null : (professionRaw as ProfessionKey);

      // Resolve user locale
      const [userRow] = await db
        .select({ locale: users.locale })
        .from(users)
        .where(eq(users.discordId, interaction.user.id));
      const locale = resolveLocale(userRow?.locale, null);
      const t = getT(locale);
      const shardId = interaction.client.shard?.ids[0];

      // Fetch character for profession level filtering
      const [charRow] = await db
        .select({ id: characters.id, discordId: characters.discordId, professionPoints: characters.professionPoints })
        .from(characters)
        .where(eq(characters.discordId, interaction.user.id));

      if (!charRow) {
        await interaction.deferUpdate();
        return;
      }

      // Re-run recipes query (mirrors recipes.ts execute())
      const allRecipesRows = await db
        .select({
          id: recipesSchema.id,
          resultItemId: recipesSchema.resultItemId,
          professionType: recipesSchema.professionType,
          minProfessionLevel: recipesSchema.minProfessionLevel,
        })
        .from(recipesSchema)
        .where(professionFilter ? eq(recipesSchema.professionType, professionFilter) : undefined)
        .orderBy(asc(recipesSchema.professionType), asc(recipesSchema.minProfessionLevel));

      // Apply profession-level filter
      const visibleRecipes = allRecipesRows.filter((r) => {
        const charLevel = getProfessionLevel(
          charRow.professionPoints,
          r.professionType as ProfessionKey,
        );
        return charLevel >= r.minProfessionLevel;
      });

      if (visibleRecipes.length === 0) {
        await interaction.deferUpdate();
        return;
      }

      const totalPages = Math.ceil(visibleRecipes.length / RECIPES_PER_PAGE);
      const clampedPage = Math.min(newPage, totalPages);
      const pageRecipes = visibleRecipes.slice(
        (clampedPage - 1) * RECIPES_PER_PAGE,
        clampedPage * RECIPES_PER_PAGE,
      );

      // Fetch result items
      const resultItemIds = pageRecipes.map((r) => r.resultItemId);
      const resultItemRows = await db
        .select({ id: items.id, nameI18nKey: items.nameI18nKey, tier: items.tier })
        .from(items)
        .where(
          resultItemIds.length === 1
            ? eq(items.id, resultItemIds[0]!)
            : inArray(items.id, resultItemIds),
        );
      const resultItemMap = new Map(resultItemRows.map((r) => [r.id, r]));

      // Fetch ingredients
      const pageRecipeIds = pageRecipes.map((r) => r.id);
      const allIngredients = await db
        .select({
          recipeId: recipeIngredients.recipeId,
          itemId: recipeIngredients.itemId,
          quantity: recipeIngredients.quantity,
        })
        .from(recipeIngredients)
        .where(
          pageRecipeIds.length === 1
            ? eq(recipeIngredients.recipeId, pageRecipeIds[0]!)
            : inArray(recipeIngredients.recipeId, pageRecipeIds),
        );

      const ingredientItemIds = [...new Set(allIngredients.map((i) => i.itemId))];
      const ingredientItems =
        ingredientItemIds.length > 0
          ? await db
              .select({ id: items.id, nameI18nKey: items.nameI18nKey })
              .from(items)
              .where(
                ingredientItemIds.length === 1
                  ? eq(items.id, ingredientItemIds[0]!)
                  : inArray(items.id, ingredientItemIds),
              )
          : [];
      const ingredientNameMap = new Map(ingredientItems.map((i) => [i.id, i.nameI18nKey]));

      const ingByRecipe = new Map<number, { nameKey: string; quantity: number }[]>();
      for (const ing of allIngredients) {
        if (!ingByRecipe.has(ing.recipeId)) ingByRecipe.set(ing.recipeId, []);
        ingByRecipe.get(ing.recipeId)!.push({
          nameKey: ingredientNameMap.get(ing.itemId) ?? 'game:items.unknown',
          quantity: ing.quantity,
        });
      }

      const charProfLevel = professionFilter
        ? getProfessionLevel(charRow.professionPoints, professionFilter)
        : undefined;

      const displayRecipes = pageRecipes.map((r) => {
        const resultItem = resultItemMap.get(r.resultItemId);
        return {
          recipeId: r.id,
          outputNameKey: resultItem?.nameI18nKey ?? 'game:items.unknown',
          outputTier: resultItem?.tier ?? 1,
          profession: r.professionType,
          minProfessionLevel: r.minProfessionLevel,
          ingredients: ingByRecipe.get(r.id) ?? [],
        };
      });

      const { embed, row } = buildRecipesPage(
        {
          recipes: displayRecipes,
          professionKey: professionFilter ?? undefined,
          characterProfLevel: charProfLevel,
          page: clampedPage,
          totalPages,
          shardId,
        },
        t,
      );
      await interaction.editReply({ embeds: [embed], components: [row] });
      return;
    }

    // /bag pagination buttons: customId = 'bag_prev_{page}_{characterId}' or 'bag_next_{page}_{characterId}'
    if (customId.startsWith('bag_prev_') || customId.startsWith('bag_next_')) {
      const parts = customId.split('_');
      // Format: ['bag', 'prev'|'next', '{page}', '{characterId}']
      const direction = parts[1] as 'prev' | 'next';
      const rawPage = parseInt(parts[2] ?? '', 10);
      const characterId = parseInt(parts[3] ?? '', 10);

      if (isNaN(rawPage) || isNaN(characterId)) {
        await interaction.deferUpdate();
        return;
      }

      const newPage = direction === 'prev' ? rawPage - 1 : rawPage + 1;
      if (newPage < 1) {
        await interaction.deferUpdate();
        return;
      }

      await interaction.deferUpdate();

      const [userRow] = await db
        .select({ locale: users.locale })
        .from(users)
        .where(eq(users.discordId, interaction.user.id));
      const locale = resolveLocale(userRow?.locale, null);
      const t = getT(locale);
      const shardId = interaction.client.shard?.ids[0];

      const result = await buildBagPage(characterId, newPage, t, shardId);
      if (!result) {
        await interaction.deferUpdate();
        return;
      }
      await interaction.editReply({ embeds: [result.embed], components: [result.row] });
      return;
    }

    // Unknown button — no-op (future button types handled here)
    return;
  }

  // ── Slash command routing ───────────────────────────────────────────────────
  if (!interaction.isChatInputCommand()) return;

  const command = interaction.client.commands?.get(interaction.commandName);

  if (!command) {
    logger.warn('InteractionCreate', `Unknown command: ${interaction.commandName}`);
    return;
  }

  try {
    await command.execute(interaction);
  } catch (err) {
    logger.error('InteractionCreate', `Error in command ${interaction.commandName}`, err);

    const [errorUserRow] = await db
      .select({ locale: users.locale })
      .from(users)
      .where(eq(users.discordId, interaction.user.id));
    const locale = resolveLocale(errorUserRow?.locale, interaction.locale);
    const t = getT(locale);

      const errorEmbed = buildErrorEmbed(t('common:errors.internalError'));

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
    } else {
      await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
  }
}
