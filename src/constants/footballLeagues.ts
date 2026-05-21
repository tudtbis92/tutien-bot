export interface CuratedLeague {
  id: string;
  name: string;
  country: string;
}

export const CURATED_LEAGUES: CuratedLeague[] = [
  { id: 'eng.1', name: 'Premier League', country: 'England' },
  { id: 'esp.1', name: 'La Liga', country: 'Spain' },
  { id: 'fra.1', name: 'Ligue 1', country: 'France' },
  { id: 'ger.1', name: 'Bundesliga', country: 'Germany' },
  { id: 'ita.1', name: 'Serie A', country: 'Italy' },
  { id: 'uefa.champions', name: 'Champions League', country: 'World' },
  { id: 'uefa.europa', name: 'Europa League', country: 'World' },
  { id: 'uefa.conference', name: 'Conference League', country: 'World' },
  { id: 'fifa.world', name: 'World Cup', country: 'World' },
  { id: 'uefa.euro', name: 'Euro', country: 'World' },
];

export function getLeagueIds(): string[] {
  return CURATED_LEAGUES.map((league) => league.id);
}
