
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
import path from 'path';

const dbPath = path.resolve(process.cwd(), "public/data/fpl.sqlite");
const db = new Database(dbPath);

const queries = ['Tomiyasu', 'Partey', 'Rodri', 'Diaz', 'Haaland', 'Semedo', 'Duran', 'Vardy', 'Evans'];


console.log(`Searching for Arsenal players (Team 1)...`);
// Assuming team 1 is Arsenal. The data logic saves teams. Let's just assume and check names.
const res = db.prepare("SELECT data FROM players").all();
const arsenal = res.filter((r: any) => JSON.parse(r.data).team === 1);

arsenal.forEach((r: any) => {
    const d = JSON.parse(r.data);
    console.log(`- ${d.first_name} ${d.second_name} (Web: ${d.web_name})`);
});

