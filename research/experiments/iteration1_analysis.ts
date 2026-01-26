
import fs from 'fs';
import path from 'path';

// --- Types ---
interface Team {
    id: number;
    name: string;
    short_name: string;
}

interface Player {
    id: number;
    first_name: string;
    second_name: string;
    element_type: number;
    team: number;
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

interface PlayerHistory {
    element: number;
    fixture: number;
    total_points: number;
    was_home: boolean;
    opponent_team: number;
    round: number;
    value: number;
    selected: number;
    minutes: number;
    kickoff_time: string;
    influence: string;
    creativity: string;
    threat: string;
    ict_index: string;
    transfers_in: number;
    transfers_out: number;
    clean_sheets: number;
    goals_conceded: number;
    expected_goals: string;
    expected_assists: string;
    expected_goal_involvements: string;
    expected_goals_conceded: string;
    starts: number;
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
    console.log('Fetching Data for Iteration 1...');
    const staticData = await fetchJson(`${BASE_URL}/bootstrap-static/`);
    const elements: Player[] = staticData.elements;

    const defenders = elements.filter(p => p.element_type === 2);
    console.log(`Found ${defenders.length} defenders.`);

    const MAX_GW = 21;
    const allRows: any[] = [];
    let processed = 0;

    for (const player of defenders) {
        try {
            const summary = await fetchJson(`${BASE_URL}/element-summary/${player.id}/`);
            const history: PlayerHistory[] = summary.history;
            history.sort((a, b) => new Date(a.kickoff_time).getTime() - new Date(b.kickoff_time).getTime());

            const pastMatches: PlayerHistory[] = [];
            let cumulativePoints = 0;

            for (const match of history) {
                const gw = match.round;
                if (gw > MAX_GW) continue;

                // TARGET: Value (Points per 1.0m)
                const price = match.value;
                const targetValue = price > 0 ? (match.total_points / (price / 10)) : 0;

                // --- RAW FEATURES ---

                // 1. Expected Data (The New Features)
                const xGForm = getAvgLastN(pastMatches, 5, 'expected_goals');
                const xAForm = getAvgLastN(pastMatches, 5, 'expected_assists');
                const xGIForm = getAvgLastN(pastMatches, 5, 'expected_goal_involvements');
                const xGCForm = getAvgLastN(pastMatches, 5, 'expected_goals_conceded');
                const startsForm = getAvgLastN(pastMatches, 5, 'starts');

                // 2. Standard Form
                const minutesForm = getAvgLastN(pastMatches, 5, 'minutes');
                const pointsForm = getAvgLastN(pastMatches, 5, 'total_points');
                const influenceForm = getAvgLastN(pastMatches, 5, 'influence');
                const ictForm = getAvgLastN(pastMatches, 5, 'ict_index');

                if (pastMatches.length >= 3) {
                    allRows.push({
                        target_value: targetValue,
                        target_points: match.total_points,

                        f_price: price,

                        // New Features
                        f_xGI_form: xGIForm,
                        f_xGC_form: xGCForm, // Expected Goals Conceded
                        f_starts_form: startsForm,

                        // Standard features comparison
                        f_minutes_form: minutesForm,
                        f_points_form: pointsForm,
                        f_influence_form: influenceForm,
                        f_ict_form: ictForm,
                    });
                }

                cumulativePoints += match.total_points;
                pastMatches.push(match);
            }

            processed++;
            if (processed % 20 === 0) process.stdout.write(`.`);
            await sleep(20);
        } catch (e) { }
    }
    console.log('\nIteration 1 Data Collected:', allRows.length);

    // --- CORRELATION ANALYSIS ---
    if (allRows.length > 0) {
        const features = Object.keys(allRows[0]).filter(k => k.startsWith('f_'));

        console.log('\n--- ITERATION 1: Expected Stats vs Standard Stats ---');
        console.log('Feature | Correlation (Value)');

        // Analyze against Value
        const results = features.map(feat => {
            const x = allRows.map(r => r[feat]);
            const y = allRows.map(r => r.target_value);
            const corr = calculateCorrelation(x, y);
            return { feat, corr };
        });

        results.sort((a, b) => Math.abs(b.corr) - Math.abs(a.corr));
        results.forEach(r => console.log(`${r.feat}: ${r.corr.toFixed(4)}`));

        // Also correlation with Raw Points for reference
        console.log('\n(Reference: Correlation with Total Points)');
        const resultsPoints = features.map(feat => {
            const x = allRows.map(r => r[feat]);
            const y = allRows.map(r => r.target_points);
            const corr = calculateCorrelation(x, y);
            return { feat, corr };
        });
        resultsPoints.sort((a, b) => Math.abs(b.corr) - Math.abs(a.corr));
        resultsPoints.slice(0, 5).forEach(r => console.log(`${r.feat}: ${r.corr.toFixed(4)}`));
    }
}

main().catch(console.error);
