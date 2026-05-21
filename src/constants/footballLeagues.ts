export interface CuratedLeague {
  id: number;
  name: string;
  country: string;
}

export const CURATED_LEAGUES: CuratedLeague[] = [
  { id: 39, name: 'Premier League', country: 'England' },
  { id: 140, name: 'La Liga', country: 'Spain' },
  { id: 61, name: 'Ligue 1', country: 'France' },
  { id: 78, name: 'Bundesliga', country: 'Germany' },
  { id: 135, name: 'Serie A', country: 'Italy' },
  { id: 2, name: 'Champions League', country: 'World' },
  { id: 3, name: 'Europa League', country: 'World' },
  { id: 848, name: 'Conference League', country: 'World' },
  { id: 1, name: 'World Cup', country: 'World' },
  { id: 4, name: 'Euro', country: 'World' },
];

export function getLeagueIds(): number[] {
  return CURATED_LEAGUES.map((league) => league.id);
}
