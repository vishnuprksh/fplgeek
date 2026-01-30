
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
import path from 'path';

const dbPath = path.resolve(process.cwd(), "public/data/fpl.sqlite");
const db = new Database(dbPath);

async function enrichPredictions() {
    console.log("🚀 Enriching Players with Predictions (Next 5 GWs)...");

    // 1. Load Data
    // We need to write back to the 'players' table, so we need the row ID too.
    const playersRows = db.prepare("SELECT id, data FROM players").all();
    const fixturesRows = db.prepare("SELECT data FROM fixtures").all().map((r: any) => JSON.parse(r.data));

    // Fix Teams Parsing (Handle single row array)
    const rawTeamsData = db.prepare("SELECT data FROM teams").all().map((r: any) => JSON.parse(r.data));
    const teamsList = rawTeamsData.flat();
    const teamMap: any = {};
    teamsList.forEach((t: any) => teamMap[t.id] = t);

    // 2. Filter Upcoming Fixtures
    // We want fixtures that haven't started yet.
    // Actually, we just need fixtures for the next few events.
    // Let's filter by 'finished' = false.
    const upcomingFixtures = fixturesRows.filter((f: any) => !f.finished);

    // Sort by time just in case
    upcomingFixtures.sort((a: any, b: any) => new Date(a.kickoff_time).getTime() - new Date(b.kickoff_time).getTime());

    let updatedCount = 0;

    const updateStmt = db.prepare("UPDATE players SET data = ? WHERE id = ?");

    db.transaction(() => {
        for (const row of playersRows) {
            const p = JSON.parse(row.data);
            const smartValue = p.smart_value || 0;

            // If SV is 0, prediction is 0 (or baseline). Let's stick to formula.
            if (!p.team) continue;

            // Find NEXT 5 fixtures for this player's team
            const myFixtures = upcomingFixtures
                .filter((f: any) => f.team_h === p.team || f.team_a === p.team)
                .slice(0, 5);

            const enrichedFixtures = myFixtures.map((f: any) => {
                const isHome = f.team_h === p.team;
                const oppId = isHome ? f.team_a : f.team_h;

                const myTeam = teamMap[p.team];
                const oppTeam = teamMap[oppId];

                let ratio = 1.0;
                let predicted = 0;

                if (myTeam && oppTeam) {
                    const myStr = isHome ? myTeam.strength_overall_home : myTeam.strength_overall_away;
                    const oppStr = isHome ? oppTeam.strength_overall_away : oppTeam.strength_overall_home;

                    if (oppStr > 0) {
                        ratio = myStr / oppStr;
                    }

                    // FORMULA: SV * Ratio
                    predicted = Number((smartValue * ratio).toFixed(2));
                }

                return {
                    id: f.id,
                    event: f.event,
                    kickoff_time: f.kickoff_time,
                    opponent_team: oppId,
                    is_home: isHome,
                    difficulty: isHome ? f.team_h_difficulty : f.team_a_difficulty,
                    predicted_points: predicted,
                    strength_ratio: Number(ratio.toFixed(2))
                };
            });

            // Update Player Object
            p.upcoming_fixtures = enrichedFixtures;
            p.element_type_name = ['?', 'GKP', 'DEF', 'MID', 'FWD'][p.element_type] || '?';

            updateStmt.run(JSON.stringify(p), row.id);
            updatedCount++;
        }
    })();

    console.log(`✅ Updated ${updatedCount} players with predictions.`);
}

enrichPredictions();
