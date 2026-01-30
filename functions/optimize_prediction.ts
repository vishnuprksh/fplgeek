
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
import path from 'path';

const dbPath = path.resolve(process.cwd(), "public/data/fpl.sqlite");
const db = new Database(dbPath);

// Optimized Weights for Form (from optimize_sv.ts)
const PARAMS: { [key: number]: any } = {
    1: { lambda: 0.3, weights: { xg: 0.02, xa: 0.61, cs: 0.17, saves: 0.00, xgc_inv: 0.29, minutes_rel: 0.76 } },
    2: { lambda: 0.5, weights: { xg: 0.26, xa: 0.13, cs: 0.06, saves: 0.82, xgc_inv: 0.12, minutes_rel: 0.80 } },
    3: { lambda: 0.1, weights: { xg: 0.99, xa: 0.95, cs: 0.09, saves: 0.46, xgc_inv: 0.05, minutes_rel: 0.45 } },
    4: { lambda: 0.3, weights: { xg: 0.21, xa: 0.99, cs: 0.34, saves: 0.82, xgc_inv: 0.00, minutes_rel: 0.36 } },
};

function calculateEMA(values: number[], lambda: number): number {
    if (values.length === 0) return 0;
    let num = 0, den = 0;
    for (let i = 0; i < values.length; i++) {
        const val = values[i];
        const age = values.length - 1 - i;
        const weight = Math.exp(-lambda * age);
        num += val * weight;
        den += weight;
    }
    return den === 0 ? 0 : num / den;
}

function calculateCorrelation(x: number[], y: number[]): number {
    const n = x.length;
    if (n < 2) return 0;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
    for (let i = 0; i < n; i++) {
        sumX += x[i];
        sumY += y[i];
        sumXY += x[i] * y[i];
        sumX2 += x[i] * x[i];
        sumY2 += y[i] * y[i];
    }
    const num = n * sumXY - sumX * sumY;
    const den = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    return den === 0 ? 0 : num / den;
}

async function optimizePrediction() {
    console.log("🚀 Starting Advanced Prediction Optimization...");

    // 1. Data Loading
    const players = db.prepare("SELECT data FROM players").all().map((r: any) => JSON.parse(r.data));
    const historyRows = db.prepare("SELECT player_id, fixture_id, data FROM player_history").all();
    const fixturesRows = db.prepare("SELECT data FROM fixtures").all().map((r: any) => JSON.parse(r.data));

    // Fix Teams Parsing: The table might have 1 row with ALL teams
    const rawTeamsData = db.prepare("SELECT data FROM teams").all().map((r: any) => JSON.parse(r.data));
    const teamsList = rawTeamsData.flat();

    // Lookup Maps
    const fixtureMap: any = {};
    fixturesRows.forEach((f: any) => fixtureMap[f.id] = f);

    const teamMap: any = {};
    teamsList.forEach((t: any) => teamMap[t.id] = t);

    console.log(`Loaded ${players.length} players, ${fixturesRows.length} fixtures, ${teamsList.length} teams.`);

    const historyMap = historyRows.reduce((acc: any, r: any) => {
        if (!acc[r.player_id]) acc[r.player_id] = [];
        const h = JSON.parse(r.data);
        h._fid = r.fixture_id;
        acc[r.player_id].push(h);
        return acc;
    }, {});

    // 2. Iterative Testing
    // We will collect "Predictions" vs "Actuals" for different models
    const results: { [key: number]: any[] } = { 1: [], 2: [], 3: [], 4: [] };

    players.forEach((p: any) => {
        const hist = historyMap[p.id];
        if (!hist || hist.length < 2) return;

        // Sort by time
        const cleanHist = hist
            .filter((h: any) => h.minutes <= 120 && h.kickoff_time)
            .sort((a: any, b: any) => new Date(a.kickoff_time).getTime() - new Date(b.kickoff_time).getTime());

        const type = p.element_type as 1 | 2 | 3 | 4;

        for (let i = 0; i < cleanHist.length - 1; i++) {
            const current = cleanHist[i];
            const next = cleanHist[i + 1];

            // Only predict for players who play (performance model)
            if (next.minutes === 0) continue;

            const fid = next._fid;
            const fixture = fixtureMap[fid];
            if (!fixture) continue;

            // DETERMINE TEAM STRENGTHS
            const isHome = fixture.team_h === next.opponent_team ? false : true;

            const myTeamId = isHome ? fixture.team_h : fixture.team_a;
            const oppTeamId = isHome ? fixture.team_a : fixture.team_h;

            const myTeam = teamMap[myTeamId];
            const oppTeam = teamMap[oppTeamId];

            if (!myTeam || !oppTeam) continue;

            const myAtt = isHome ? myTeam.strength_attack_home : myTeam.strength_attack_away;
            const myDef = isHome ? myTeam.strength_defence_home : myTeam.strength_defence_away;

            const oppAtt = isHome ? oppTeam.strength_attack_away : oppTeam.strength_attack_home;
            const oppDef = isHome ? oppTeam.strength_defence_away : oppTeam.strength_defence_home;

            const attackAdvntg = myAtt / oppDef; // >1 if My Attack > Opp Def
            const defenseAdvntg = myDef / oppAtt; // >1 if My Def > Opp Att

            // MODEL 1: SIMPLE SMART VALUE (Control)
            const m1 = current.smart_value || 0;

            // MODEL 3: Overall Strength Ratio
            const myOver = isHome ? myTeam.strength_overall_home : myTeam.strength_overall_away;
            const oppOver = isHome ? oppTeam.strength_overall_away : oppTeam.strength_overall_home;
            const m3 = m1 * (myOver / oppOver);

            // MODEL 4: Attack Specific (For MID/FWD)
            // My Attack vs Opp Defense
            const m4 = m1 * attackAdvntg;

            // MODEL 5: Defense Specific (For GKP/DEF)
            // My Defense vs Opp Attack
            const m5 = m1 * defenseAdvntg;

            results[type].push({
                actual: next.total_points,
                m1,
                m3,
                m4,
                m5
            });
        }
    });

    console.log("\n## Specific Ratio Comparison (Correlation r)\n");
    console.log("| Pos | Pairs | Base SV | Overall (M3) | Att (M4) | Def (M5) | Winner |");
    console.log("|---|---|---|---|---|---|---|");

    for (const t of [1, 2, 3, 4]) {
        const data = results[t];
        if (data.length < 50) continue;

        const r1 = calculateCorrelation(data.map(d => d.m1), data.map(d => d.actual));
        const r3 = calculateCorrelation(data.map(d => d.m3), data.map(d => d.actual));
        const r4 = calculateCorrelation(data.map(d => d.m4), data.map(d => d.actual));
        const r5 = calculateCorrelation(data.map(d => d.m5), data.map(d => d.actual));

        const max = Math.max(r1, r3, r4, r5);
        let win = "Base";
        if (max === r3) win = "Overall";
        if (max === r4) win = "Attack";
        if (max === r5) win = "Defense";

        const pos = ['?', 'GKP', 'DEF', 'MID', 'FWD'][t];
        console.log(`| ${pos} | ${data.length} | ${r1.toFixed(3)} | ${r3.toFixed(3)} | ${r4.toFixed(3)} | ${r5.toFixed(3)} | ${win} |`);
    }
}

optimizePrediction();
