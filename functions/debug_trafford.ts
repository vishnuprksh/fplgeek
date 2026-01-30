
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
import path from 'path';

const dbPath = path.resolve(process.cwd(), "public/data/fpl.sqlite");
const db = new Database(dbPath);

const p = db.prepare("SELECT * FROM players WHERE data LIKE '%Trafford%'").get();
if (!p) {
    console.log("Player not found");
} else {
    const data = JSON.parse(p.data);
    console.log(`Found ${data.web_name} (ID: ${data.id}, Type: ${data.element_type})`);
    console.log(`Smart Value: ${data.smart_value}`);

    // Get History
    const historyRows = db.prepare("SELECT data FROM player_history WHERE player_id = ?").all(data.id);
    const history = historyRows.map((r: any) => JSON.parse(r.data));
    console.log(`History Entries: ${history.length}`);

    history.forEach((h: any, idx: number) => {
        const absRound = h.round || 999;
        console.log(`[${idx}] R${h.round} (Abs:${absRound}) Time:${h.kickoff_time} (${h.season_name || 'Current'}): Mins=${h.minutes} xGC=${h.expected_goals_conceded} SV=${h.smart_value}`);
    });
}
