
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

function normalize(value: number, min: number, max: number): number {
    if (max === min) return 0;
    return (value - min) / (max - min);
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
    console.log('Fetching Data for DVS Validation...');
    const staticData = await fetchJson(`${BASE_URL}/bootstrap-static/`);
    const elements: Player[] = staticData.elements;

    const defenders = elements.filter(p => p.element_type === 2);
    console.log(`Found ${defenders.length} defenders.`);

    const MAX_GW = 21;
    let allRows: any[] = [];
    let processed = 0;

    // 1. Collection Phase
    for (const player of defenders) {
        try {
            const summary = await fetchJson(`${BASE_URL}/element-summary/${player.id}/`);
            const history: PlayerHistory[] = summary.history;
            history.sort((a, b) => new Date(a.kickoff_time).getTime() - new Date(b.kickoff_time).getTime());

            const pastMatches: PlayerHistory[] = [];

            for (const match of history) {
                const gw = match.round;
                if (gw > MAX_GW) continue;

                // TARGET: Value (Points per 1.0m)
                const price = match.value;
                const targetValue = price > 0 ? (match.total_points / (price / 10)) : 0;

                // Features
                const minutesForm = getAvgLastN(pastMatches, 5, 'minutes');
                const influenceForm = getAvgLastN(pastMatches, 5, 'influence');
                const ictForm = getAvgLastN(pastMatches, 5, 'ict_index');
                const priceVal = match.value;
                const ictValue = priceVal > 0 ? (ictForm / (priceVal / 10)) : 0;

                if (pastMatches.length >= 3) {
                    allRows.push({
                        target_value: targetValue,
                        f_minutes_form: minutesForm,
                        f_influence_form: influenceForm,
                        f_ict_value: ictValue
                    });
                }

                pastMatches.push(match);
            }
            processed++;
            if (processed % 20 === 0) process.stdout.write(`.`);
            await sleep(20);
        } catch (e) { }
    }
    console.log(`\nData Collected: ${allRows.length} records.`);

    // 2. Normalization & Calculation Phase
    if (allRows.length > 0) {
        // Find Min/Max
        const minutesVals = allRows.map(r => r.f_minutes_form);
        const influenceVals = allRows.map(r => r.f_influence_form);
        const ictValueVals = allRows.map(r => r.f_ict_value);

        const minMin = Math.min(...minutesVals);
        const maxMin = Math.max(...minutesVals);

        const minInf = Math.min(...influenceVals);
        const maxInf = Math.max(...influenceVals);

        const minIctV = Math.min(...ictValueVals);
        const maxIctV = Math.max(...ictValueVals);

        console.log(`\nRanges:`);
        console.log(`Minutes: ${minMin} - ${maxMin}`);
        console.log(`Influence: ${minInf.toFixed(2)} - ${maxInf.toFixed(2)}`);
        console.log(`ICT Value: ${minIctV.toFixed(2)} - ${maxIctV.toFixed(2)}`);

        // Calculate DVS
        // Formula: (0.5 * NormMin) + (0.3 * NormInf) + (0.2 * NormIctVal)
        const dvsScores: number[] = [];
        const targets: number[] = [];

        allRows.forEach(r => {
            const normMin = normalize(r.f_minutes_form, minMin, maxMin);
            const normInf = normalize(r.f_influence_form, minInf, maxInf);
            const normIctV = normalize(r.f_ict_value, minIctV, maxIctV);

            const dvs = (0.5 * normMin) + (0.3 * normInf) + (0.2 * normIctV);

            r.dvs = dvs;
            dvsScores.push(dvs);
            targets.push(r.target_value);
        });

        // Calculate Correlation
        const correlation = calculateCorrelation(dvsScores, targets);
        console.log(`\n--- FINAL RESULT ---`);
        console.log(`DVS Correlation with PPM: ${correlation.toFixed(4)}`);

        // Compare with individual components again
        const corrMin = calculateCorrelation(allRows.map(r => r.f_minutes_form), targets);
        const corrInf = calculateCorrelation(allRows.map(r => r.f_influence_form), targets);

        console.log(`Minutes Correlation: ${corrMin.toFixed(4)}`);
        console.log(`Influence Correlation: ${corrInf.toFixed(4)}`);

        if (correlation > corrMin && correlation > corrInf) {
            console.log(`SUCCESS: DVS performs better than individual features!`);
        } else {
            console.log(`NOTE: DVS performed similarly or slightly worse than raw Minutes (Simple is best?)`);
        }
    }
}

main().catch(console.error);
