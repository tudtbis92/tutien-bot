export const OWO_BOT_ID = '408785106942164992';

export interface FarmingSettings {
  active: boolean;
  channelId: string | null;
  commands: {
    hunt: boolean;
    battle: boolean;
    pray: {
      enabled: boolean;
      targetId: string | null;
    };
    curse: {
      enabled: boolean;
      targetId: string | null;
    };
    gamble: {
      enabled: boolean;
      amount: number;
    };
  };
  economy: {
    sacrificeRanks: string[];
    sellRanks: string[];
    autoUpgradeHuntbot: boolean;
    upgradePriority: string[];
  };
  autoGem: {
    enabled: boolean;
    preferredTiers: {
      hunting: number;
      lucky: number;
      empowering: number;
    };
    useSpecialGemsDuringEvents: boolean;
  };
  delays: {
    minSeconds: number;
    maxSeconds: number;
  };
  antiBan: {
    socialChatter: boolean;
    periodicSleep: boolean;
  };
  moneyTransfer: {
    enabled: boolean;
    mainAccountId: string | null;
    threshold: number;
  };
}

export const DEFAULT_FARMING_SETTINGS: FarmingSettings = {
  active: false,
  channelId: null,
  commands: {
    hunt: true,
    battle: true,
    pray: { enabled: false, targetId: null },
    curse: { enabled: false, targetId: null },
    gamble: { enabled: false, amount: 100 },
  },
  economy: {
    sacrificeRanks: ['common', 'uncommon'],
    sellRanks: ['rare', 'epic'],
    autoUpgradeHuntbot: true,
    upgradePriority: ['efficiency', 'gain', 'duration'],
  },
  autoGem: {
    enabled: true,
    preferredTiers: {
      hunting: 3,
      lucky: 3,
      empowering: 1,
    },
    useSpecialGemsDuringEvents: true,
  },
  delays: {
    minSeconds: 15,
    maxSeconds: 25,
  },
  antiBan: {
    socialChatter: true,
    periodicSleep: true,
  },
  moneyTransfer: {
    enabled: false,
    mainAccountId: null,
    threshold: 50000,
  },
};
