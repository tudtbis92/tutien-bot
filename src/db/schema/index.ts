// Re-exports all schema definitions for use in Drizzle ORM and drizzle-kit
// Used as the single entry point in drizzle.config.ts schema field

// Phase 1 schemas
export * from './users.js';
export * from './seasons.js';

// Phase 2 schemas
export * from './characters.js';
export * from './items.js';
export * from './character_items.js';
export * from './recipes.js';
export * from './recipe_ingredients.js';
export * from './guild_activity.js';

// Phase 2.1 schemas
export * from './gather_pool_items.js';

// Phase 02.2 schemas
export * from './footballMatches.js';
export * from './footballBets.js';
export * from './footballAnnouncements.js';
export * from './apiCache.js';
export * from './predictionChannels.js';
export * from './farming.js';

// Phase 8 schemas
export * from './mapNodes.js';
export * from './walletTransactions.js';
export * from './heroes.js';
export * from './heroFactions.js';
export * from './heroClasses.js';
export * from './heroFamilies.js';
export * from './heroRelations.js';
export * from './userHeroes.js';
export * from './playerTravelState.js';
export * from './sanguoBattles.js';
export * from './sanguoItems.js';
export * from './userSanguoItems.js';
export * from './encounterRuns.js';
export * from './captureAttempts.js';
export * from './userSanguoState.js';

// Phase 8 post-gate schemas
export * from './formations.js';
export * from './formationChemistryLinks.js';
export * from './formationChemistryLinks.js';

// Phase 9 schemas (mapEdges authored in 09-01 — re-exported here so drizzle-kit
// generate, which reads index.ts, sees the table at 09-05 migration time)
export * from './mapZones.js';
export * from './mapEdges.js';
export * from './heroZoneRates.js';

// Phase 11 schemas (migration 0020 — 11-01)
export * from './sanguoSkills.js';
export * from './userHeroSoulgems.js';
export * from './userLegions.js';
export * from './soulgemTransactions.js';