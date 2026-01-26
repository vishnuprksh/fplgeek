
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
import path from 'path';

const dbPath = path.resolve(process.cwd(), "public/data/fpl.sqlite");
const db = new Database(dbPath);

const non2025 = db.prepare("SELECT count(*) as c FROM player_history WHERE json_extract(data, '$.kickoff_time') NOT LIKE '2025%'").get();
console.log("Rows NOT 2025:", non2025.c);

// Get min/max round
const rounds = db.prepare("SELECT min(cast(json_extract(data, '$.round') as int)) as minR, max(cast(json_extract(data, '$.round') as int)) as maxR FROM player_history").get();
console.log("Round Range:", rounds);

// Sample first 5 rows that are NOT 2025 if any
if (non2025.c > 0) {
    const rows = db.prepare("SELECT data FROM player_history WHERE json_extract(data, '$.kickoff_time') NOT LIKE '2025%' LIMIT 5").all();
    rows.forEach((r: any) => console.log(r.data));
}
