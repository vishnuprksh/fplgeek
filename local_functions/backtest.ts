
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
import path from 'path';

// Solver Logic (Simplified/Ported for Node)
const POSITIONS = { GKP: 1, DEF: 2, MID: 3, FWD: 4 };
const FORMATIONS = [
    { GKP: 1, DEF: 3, MID: 5, FWD: 1 },
    { GKP: 1, DEF: 3, MID: 4, FWD: 3 },
    { GKP: 1, DEF: 4, MID: 3, FWD: 3 },
    { GKP: 1, DEF: 4, MID: 4, FWD: 2 },
    { GKP: 1, DEF: 4, MID: 5, FWD: 1 },
    { GKP: 1, DEF: 5, MID: 3, FWD: 2 },
    { GKP: 1, DEF: 5, MID: 4, FWD: 1 },
    { GKP: 1, DEF: 5, MID: 2, FWD: 3 }, // Rare but valid?
];

interface Player {
    id: number;
    element_type: number;
    now_cost: number; // In tenths (e.g. 150 = 15.0)
    web_name: string;
    team: number;
    xP: number;
    actualPoints: number;
}

function solve(players: Player[], budget: number) {
    // 1. Filter viable players (xP > 0)
    const pool = players.filter(p => p.xP > 0 || p.now_cost <= 40).sort((a, b) => b.xP - a.xP);

    // Heuristic Solver:
    // A full Knapsack or ILP is hard in JS without libraries.
    // Let's use a Greedy approach with Swaps (Hill Climbing).

    // Greedy Fill:
    // Select best 2 GKP, 5 DEF, 5 MID, 3 FWD by xP/Cost value? 
    // Or just best xP within budget?

    // Let's try simple randomized hill climbing for speed and "good enough" result.
    // Initialization: Pick best xP players for each slot until full.

    let squad: Player[] = [];
    const positions = [1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 4, 4, 4]; // 2 GKP, 5 DEF, 5 MID, 3 FWD

    // Fill buckets
    const gkp = pool.filter(p => p.element_type === 1);
    const def = pool.filter(p => p.element_type === 2);
    const mid = pool.filter(p => p.element_type === 3);
    const fwd = pool.filter(p => p.element_type === 4);

    squad.push(...gkp.slice(0, 2));
    squad.push(...def.slice(0, 5));
    squad.push(...mid.slice(0, 5));
    squad.push(...fwd.slice(0, 3));

    if (squad.length < 15) return null; // Not enough players?

    // Optimization Loop
    let bestSquad = [...squad];
    let bestScore = evaluate(bestSquad, budget);

    const ITERATIONS = 50000;

    for (let i = 0; i < ITERATIONS; i++) {
        // Randomly Pick a player to swap out
        const idxOut = Math.floor(Math.random() * 15);
        const pOut = squad[idxOut];

        // Pick a replacement from pool of same type
        let candidates: Player[] = [];
        if (pOut.element_type === 1) candidates = gkp;
        else if (pOut.element_type === 2) candidates = def;
        else if (pOut.element_type === 3) candidates = mid;
        else candidates = fwd;

        // Heuristic: Prefer high xP, but random allows exploration
        // Bias towards top 50 of that position
        const pIn = candidates[Math.floor(Math.random() * Math.min(candidates.length, 50))];

        if (!pIn || pIn.id === pOut.id || squad.find(s => s.id === pIn.id)) continue;

        // Swap
        squad[idxOut] = pIn;

        const score = evaluate(squad, budget);
        if (score > bestScore) {
            bestScore = score;
            bestSquad = [...squad];
        } else {
            // Revert
            squad[idxOut] = pOut;
        }
    }

    // Final check for Starting XI maximization
    return optimizeStartingXI(bestSquad);
}

function evaluate(squad: Player[], budget: number) {
    // Constraints
    const cost = squad.reduce((acc, p) => acc + p.now_cost, 0);
    if (cost > budget) return -1;

    const teams = new Map<number, number>();
    for (const p of squad) {
        teams.set(p.team, (teams.get(p.team) || 0) + 1);
        if ((teams.get(p.team) || 0) > 3) return -1;
    }

    // Score = Starting XI xP
    return optimizeStartingXI(squad).score;
}

function optimizeStartingXI(squad: Player[]) {
    // Find best formation logic
    // Sort squad by xP
    const gkp = squad.filter(p => p.element_type === 1).sort((a, b) => b.xP - a.xP);
    const def = squad.filter(p => p.element_type === 2).sort((a, b) => b.xP - a.xP);
    const mid = squad.filter(p => p.element_type === 3).sort((a, b) => b.xP - a.xP);
    const fwd = squad.filter(p => p.element_type === 4).sort((a, b) => b.xP - a.xP);

    let bestFormationScore = -1;
    let bestXI: Player[] = [];
    let bench: Player[] = [];

    FORMATIONS.forEach(fmt => {
        // Must have enough players (always true with 15)
        const xi = [
            gkp[0], // Best keeper consistently
            ...def.slice(0, fmt.DEF),
            ...mid.slice(0, fmt.MID),
            ...fwd.slice(0, fmt.FWD)
        ];

        const score = xi.reduce((acc, p) => acc + p.xP, 0);
        if (score > bestFormationScore) {
            bestFormationScore = score;
            bestXI = xi;

            // Determine bench
            const xiIds = new Set(xi.map(p => p.id));
            bench = squad.filter(p => !xiIds.has(p.id)).sort((a, b) => b.xP - a.xP); // Order bench by xP
            // Correct bench order: GKP2, then Outfield by xP
            const benchGkp = bench.find(p => p.element_type === 1);
            const benchOutfield = bench.filter(p => p.element_type !== 1);
            bench = benchGkp ? [benchGkp, ...benchOutfield] : benchOutfield;
        }
    });

    return { score: bestFormationScore, squad, starting11: bestXI, bench, totalCost: squad.reduce((a, b) => a + b.now_cost, 0) };
}

// MAIN
const dbPath = path.resolve(process.cwd(), "public/data/fpl.sqlite");
const db = new Database(dbPath);

async function runBacktest() {
    console.log("🔮 Starting AI Backtester...");

    // Setup DB
    db.exec(`
        CREATE TABLE IF NOT EXISTS backtest_results (
            gameweek INTEGER PRIMARY KEY,
            data TEXT
        );
    `);

    const playersMap = new Map();
    db.prepare("SELECT id, data FROM players").all().forEach((r: any) => {
        const p = JSON.parse(r.data);
        playersMap.set(p.id, p);
    });

    const fixtures = db.prepare("SELECT data FROM fixtures").all().map((r: any) => JSON.parse(r.data));

    // Get History Map
    const historyMap = new Map<number, any[]>(); // playerId -> history[]
    db.prepare("SELECT player_id, data FROM player_history").all().forEach((r: any) => {
        const h = JSON.parse(r.data);
        if (!historyMap.has(r.player_id)) historyMap.set(r.player_id, []);
        historyMap.get(r.player_id)?.push(h);
    });

    // Determine Rounds
    const allRounds = new Set<number>();
    fixtures.forEach((f: any) => { if (f.event) allRounds.add(f.event); });
    const maxRound = Math.max(...Array.from(allRounds).filter(r => r <= 38)); // Sanity check

    // We can only predict if we have prior data. Start GW 2.
    // Actually, check what range we have actual results for.
    // Check fixtures that are finished?
    const finishedRounds = new Set(fixtures.filter((f: any) => f.finished).map((f: any) => f.event));
    const sortedRounds = Array.from(finishedRounds).sort((a: any, b: any) => a - b);

    console.log(`Analyzing Rounds: ${sortedRounds.join(', ')}`);

    const results = [];

    for (const gw of sortedRounds) {
        // if (gw < 2) continue; // Skip GW1 check removed
        console.log(`\nAnalyzing GW${gw}...`);

        // 1. Build Player State for Prediction (using GW - 1 Data)
        const candidates: Player[] = [];
        const prevGW = gw - 1;

        for (const [pid, history] of historyMap.entries()) {
            const staticP = playersMap.get(pid);
            if (!staticP) continue;

            // Find stats from Previous Round
            const prevStats = history.find(h => h.round === prevGW);
            const actualStats = history.find(h => h.round === gw); // For calculating actual score

            // Prediction Logic
            let xP = 0;

            // FIX: If GW1 (prevStats missing), use Heuristic from Start Price / Last Season proxy
            if (gw === 1 || !prevStats) {
                if (gw === 1) {
                    // GW1 Heuristic: Cost is a good proxy for expected points
                    // ~ 10m player -> 6pts, 4.0m -> 2pts?
                    // Simple linear model: xP = Cost/10 * 0.8?
                    if (staticP.now_cost > 0) {
                        xP = staticP.now_cost / 10 * 0.6; // Conservative start
                        // Bonus for home game?
                    }
                } else {
                    continue; // Skip mid-season if missing history
                }
            } else {
                if (prevStats.smart_value === undefined) continue;

                // Normalize Smart Value (0-100) -> 0-1
                const normSV = prevStats.smart_value / 100;

                // Fixture Multiplier logic
                // ...
                xP = Number((normSV * 6).toFixed(1)); // Simplified reuse
            }

            // 1. Fixture Difficulty (Apply to both GW1 and others)
            const fixture = fixtures.find((f: any) => f.event === gw && (f.team_h === staticP.team || f.team_a === staticP.team));
            if (!fixture) continue; // No game

            const isHome = fixture.team_h === staticP.team;
            let fdr = isHome ? fixture.team_h_difficulty : fixture.team_a_difficulty;
            if (!fdr) fdr = 3;

            // Fixture Multiplier: Easy(2)=1.2, Hard(5)=0.8
            const fixMult = 1 + (3 - fdr) * 0.1;

            // Apply Multiplier (if not already applied in complex logic)
            // For GW1 heuristic, we apply it now.
            // For prevStats logic, we re-apply it properly.

            if (prevStats) {
                const normSV = prevStats.smart_value / 100;
                xP = Number((normSV * fixMult * 6).toFixed(1));
            } else {
                xP = Number((xP * fixMult).toFixed(1));
            }

            candidates.push({
                id: pid,
                element_type: staticP.element_type,
                // Use value from previous week if available, else current
                now_cost: prevStats?.value || staticP.now_cost,
                web_name: staticP.web_name,
                team: staticP.team,
                xP: xP,
                actualPoints: actualStats ? actualStats.total_points : 0
            });
        }

        // 2. Solve
        console.log(`  Pool: ${candidates.length} players. Optimizing...`);
        const result = solve(candidates, 1000); // 100.0m

        if (result) {
            const actualTotal = result.starting11.reduce((sum, p) => sum + p.actualPoints, 0); // Only Starting XI counts? Or Bench if played? Ignoring bench subs for simplicity

            // Improve Actual Calculation: Handle autosubs? (Too complex for simple backtest).
            // Just sum Starting XI.

            console.log(`  GW${gw}: Predicted ${result.score.toFixed(1)} | Actual ${actualTotal}`);

            const record = {
                gw,
                ai_points: actualTotal,
                xp: result.score,
                squad: result.starting11.map(p => ({
                    id: p.id,
                    name: p.web_name,
                    team: p.team,
                    type: p.element_type,
                    xp: p.xP,
                    actual: p.actualPoints,
                    cost: p.now_cost
                }))
            };
            results.push(record);

            db.prepare("INSERT OR REPLACE INTO backtest_results (gameweek, data) VALUES (?, ?)").run(gw, JSON.stringify(record));
        } else {
            console.warn(`  Failed to solve GW${gw}`);
        }
    }

    console.log("Backtest Complete.");
}

runBacktest();
