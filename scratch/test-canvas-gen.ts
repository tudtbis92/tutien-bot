import { promises as fs } from 'fs';
import path from 'path';
import { PredictionImageService } from '../src/services/football/predictionImageService.js';
import type { FootballMatch } from '../src/db/schema/footballMatches.js';

async function main() {
  console.log('Starting visual Clash Card rendering test...');
  
  // Mock FootballMatch object representing Brighton vs Man United
  const mockMatch: FootballMatch = {
    id: 9999,
    fixtureId: 'espn:69999',
    leagueId: 'eng.1',
    leagueName: 'English Premier League',
    season: 2026,
    homeTeamId: '331',
    homeTeamName: 'Brighton & Hove Albion',
    awayTeamId: '360',
    awayTeamName: 'Manchester United',
    kickoffAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // Kickoff in 24h
    status: 'NS',
    homeScore: 0,
    awayScore: 0,
    homeOdds: '2.40',
    drawOdds: '3.50',
    awayOdds: '2.80',
    overUnderLine: '2.5',
    overOdds: '1.90',
    underOdds: '1.90',
    homeSpreadLine: '0',
    homeSpreadOdds: '1.85',
    awaySpreadLine: '0',
    awaySpreadOdds: '2.05',
    homeTeamLogo: 'https://a.espncdn.com/i/teamlogos/soccer/500/331.png',
    awayTeamLogo: 'https://a.espncdn.com/i/teamlogos/soccer/500/360.png',
    homeTeamColor: '0606fa',
    awayTeamColor: 'da020e',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const imageService = PredictionImageService.getInstance();
  
  try {
    console.log('Generating clash card image buffer...');
    const buffer = await imageService.getClashCardBuffer(mockMatch);
    
    const outputPath = path.join(process.cwd(), 'scratch', 'test_match_card.png');
    await fs.writeFile(outputPath, buffer);
    console.log(`✓ Match clash card generated successfully! Saved to: ${outputPath}`);
  } catch (err) {
    console.error('✗ Failed to generate match card:', err);
  }
}

main();
