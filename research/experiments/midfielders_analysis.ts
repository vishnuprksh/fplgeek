
import fs from 'fs';
import path from 'path';

// --- Types ---
interface Team {
    id: number;
    name: string;
    short_name: string;
}

interface Match {
    id: number;
    event: number;
    finished: boolean;
    team_h: number;
    team_a: number;
    team_h_score: number;
    team_a_score: number;
    kickoff_time: string;
}

interface Player {
    id: number;
    first_name: string;
    second_name: string;
    element_type: number;
    team: number;
}

interface PlayerHistory {
    element: number;
    fixture: number;
    total_points: number;
    value: number;
    minutes: number;
    kickoff_time: string;
    influence: string;
    creativity: string;
    threat: string;
    ict_index: string;
    expected_goals: string;
    expected_assists: string;
    expected_goal_involvements: string;
    expected_goals_conceded: string;
    bps: number;
    starts: number;
    clean_sheets: number;
    goals_scored: number;
    assists: number;
}

// --- API ---
const BASE_URL = 'https://fantasy.premierleague.com/api';

async function fetchJson(url: string) {
    const response = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
    });
    if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
    return await response.json();
}

async function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// --- Logic ---

function getAvgLastN(matches: PlayerHistory[], n: number, key: keyof PlayerHistory): number {
    const lastN = matches.slice(-n);
    if (lastN.length === 0) return 0;

    const sum = lastN.reduce((acc, m) => {
        const val = m[key];
        const numVal = typeof val === 'string' ? parseFloat(val) : (val as number);
        return acc + numVal;
    }, 0);

    return sum / lastN.length;
}

function calculateMean(data: number[]): number {
    return data.reduce((a, b) => a + b, 0) / data.length;
}

function calculateCorrelation(x: number[], y: number[]): number {
    const n = x.length;
    if (n !== y.length) return 0;

    const meanX = calculateMean(x);
    const meanY = calculateMean(y);

    let num = 0;
    let denX = 0;
    let denY = 0;

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

// --- Main ---

async function main() {
    console.log('Fetching Data for Midfielders Analysis (Iteration 2: Feature Engineering)...');
    const staticData = await fetchJson(`${BASE_URL}/bootstrap-static/`);
    const elements: Player[] = staticData.elements;

    const mids = elements.filter(p => p.element_type === 3);

    const MAX_GW = 21;
    const allRows: any[] = [];
    let processed = 0;

    // Global Max for Normalization (approximate from static data for speed)
    let maxMinutes = 90;
    let maxInfluence = 50;
    let maxCreativity = 50;
    let maxThreat = 50;
    let maxICT = 10;
    let maxBPS = 30;

    for (const player of mids) {
        try {
            const summary = await fetchJson(`${BASE_URL}/element-summary/${player.id}/`);
            const history: PlayerHistory[] = summary.history;
            history.sort((a, b) => new Date(a.kickoff_time).getTime() - new Date(b.kickoff_time).getTime());

            const pastMatches: PlayerHistory[] = [];

            for (const match of history) {
                const gw = match.round;
                if (gw > MAX_GW) continue;

                const price = match.value;
                const targetValue = price > 0 ? (match.total_points / (price / 10)) : 0;

                if (pastMatches.length >= 3) {
                    const minutesForm = getAvgLastN(pastMatches, 5, 'minutes');
                    const influenceForm = getAvgLastN(pastMatches, 5, 'influence');
                    const creativityForm = getAvgLastN(pastMatches, 5, 'creativity');
                    const threatForm = getAvgLastN(pastMatches, 5, 'threat');
                    const ictForm = getAvgLastN(pastMatches, 5, 'ict_index');
                    const bpsForm = getAvgLastN(pastMatches, 5, 'bps');

                    // Normalize (Locally robust approximation)
                    const nMin = Math.min(minutesForm / 90, 1);
                    const nInf = Math.min(influenceForm / 40, 1); // rough max avg
                    const nCre = Math.min(creativityForm / 40, 1);
                    const nThr = Math.min(threatForm / 40, 1);
                    const nICT = Math.min(ictForm / 10, 1);
                    const nBPS = Math.min(bpsForm / 20, 1);

                    // Composite Features
                    const totalAttack = nCre + nThr;
                    const ictValue = price > 0 ? (ictForm / price) : 0;

                    // MVS Candidates
                    // 1. Balanced: Min + Playmaking + Threat
                    const mvs_balanced = (0.4 * nMin) + (0.3 * nInf) + (0.3 * totalAttack);

                    // 2. Efficiency: Min + ICT + BPS (The "Engine" model)
                    const mvs_engine = (0.4 * nMin) + (0.4 * nICT) + (0.2 * nBPS);

                    // 3. Simple: Min + ICT
                    const mvs_simple = (0.5 * nMin) + (0.5 * nICT);

                    if (minutesForm > 0) {
                        allRows.push({
                            target_value: targetValue,
                            f_minutes_form: minutesForm,
                            f_influence_form: influenceForm,
                            f_ict_form: ictForm,
                            f_bps_form: bpsForm,
                            f_composite_total_attack: totalAttack,
                            f_composite_ict_value: ictValue,
                            f_mvs_balanced: mvs_balanced,
                            f_mvs_engine: mvs_engine,
                            f_mvs_simple: mvs_simple
                        });
                    }
                }
                pastMatches.push(match);
            }
            processed++;
            if (processed % 10 === 0) process.stdout.write(`.`);
            await sleep(20);
        } catch (e) { }
    }

    if (allRows.length > 0) {
        const features = Object.keys(allRows[0]).filter(k => k.startsWith('f_'));

        console.log('\n--- ITERATION 2 RESULTS (Target: VALUE) ---');
        console.log('Feature | Correlation (Value)');

        const results = features.map(feat => {
            const x = allRows.map(r => r[feat]);
            const y = allRows.map(r => r.target_value);
            const corr = calculateCorrelation(x, y);
            return { feat, corr };
        });

        results.sort((a, b) => Math.abs(b.corr) - Math.abs(a.corr));
        results.forEach(r => console.log(`${r.feat}: ${r.corr.toFixed(4)}`));
    }
}

main().catch(console.error);
