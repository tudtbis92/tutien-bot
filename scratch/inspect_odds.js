import 'dotenv/config';
import { db } from '../src/db/client.js';
import { apiCache } from '../src/db/schema/apiCache.js';
import { desc, like } from 'drizzle-orm';

async function main() {
  const records = await db
    .select()
    .from(apiCache)
    .where(like(apiCache.cacheKey, 'espn:%'))
    .orderBy(desc(apiCache.createdAt))
    .limit(5);

  console.log(`Found ${records.length} records in cache.`);
  for (const record of records) {
    const data = record.responseData;
    if (data && data.events) {
      console.log(`League cache: ${record.cacheKey}`);
      for (const event of data.events) {
        const competition = event.competitions?.[0];
        if (competition && competition.odds) {
          console.log(`Match: ${event.name}`);
          console.log(`Odds structure:`, JSON.stringify(competition.odds, null, 2));
          break; // Chỉ in 1 match để xem mẫu
        }
      }
    }
  }
  process.exit(0);
}

main().catch(console.error);
