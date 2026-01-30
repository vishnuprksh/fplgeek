
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
import path from 'path';

const dbPath = path.resolve(process.cwd(), "public/data/fpl.sqlite");
const db = new Database(dbPath);

const haaland = db.prepare("SELECT id, data FROM players WHERE json_extract(data, '$.web_name') = 'Haaland'").get();

if (!haaland) {
    console.log("Haaland not found in players table.");
} else {
    console.log(`Found Haaland: ID ${haaland.id}`);

    // Check history
    const history = db.prepare("SELECT fixture_id, data FROM player_history WHERE player_id = ?").all(haaland.id);
    console.log(`Found ${history.length} history entries.`);

    const seasons = new Set();
    let currentSeasonCount = 0;

    history.forEach((h: any) => {
        const data = JSON.parse(h.data);
        if (data.season_name) {
            seasons.add(data.season_name);
        } else if (data.season) {
            seasons.add(data.season);
        } else {
            // Likely current season
            currentSeasonCount++;
            if (currentSeasonCount <= 5) {
                console.log("Current season sample:", data);
            }
        }
    });

    console.log("Past Seasons found:", Array.from(seasons));
    console.log("Current Season entries:", currentSeasonCount);
}
