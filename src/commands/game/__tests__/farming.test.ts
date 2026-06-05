/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── discord.js mock phải đứng đầu, trước bất kỳ import nào dùng farming.ts ──
vi.mock('discord.js', () => {
  const makeChain = () => {
    const chain: Record<string, any> = {};
    const methods = [
      'setName', 'setDescription', 'addSubcommand', 'setTitle',
      'setColor', 'addFields', 'setCustomId', 'setLabel',
      'setStyle', 'setEmoji', 'addComponents', 'setRequired',
      'setMinLength', 'setPlaceholder', 'setAuthor', 'setFooter',
      'setTimestamp', 'setURL', 'setThumbnail', 'setImage',
    ];
    methods.forEach((m) => { chain[m] = () => chain; });
    chain.data = { fields: [] };
    chain.components = [];
    return chain;
  };

  class FakeBuilder {
    [key: string]: any;
    constructor() {
      const inst = makeChain();
      // Allow components to be tracked
      const stored: any[] = [];
      inst.addComponents = (...items: any[]) => {
        stored.push(...items.flat());
        // expose via .components for test assertions
        inst.components = stored.map((c) => ({ data: { custom_id: c._customId ?? '' } }));
        return inst;
      };
      inst.setCustomId = (id: string) => { inst._customId = id; return inst; };
      inst.data = {
        fields: [] as any[],
        custom_id: '',
      };
      inst.addFields = (...fields: any[]) => {
        inst.data.fields.push(...fields.flat());
        return inst;
      };
      return inst;
    }
  }

  return {
    SlashCommandBuilder: FakeBuilder,
    EmbedBuilder: FakeBuilder,
    ActionRowBuilder: FakeBuilder,
    ButtonBuilder: FakeBuilder,
    ModalBuilder: FakeBuilder,
    TextInputBuilder: FakeBuilder,
    ButtonStyle: { Primary: 1, Secondary: 2, Success: 3, Danger: 4, Link: 5 },
    TextInputStyle: { Short: 1, Paragraph: 2 },
    Events: { InteractionCreate: 'interactionCreate' },
  };
});

vi.mock('../../../config.js', () => ({
  config: {
    DISCORD_TOKEN: 'test_token',
    FARM_ENCRYPTION_KEYS: '{"v1":"0123456789abcdef0123456789abcdef"}',
    ACTIVE_FARM_KEY_VERSION: 'v1',
  },
}));

vi.mock('../../../db/client.js', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn(),
    query: {
      farmingAccounts: { findFirst: vi.fn() },
      farmingSubscriptions: { findFirst: vi.fn() },
    },
  },
}));

vi.mock('../../../services/farming/subscriptionService.js', () => ({
  FarmingSubscriptionService: {
    purchasePlan: vi.fn(),
    upgradePlan: vi.fn(),
    calculateUpgradeFee: vi.fn(),
  },
}));

vi.mock('../../../i18n/index.js', () => ({
  resolveLocale: vi.fn().mockReturnValue('vi'),
  getT: vi.fn().mockReturnValue((key: string, _opts?: object) => key),
}));

vi.mock('../../../utils/adminGuard.js', () => ({
  isAuthorizedAdmin: vi.fn().mockReturnValue(true),
}));

vi.mock('../../../utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../../services/encryptionService.js', () => ({
  EncryptionService: { encrypt: vi.fn(), decrypt: vi.fn() },
}));

vi.mock('../../../services/farming/proxyService.js', () => ({
  ProxyService: { assignProxy: vi.fn() },
}));

vi.mock('../../../services/farming/channelService.js', () => ({
  createFarmingChannel: vi.fn(),
  deleteFarmingChannel: vi.fn(),
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
  and: vi.fn(),
  gt: vi.fn(),
  gte: vi.fn(),
  ne: vi.fn(),
  sql: vi.fn(),
}));

vi.mock('../../../db/schema/users.js', () => ({
  users: { id: 'id', discordId: 'discordId', locale: 'locale', balance: 'balance' },
}));

vi.mock('../../../db/schema/farming.js', () => ({
  farmingAccounts: { userId: 'userId' },
  farmingSubscriptions: { userId: 'userId', planType: 'planType', expiresAt: 'expiresAt' },
}));

// ── Import sau khi mocks đã setup xong ──────────────────────────────────────
import {
  handleConfirmBuyWeekly,
  handleConfirmBuyMonthly,
  handleConfirmBuyVipMonthly,
  handleConfirmUpgradeVIP,
  execute,
} from '../farming.js';
import { db } from '../../../db/client.js';
import { FarmingSubscriptionService } from '../../../services/farming/subscriptionService.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeButtonInteraction() {
  return {
    user: { id: '123' },
    locale: 'vi',
    reply: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
  } as any;
}

function makeCommandInteraction(subcommand: string) {
  return {
    user: { id: '123' },
    locale: 'vi',
    reply: vi.fn().mockResolvedValue(undefined),
    options: { getSubcommand: () => subcommand },
    client: { shard: null },
  } as any;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('farming command — confirm buy handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // TC-07-01 (7D)
  it('handleConfirmBuyWeekly: calls purchasePlan(userId, basic, 7) on success', async () => {
    const expiry = new Date('2026-06-12T00:00:00.000Z');
    (db as any).where.mockResolvedValue([{ id: 1, locale: 'vi' }]);
    (FarmingSubscriptionService.purchasePlan as any).mockResolvedValue(expiry);

    const interaction = makeButtonInteraction();
    await handleConfirmBuyWeekly(interaction);

    expect(FarmingSubscriptionService.purchasePlan).toHaveBeenCalledWith(1, 'basic', 7);
    expect(interaction.update).toHaveBeenCalledWith(
      expect.objectContaining({ embeds: [], components: [] }),
    );
  });

  it('handleConfirmBuyWeekly: shows insufficient_balance key on error', async () => {
    (db as any).where.mockResolvedValue([{ id: 1, locale: 'vi' }]);
    (FarmingSubscriptionService.purchasePlan as any).mockRejectedValue(new Error('INSUFFICIENT_BALANCE'));

    const interaction = makeButtonInteraction();
    await handleConfirmBuyWeekly(interaction);

    expect(interaction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('game:farming.subscription.insufficient_balance'),
      }),
    );
  });

  // TC-07-01 (30D)
  it('handleConfirmBuyMonthly: calls purchasePlan(userId, basic, 30) on success', async () => {
    const expiry = new Date('2026-07-05T00:00:00.000Z');
    (db as any).where.mockResolvedValue([{ id: 2, locale: 'vi' }]);
    (FarmingSubscriptionService.purchasePlan as any).mockResolvedValue(expiry);

    const interaction = makeButtonInteraction();
    await handleConfirmBuyMonthly(interaction);

    expect(FarmingSubscriptionService.purchasePlan).toHaveBeenCalledWith(2, 'basic', 30);
    expect(interaction.update).toHaveBeenCalledWith(
      expect.objectContaining({ embeds: [], components: [] }),
    );
  });

  it('handleConfirmBuyMonthly: shows insufficient_balance key on error', async () => {
    (db as any).where.mockResolvedValue([{ id: 2, locale: 'vi' }]);
    (FarmingSubscriptionService.purchasePlan as any).mockRejectedValue(new Error('INSUFFICIENT_BALANCE'));

    const interaction = makeButtonInteraction();
    await handleConfirmBuyMonthly(interaction);

    expect(interaction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('game:farming.subscription.insufficient_balance'),
      }),
    );
  });

  // VIP 50k button
  it('handleConfirmBuyVipMonthly: calls purchasePlan(userId, premium, 30) on success', async () => {
    const expiry = new Date('2026-07-05T00:00:00.000Z');
    (db as any).where.mockResolvedValue([{ id: 3, locale: 'vi' }]);
    (FarmingSubscriptionService.purchasePlan as any).mockResolvedValue(expiry);

    const interaction = makeButtonInteraction();
    await handleConfirmBuyVipMonthly(interaction);

    expect(FarmingSubscriptionService.purchasePlan).toHaveBeenCalledWith(3, 'premium', 30);
    expect(interaction.update).toHaveBeenCalledWith(
      expect.objectContaining({ embeds: [], components: [] }),
    );
  });

  it('handleConfirmBuyVipMonthly: shows insufficient_balance on error', async () => {
    (db as any).where.mockResolvedValue([{ id: 3, locale: 'vi' }]);
    (FarmingSubscriptionService.purchasePlan as any).mockRejectedValue(new Error('INSUFFICIENT_BALANCE'));

    const interaction = makeButtonInteraction();
    await handleConfirmBuyVipMonthly(interaction);

    expect(interaction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('game:farming.subscription.insufficient_balance'),
      }),
    );
  });

  // TC-07-02: Upgrade prorated
  it('handleConfirmUpgradeVIP: calls upgradePlan(userId) on success', async () => {
    const expiry = new Date('2026-06-20T00:00:00.000Z');
    (db as any).where.mockResolvedValue([{ id: 4, locale: 'vi' }]);
    (FarmingSubscriptionService.upgradePlan as any).mockResolvedValue(expiry);

    const interaction = makeButtonInteraction();
    await handleConfirmUpgradeVIP(interaction);

    expect(FarmingSubscriptionService.upgradePlan).toHaveBeenCalledWith(4);
    expect(interaction.update).toHaveBeenCalledWith(
      expect.objectContaining({ embeds: [], components: [] }),
    );
  });

  it('handleConfirmUpgradeVIP: shows insufficient_balance on error', async () => {
    (db as any).where.mockResolvedValue([{ id: 4, locale: 'vi' }]);
    (FarmingSubscriptionService.upgradePlan as any).mockRejectedValue(new Error('INSUFFICIENT_BALANCE'));

    const interaction = makeButtonInteraction();
    await handleConfirmUpgradeVIP(interaction);

    expect(interaction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('game:farming.subscription.insufficient_balance'),
      }),
    );
  });
});

// TC-07-04 + TC-07-05: /farming status & setup subscription display
describe('farming command — subscription status display (TC-07-04, TC-07-05)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('TC-07-04: /farming status reply contains subscription.status and subscription.expiry fields', async () => {
    (db as any).where.mockResolvedValue([{ id: 5, locale: 'vi' }]);
    (db.query.farmingAccounts.findFirst as any).mockResolvedValue({
      userId: 5,
      status: 'active',
      workerId: 1,
      proxy: null,
    });
    (db.query.farmingSubscriptions.findFirst as any).mockResolvedValue({
      userId: 5,
      planType: 'basic',
      expiresAt: new Date('2026-07-05T00:00:00Z'),
    });

    const interaction = makeCommandInteraction('status');
    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ ephemeral: true }),
    );
    const replyArg = interaction.reply.mock.calls[0][0];
    const fields: any[] = replyArg.embeds[0].data.fields;
    expect(fields.some((f: any) => f.name === 'game:farming.subscription.status')).toBe(true);
    expect(fields.some((f: any) => f.name === 'game:farming.subscription.expiry')).toBe(true);
  });

  it('TC-07-04: /farming status shows N/A when no subscription', async () => {
    (db as any).where.mockResolvedValue([{ id: 6, locale: 'vi' }]);
    (db.query.farmingAccounts.findFirst as any).mockResolvedValue(null);
    (db.query.farmingSubscriptions.findFirst as any).mockResolvedValue(null);

    const interaction = makeCommandInteraction('status');
    await execute(interaction);

    const replyArg = interaction.reply.mock.calls[0][0];
    const fields: any[] = replyArg.embeds[0].data.fields;
    const expiryField = fields.find((f: any) => f.name === 'game:farming.subscription.expiry');
    expect(expiryField?.value).toBe('N/A');
  });

  it('TC-07-05: /farming setup reply does not contain subscription status and expiry fields', async () => {
    (db as any).where.mockResolvedValue([{ id: 7, locale: 'vi' }]);
    (db.query.farmingSubscriptions.findFirst as any).mockResolvedValue({
      userId: 7,
      planType: 'premium',
      expiresAt: new Date('2026-07-05T00:00:00Z'),
    });

    const interaction = makeCommandInteraction('setup');
    await execute(interaction);

    expect(interaction.reply).toHaveBeenCalled();
    const replyArg = interaction.reply.mock.calls[0][0];
    const fields: any[] = replyArg.embeds[0].data.fields;
    expect(fields.some((f: any) => f.name === 'game:farming.subscription.status')).toBe(false);
    expect(fields.some((f: any) => f.name === 'game:farming.subscription.expiry')).toBe(false);
  });
});
