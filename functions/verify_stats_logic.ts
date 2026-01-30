
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
import path from 'path';

const dbPath = path.resolve(process.cwd(), "public/data/fpl.sqlite");
const db = new Database(dbPath);

interface PlayerStats {
    goals_scored: number;
    assists: number;
    total_points: number;
    minutes: number;
}

function verifyPlayer(playerName: string, expectedSeason: string) {
    const player = db.prepare("SELECT id, data FROM players WHERE json_extract(data, '$.web_name') = ?").get(playerName);

    if (!player) {
        console.error(`Player ${playerName} not found.`);
        return;
    }

    console.log(`\nVerifying ${playerName} (${player.id})...`);

    // Get History from DB
    const history = db.prepare("SELECT data FROM player_history WHERE player_id = ?").all(player.id);

    // 1. Current Season (2025/26) Calculation
    const currentMatches = history.filter((h: any) => {
        const d = JSON.parse(h.data);
        // Current season matches have 'round' and NO 'season_name' usually (or 'season_name'='2025/26')
        // My ingestion script added 'season_name': '2024/25' to past matches.
        // The API matches for current season usually don't have 'season_name' inside 'data' locally?
        // Let's check kickoff time or season_name.
        return (d.kickoff_time?.startsWith('2025') || d.season_name === '2025/26') && d.round;
    });

    console.log(`\n--- 2025/26 Stats (${currentMatches.length} matches) ---`);
    const currentTotals = calculateTotals(currentMatches);
    console.log(currentTotals);

    // 2. Past Season (2024/25) matching
    const pastMatches = history.filter((h: any) => {
        const d = JSON.parse(h.data);
        return d.season_name === '2024/25' && d.round !== undefined;
    });

    console.log(`\n--- 2024/25 Stats from Matches (${pastMatches.length} matches) ---`);
    const pastTotals = calculateTotals(pastMatches);
    console.log(pastTotals);

    // 3. Past Season Summary comparison
    const pastSummary = history.find((h: any) => {
        const d = JSON.parse(h.data);
        return (d.season_name === '2024/25' || d.season === '2024/25') && d.round === undefined;
    });

    if (pastSummary) {
        const summaryData = JSON.parse(pastSummary.data);
        console.log(`\n--- 2024/25 Summary from DB ---`);
        console.log({
            goals_scored: summaryData.goals_scored,
            assists: summaryData.assists,
            total_points: summaryData.total_points,
            minutes: summaryData.minutes
        });

        // Verification check
        const pointsDiff = pastTotals.total_points - summaryData.total_points;
        if (pointsDiff === 0) {
            console.log("✅ 2024/25 Points Match!");
        } else {
            console.warn(`❌ Points Mismatch! Diff: ${pointsDiff}`);
        }
    } else {
        console.warn("No 2024/25 Summary found to compare against.");
    }
}

function calculateTotals(matches: any[]): PlayerStats {
    return matches.reduce((acc: PlayerStats, h: any) => {
        const d = JSON.parse(h.data);
        return {
            goals_scored: acc.goals_scored + (d.goals_scored || 0),
            assists: acc.assists + (d.assists || 0),
            total_points: acc.total_points + (d.total_points || 0),
            minutes: acc.minutes + (d.minutes || 0)
        };
    }, { goals_scored: 0, assists: 0, total_points: 0, minutes: 0 });
}

// Verify Haaland, Salah, Palmer
verifyPlayer("Haaland", "2024/25");
verifyPlayer("Salah", "2024/25");
verifyPlayer("Palmer", "2024/25");
