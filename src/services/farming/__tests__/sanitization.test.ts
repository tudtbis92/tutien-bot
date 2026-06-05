import { describe, it, expect, vi } from 'vitest';
import { FarmingSubscriptionService } from '../subscriptionService.js';

vi.mock('../../../db/client.js', () => ({
  db: {}
}));
import { DEFAULT_FARMING_SETTINGS, type FarmingSettings } from '../../../types/farming.js';

describe('FarmingSubscriptionService - Sanitization', () => {
  const baseSettings: FarmingSettings = {
    ...DEFAULT_FARMING_SETTINGS,
    commands: {
      ...DEFAULT_FARMING_SETTINGS.commands,
      pray: { enabled: true, targetId: null },
      curse: { enabled: true, targetId: null },
      gamble: { enabled: true, amount: 100 },
    },
    economy: {
      ...DEFAULT_FARMING_SETTINGS.economy,
      autoUpgradeHuntbot: true,
    },
    autoGem: {
      ...DEFAULT_FARMING_SETTINGS.autoGem,
      enabled: true,
    },
    antiBan: {
      ...DEFAULT_FARMING_SETTINGS.antiBan,
      socialChatter: true,
      periodicSleep: true,
    },
    moneyTransfer: {
      ...DEFAULT_FARMING_SETTINGS.moneyTransfer,
      enabled: true,
    }
  };

  it('should disable premium features for free plan', () => {
    const sanitized = FarmingSubscriptionService.sanitizeFarmingSettings(baseSettings, 'free');

    expect(sanitized.commands.pray.enabled).toBe(false);
    expect(sanitized.commands.curse.enabled).toBe(false);
    expect(sanitized.commands.gamble.enabled).toBe(false);
    expect(sanitized.economy.autoUpgradeHuntbot).toBe(false);
    expect(sanitized.autoGem.enabled).toBe(false);
    expect(sanitized.antiBan.socialChatter).toBe(false);
    expect(sanitized.antiBan.periodicSleep).toBe(false);
    expect(sanitized.moneyTransfer.enabled).toBe(false);
    
    // Non-premium features should remain untouched
    expect(sanitized.commands.hunt).toBe(true);
    expect(sanitized.commands.battle).toBe(true);
  });

  it('should disable premium features for basic plan', () => {
    const sanitized = FarmingSubscriptionService.sanitizeFarmingSettings(baseSettings, 'basic');

    expect(sanitized.commands.pray.enabled).toBe(false);
    expect(sanitized.commands.curse.enabled).toBe(false);
    expect(sanitized.commands.gamble.enabled).toBe(false);
    expect(sanitized.economy.autoUpgradeHuntbot).toBe(false);
    expect(sanitized.autoGem.enabled).toBe(false);
    expect(sanitized.antiBan.socialChatter).toBe(false);
    expect(sanitized.antiBan.periodicSleep).toBe(false);
    expect(sanitized.moneyTransfer.enabled).toBe(false);
  });

  it('should keep premium features for premium plan', () => {
    const sanitized = FarmingSubscriptionService.sanitizeFarmingSettings(baseSettings, 'premium');

    expect(sanitized.commands.pray.enabled).toBe(true);
    expect(sanitized.commands.curse.enabled).toBe(true);
    expect(sanitized.commands.gamble.enabled).toBe(true);
    expect(sanitized.economy.autoUpgradeHuntbot).toBe(true);
    expect(sanitized.autoGem.enabled).toBe(true);
    expect(sanitized.antiBan.socialChatter).toBe(true);
    expect(sanitized.antiBan.periodicSleep).toBe(true);
    expect(sanitized.moneyTransfer.enabled).toBe(true);
  });
});
