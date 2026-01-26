import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
import path from 'path';

const dbPath = path.resolve(process.cwd(), "public/data/fpl.sqlite");
const db = new Database(dbPath);

import { MODEL_CONFIG } from '../functions/src/modelingConfig';
const { ALPHA, RELIABILITY_POWER, WEIGHTS, NORMALIZATION } = MODEL_CONFIG;
const TARGET_SEASON = '2425';

function calculateMean(stats: any[]) {
    let sumMin = 0, sumXG = 0, sumXA = 0, sumCS = 0, sumSaves = 0;
    const count = stats.length;
    if (count === 0) return { minutes: 0, xg: 0, xa: 0, clean_sheets: 0, saves: 0 };

    stats.forEach(m => {
        sumMin += m.minutes || 0;
        sumXG += parseFloat(m.threat || '0');      // PROXY
        sumXA += parseFloat(m.creativity || '0');  // PROXY
        sumCS += m.clean_sheets || 0;
        sumSaves += m.saves || 0;
    });

    return {
        minutes: sumMin / count,
        xg: sumXG / count,
        xa: sumXA / count,
        clean_sheets: sumCS / count,
        saves: sumSaves / count
    };
}

function pearsonCorrelation(x: number[], y: number[]) {
    if (x.length !== y.length || x.length === 0) return 0;
    const n = x.length;
    const meanX = x.reduce((a, b) => a + b) / n;
    const meanY = y.reduce((a, b) => a + b) / n;
    let num = 0, denX = 0, denY = 0;
    for (let i = 0; i < n; i++) {
        const dx = x[i] - meanX;
        const dy = y[i] - meanY;
        num += dx * dy;
        denX += dx * dx;
        denY += dy * dy;
    }
    if (denX === 0 || denY === 0) return 0;
    return num / Math.sqrt(denX * denY);
}

async function runAnalysis() {
    const rawPlayers = db.prepare("SELECT data FROM players").all().map((r: any) => JSON.parse(r.data));
    const rawHistory = db.prepare("SELECT player_id, data FROM player_history").all().reduce((acc: any, r: any) => {
        if (!acc[r.player_id]) acc[r.player_id] = [];
        acc[r.player_id].push(JSON.parse(r.data));
        return acc;
    }, {});

    const players = rawPlayers.map((p: any) => ({ ...p, history: rawHistory[p.id] || [] })).filter(p => p.history.length > 0);

    const correlations: { [key: number]: { x: number[], y: number[] } } = { 1: { x: [], y: [] }, 2: { x: [], y: [] }, 3: { x: [], y: [] }, 4: { x: [], y: [] } };

    for (let week = 5; week <= 21; week++) {
        const nextWeek = week + 1;
        const globalMax = { min: 1, xg: 1, xa: 1, cs: 1, saves: 1 };
        const weekData: any[] = [];

        players.forEach(p => {
            const hUpToNow = p.history.filter((h: any) => h.round <= week).sort((a, b) => b.round - a.round);
            if (hUpToNow.length === 0) return;

            const season = calculateMean(hUpToNow);
            const form = calculateMean(hUpToNow.slice(0, 5));

            const blended = {
                minutes: (1 - ALPHA) * season.minutes + ALPHA * form.minutes,
                xg: (1 - ALPHA) * season.xg + ALPHA * form.xg,
                xa: (1 - ALPHA) * season.xa + ALPHA * form.xa,
                clean_sheets: (1 - ALPHA) * season.clean_sheets + ALPHA * form.clean_sheets,
                saves: (1 - ALPHA) * season.saves + ALPHA * form.saves
            };

            if (blended.minutes > globalMax.min) globalMax.min = blended.minutes;
            if (blended.xg > globalMax.xg) globalMax.xg = blended.xg;
            if (blended.xa > globalMax.xa) globalMax.xa = blended.xa;
            if (blended.clean_sheets > globalMax.cs) globalMax.cs = blended.clean_sheets;
            if (blended.saves > globalMax.saves) globalMax.saves = blended.saves;

            weekData.push({ p, blended });
        });

        weekData.forEach(({ p, blended }) => {
            const b = blended;
            const nXG = b.xg / globalMax.xg;
            const nXA = b.xa / globalMax.xa;
            const nCS = b.clean_sheets / globalMax.cs;
            const nSaves = b.saves / globalMax.saves;

            // POSITION SPECIFIC POWER OVERRIDE
            let power = RELIABILITY_POWER.VOLATILE;
            if (p.element_type === 1 || p.element_type === 2) power = RELIABILITY_POWER.STABLE;

            const reliability = Math.pow(b.minutes / globalMax.min, power);
            let rawScore = 0;
            const nInvXGC = Math.max(0, 1 - (b.xgc / NORMALIZATION.XGC_MAX));

            switch (p.element_type) {
                case 1: rawScore = (WEIGHTS.GKP.CS * nCS) + (WEIGHTS.GKP.SAVES * nSaves); break;
                case 2: rawScore = (WEIGHTS.DEF.INV_XGC * nInvXGC) + (WEIGHTS.DEF.XG * nXG) + (WEIGHTS.DEF.XA * nXA); break;
                case 3: rawScore = (WEIGHTS.MID.XG * nXG) + (WEIGHTS.MID.XA * nXA) + (WEIGHTS.MID.CS * nCS); break;
                case 4: rawScore = (WEIGHTS.FWD.XG * nXG) + (WEIGHTS.FWD.XA * nXA); break;
            }
            const smartValue = (rawScore * reliability * 1000) / (p.now_cost / 10);
            const nextMatch = p.history.find((h: any) => h.round === nextWeek);
            if (nextMatch) {
                correlations[p.element_type].x.push(smartValue);
                correlations[p.element_type].y.push(nextMatch.total_points);
            }
        });
    }

    console.log("Improved Metrics (Optimized):");
    const posNames = ["", "GKP", "DEF", "MID", "FWD"];
    let totalX: number[] = [], totalY: number[] = [];
    for (let i = 1; i <= 4; i++) {
        const r = pearsonCorrelation(correlations[i].x, correlations[i].y);
        console.log(`${posNames[i]}: ${r.toFixed(4)}`);
        totalX.push(...correlations[i].x);
        totalY.push(...correlations[i].y);
    }
    console.log(`Overall: ${pearsonCorrelation(totalX, totalY).toFixed(4)}`);
}

runAnalysis().catch(console.error);
