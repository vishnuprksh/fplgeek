
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.resolve(process.cwd(), "public/data/fpl.sqlite");
const db = new Database(dbPath);

const row = db.prepare("SELECT data FROM player_history LIMIT 1").get();
if (row) {
    const data = JSON.parse(row.data);
    console.log("Player History Keys:", Object.keys(data));
    console.log("Sample Data:", data);
} else {
    console.log("No data found in player_history");
}

const teamRow = db.prepare("SELECT data FROM teams LIMIT 1").get();
if (teamRow) {
    console.log("Team Keys:", Object.keys(JSON.parse(teamRow.data)));
}
