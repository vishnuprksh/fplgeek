import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
import path from 'path';

const dbPath = path.resolve(process.cwd(), "public/data/fpl.sqlite");
const db = new Database(dbPath);

interface TeamStats {
    id: number;
    name: string;
    short_name: string;
    played: number;
    goalsScored: number;
    goalsConceded: number;
    homeGoalsScored: number;
    homeGoalsConceded: number;
    awayGoalsScored: number;
    awayGoalsConceded: number;
}

async function runAnalysis() {
    console.log("📊 Starting Fixture Analysis (Team Stats)...");

    // 1. Load Teams
    const teamsData = db.prepare("SELECT data FROM teams WHERE id = 'teams'").get();
    if (!teamsData) {
        console.error("❌ No teams data found. Run ingestion first.");
        return;
    }
    const rawTeams = JSON.parse(teamsData.data);

    // 2. Load Fixtures
    const rawFixtures = db.prepare("SELECT data FROM fixtures").all().map((r: any) => JSON.parse(r.data));
    console.log(`Loaded ${rawFixtures.length} fixtures.`);

    // 3. Initialize Stats
    const stats: Record<number, TeamStats> = {};
    rawTeams.forEach((team: any) => {
        stats[team.id] = {
            id: team.id,
            name: team.name,
            short_name: team.short_name,
            played: 0,
            goalsScored: 0,
            goalsConceded: 0,
            homeGoalsScored: 0,
            homeGoalsConceded: 0,
            awayGoalsScored: 0,
            awayGoalsConceded: 0
        };
    });

    // 4. Process Finished Matches
    rawFixtures.filter((m: any) => m.finished).forEach((match: any) => {
        const home = stats[match.team_h];
        const away = stats[match.team_a];

        if (home && away) {
            home.played++;
            away.played++;

            // Total Stats
            home.goalsScored += match.team_h_score;
            home.goalsConceded += match.team_a_score;
            away.goalsScored += match.team_a_score;
            away.goalsConceded += match.team_h_score;

            // Granular Stats
            home.homeGoalsScored += match.team_h_score;
            home.homeGoalsConceded += match.team_a_score;
            away.awayGoalsScored += match.team_a_score;
            away.awayGoalsConceded += match.team_h_score;
        }
    });

    // 5. Create Analysis Table
    db.exec(`
        CREATE TABLE IF NOT EXISTS team_analysis (
            team_id INTEGER PRIMARY KEY,
            data TEXT
        );
    `);

    // 6. Save Stats
    const insert = db.prepare("INSERT OR REPLACE INTO team_analysis (team_id, data) VALUES (?, ?)");
    const tx = db.transaction(() => {
        Object.values(stats).forEach(s => {
            insert.run(s.id, JSON.stringify(s));
        });
    });
    tx();

    console.log(`✅ Success! Calculated stats for ${Object.keys(stats).length} teams.`);

    // Sample Output
    const arsenal = stats[1]; // Arsenal is ID 1 in 24/25
    if (arsenal) {
        console.log(`Sample (Arsenal): GS=${arsenal.goalsScored}, GC=${arsenal.goalsConceded}`);
    }
}

runAnalysis().catch(console.error);
