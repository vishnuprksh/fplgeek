
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.resolve(process.cwd(), "public/data/fpl.sqlite");
const db = new Database(dbPath);

const row = db.prepare("SELECT data FROM fixtures LIMIT 1").get();
if (row) {
    const data = JSON.parse(row.data);
    console.log("Fixture Keys:", Object.keys(data));
    console.log("Sample Fixture:", data);
} else {
    console.log("No data found in fixtures");
}
