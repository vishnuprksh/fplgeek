
import * as logger from "firebase-functions/logger";
import { db } from "./init";

interface TeamStats {
    id: number;
    homeGoalsScored: number;
    homeGoalsConceded: number;
    awayGoalsScored: number;
    awayGoalsConceded: number;
    homeMatches: number;
    awayMatches: number;
    short_name?: string;
}

export async function generateProjections() {
    logger.info("🔮 Generating AI 5-Week Predictions (Cloud)...");

    // 1. Fetch Data
    const [playersSnap, fixturesSnap, staticEventsSnap, staticTeamsSnap] = await Promise.all([
        db.collection('players').get(),
        db.collection('fixtures').get(),
        db.collection('static').doc('events').get(),
        db.collection('static').doc('teams').get()
    ]);

    const players = playersSnap.docs.map(doc => ({ id: Number(doc.id), ...doc.data() as any }));
    const fixtures = fixturesSnap.docs.map(doc => ({ id: Number(doc.id), ...doc.data() as any }));

    // Parse Static Data
    const eventsData = staticEventsSnap.data()?.data || [];
    const teamsData = staticTeamsSnap.data()?.data || [];

    const currentEvent = eventsData.find((e: any) => e.is_current)?.id || 1;
    const next5Gws = Array.from({ length: 5 }, (_, i) => currentEvent + 1 + i);

    logger.info(`Targeting GW${next5Gws[0]} to GW${next5Gws[4]}...`);

    // 2. Calculate Team Stats (on the fly)
    const teamStats: Record<number, TeamStats> = {};
    teamsData.forEach((t: any) => {
        teamStats[t.id] = {
            id: t.id, short_name: t.short_name,
            homeGoalsScored: 0, homeGoalsConceded: 0,
            awayGoalsScored: 0, awayGoalsConceded: 0,
            homeMatches: 0, awayMatches: 0
        };
    });

    fixtures.forEach((f: any) => {
        if (f.finished && f.team_h_score !== null) {
            // Home Team
            if (teamStats[f.team_h]) {
                teamStats[f.team_h].homeGoalsScored += f.team_h_score;
                teamStats[f.team_h].homeGoalsConceded += f.team_a_score;
                teamStats[f.team_h].homeMatches++;
            }
            // Away Team
            if (teamStats[f.team_a]) {
                teamStats[f.team_a].awayGoalsScored += f.team_a_score;
                teamStats[f.team_a].awayGoalsConceded += f.team_h_score;
                teamStats[f.team_a].awayMatches++;
            }
        }
    });

    // Normalize per match averages? 
    // The original logic used SUM totals (risk = conceded + scored). 
    // "risk = myTeam.homeGoalsConceded + oppTeam.awayGoalsScored"
    // If we use totals, it's skewed by games played. But usually everyone has similar games played.
    // Let's stick to totals or averages? The typical scale in original code was '50' for normalization.
    // 50 goals in a season is high. 
    // If we are mid-season, totals works.
    // Let's use averages * 19 (full season) to be safe? Or just use averages?
    // Original code: "Math.max(0, 1 - (risk / 50))". 
    // If risk is 20 (mid season), value is 0.6.
    // If risk is 2 (GW2), value is 0.96.
    // So the original code assumes season-long totals?
    // Actually, local DB team_analysis likely had season totals or similar.
    // To make it robust for ANY point in season, let's project to 38 games or use per-game * 38?
    // Let's use per-game * 19 (half season) scaling factor approx 25?
    // Better: Average per match. 
    // Risk = (Conceded/Match + Scored/Match).
    // Max per match is ~3 + ~3 = 6.
    // Normalize: 1 - (Result / 6).
    // Let's adapt to per-game stats for robustness.

    // 3. Process Predictions
    const projections: any[] = [];

    const getRate = (val: number, matches: number) => matches > 0 ? val / matches : 0;

    for (const p of players) {
        // Validation
        if (p.status === 'u' || p.status === 'i' || p.status === 'n') continue; // Skip unavailable/injured? Local script didn't skip. Keep all?
        // Local script: `rawPlayers.forEach`. No filter.

        let sv = p.smart_value || 50;
        // Normalize SV (0-100 -> 0-1)
        const normSV = sv / 100;

        const weeklyProjections: any[] = [];
        let totalProjection = 0;

        next5Gws.forEach(gw => {
            // Find fixture
            // Fixture struct: team_h, team_a, event
            const fixture = fixtures.find((f: any) => f.event === gw && (f.team_h === p.team || f.team_a === p.team));

            if (!fixture) {
                weeklyProjections.push({ gw, xP: 0, opponent: 'BLANK', isHome: false });
                return;
            }

            const isHome = fixture.team_h === p.team;
            const oppId = isHome ? fixture.team_a : fixture.team_h;

            const myTeamStats = teamStats[p.team];
            const oppTeamStats = teamStats[oppId];

            if (!myTeamStats || !oppTeamStats) {
                weeklyProjections.push({ gw, xP: 0, opponent: 'ERR', isHome });
                return;
            }

            // Calculate Fixture Potential
            // Using average per match stats to be robust


            let fixPot = 0;
            if (p.element_type <= 2) { // GKP/DEF (Clean sheet potential)
                // Risk = My Avg Conceded + Opp Avg Scored
                const myConcededRate = isHome ? getRate(myTeamStats.homeGoalsConceded, myTeamStats.homeMatches) : getRate(myTeamStats.awayGoalsConceded, myTeamStats.awayMatches);
                const oppScoredRate = isHome ? getRate(oppTeamStats.awayGoalsScored, oppTeamStats.awayMatches) : getRate(oppTeamStats.homeGoalsScored, oppTeamStats.homeMatches);

                const risk = myConcededRate + oppScoredRate; // Max approx 5-6
                // Normalize: 0 risk = 1.0. 4.0 risk = 0.0?
                // Let's say max risk is 4.0 (2 concede avg + 2 score avg is very high).
                fixPot = Math.max(0, 1 - (risk / 4));
            } else { // MID/FWD (Goal potential)
                // Potential = My Avg Scored + Opp Avg Conceded
                const myScoredRate = isHome ? getRate(myTeamStats.homeGoalsScored, myTeamStats.homeMatches) : getRate(myTeamStats.awayGoalsScored, myTeamStats.awayMatches);
                const oppConcededRate = isHome ? getRate(oppTeamStats.awayGoalsConceded, oppTeamStats.awayMatches) : getRate(oppTeamStats.homeGoalsConceded, oppTeamStats.homeMatches);

                const potential = myScoredRate + oppConcededRate; // Max approx 5-6
                fixPot = Math.min(1, potential / 4);
            }

            // Weights
            let wSV = 0.85;
            if (p.element_type === 1) wSV = 0.80;
            const wFix = 1 - wSV;

            const score = (wSV * normSV) + (wFix * fixPot);
            const xP = Number((score * 7).toFixed(1)); // Scale to FPL points

            weeklyProjections.push({
                gw,
                xP,
                opponent: oppTeamStats.short_name || 'UNK',
                isHome
            });
            totalProjection += xP;
        });

        const predData = {
            id: p.id,
            name: p.web_name,
            team: teamStats[p.team]?.short_name || 'UNK',
            type: p.element_type,
            projections: weeklyProjections,
            total5Week: Number(totalProjection.toFixed(1)),
            updated_at: new Date().toISOString()
        };
        projections.push(predData);
    }

    // Fix batching logic:
    // Just loop projections array in chunks.
    // The previous loop populated `projections` array.
    // So let's just write them now.

    // Clear the previous batch attempt mess first.

    const CHUNK_SIZE = 400;
    for (let i = 0; i < projections.length; i += CHUNK_SIZE) {
        const chunk = projections.slice(i, i + CHUNK_SIZE);
        const batch = db.batch(); // New batch
        chunk.forEach(data => {
            const ref = db.collection('predictions').doc(data.id.toString());
            batch.set(ref, data);
        });
        await batch.commit();
        logger.info(`Saved batch ${i / CHUNK_SIZE + 1}`);
    }

    logger.info(`✅ Generated & Saved projections for ${projections.length} players.`);
}
