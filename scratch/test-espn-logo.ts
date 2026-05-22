async function main() {
  const url = 'https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard';
  try {
    const res = await fetch(url);
    const data = await res.json();
    const event = data.events?.[0];
    if (!event) return;
    const competition = event.competitions?.[0];
    if (!competition) return;
    console.log('Event Name:', event.name);
    for (const comp of competition.competitors) {
      console.log(`\nCompetitor (${comp.homeAway}):`);
      console.log('Team ID:', comp.team?.id);
      console.log('Display Name:', comp.team?.displayName);
      console.log('Logo:', comp.team?.logo);
      console.log('Color:', comp.team?.color);
      console.log('Alternate Color:', comp.team?.alternateColor);
    }
  } catch (err) {
    console.error('Error:', err);
  }
}
main();
