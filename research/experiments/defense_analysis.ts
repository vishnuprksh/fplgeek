
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

interface TeamStats {
    id: number;
    homePlayed: number;
    awayPlayed: number;
    homeGoalsConceded: number;
    awayGoalsScored: number;
    awayGoalsConceded: number;
    homeGoalsScored: number;
}

function calculateTeamStats(fixtures: Match[], beforeGw: number, teams: Team[]): Map<number, TeamStats> {
    const stats = new Map<number, TeamStats>();

    teams.forEach(t => {
        stats.set(t.id, {
            id: t.id,
            homePlayed: 0,
            awayPlayed: 0,
            homeGoalsConceded: 0,
            awayGoalsScored: 0,
            awayGoalsConceded: 0,
            homeGoalsScored: 0
        });
    });

    const pertinentFixtures = fixtures.filter(f => f.finished && f.event < beforeGw);

    pertinentFixtures.forEach(m => {
        const home = stats.get(m.team_h);
        const away = stats.get(m.team_a);

        if (home && away) {
            home.homePlayed++;
            home.homeGoalsScored += m.team_h_score;
            home.homeGoalsConceded += m.team_a_score;

            away.awayPlayed++;
            away.awayGoalsScored += m.team_a_score;
            away.awayGoalsConceded += m.team_h_score;
        }
    });

    return stats;
}

function getDefensePotential(teamId: number, opponentId: number, isHome: boolean, stats: Map<number, TeamStats>): number {
    const team = stats.get(teamId);
    const opponent = stats.get(opponentId);

    if (!team || !opponent) return 0;

    // Lower is Better (Easier Match)
    const DEFAULT_AVG = 1.35;

    if (isHome) {
        // Team Home Defense (Avg GC at home) + Opponent Away Attack (Avg GS away)
        const avgHomeGC = team.homePlayed > 0 ? team.homeGoalsConceded / team.homePlayed : DEFAULT_AVG;
        const avgAwayGS = opponent.awayPlayed > 0 ? opponent.awayGoalsScored / opponent.awayPlayed : DEFAULT_AVG;
        return avgHomeGC + avgAwayGS;
    } else {
        // Team Away Defense (Avg GC away) + Opponent Home Attack (Avg GS home)
        const avgAwayGC = team.awayPlayed > 0 ? team.awayGoalsConceded / team.awayPlayed : DEFAULT_AVG;
        const avgHomeGS = opponent.homePlayed > 0 ? opponent.homeGoalsScored / opponent.homePlayed : DEFAULT_AVG;
        return avgAwayGC + avgHomeGS;
    }
}

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
    console.log('Fetching Data...');
    const staticData = await fetchJson(`${BASE_URL}/bootstrap-static/`);
    const elements: Player[] = staticData.elements;
    const teams: Team[] = staticData.teams;
    const fixtures: Match[] = await fetchJson(`${BASE_URL}/fixtures/`);

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

                // TARGET: Points per Price (Value)
                // Normalize price to be around 1 (e.g. 50 -> 5.0) for readability, or just use raw.
                // Raw Price is like 50 for 5.0m.
                const price = match.value; // e.g. 50
                const targetValue = price > 0 ? (match.total_points / (price / 10)) : 0; // Points per Million

                // --- BASE FEATURES ---

                const last5Avg = getAvgLastN(pastMatches, 5, 'total_points');
                const last3Avg = getAvgLastN(pastMatches, 3, 'total_points');
                const last1Points = pastMatches.length > 0 ? pastMatches[pastMatches.length - 1].total_points : 0;

                const ictForm = getAvgLastN(pastMatches, 5, 'ict_index');
                const influenceForm = getAvgLastN(pastMatches, 5, 'influence');
                const minutesForm = getAvgLastN(pastMatches, 5, 'minutes');

                // Fixture Diff (Expected Goals Conceded)
                const teamStats = calculateTeamStats(fixtures, gw, teams);
                const defensePotential = getDefensePotential(player.team, match.opponent_team, match.was_home, teamStats);
                // defensePotential is typically around 2.0 - 4.0 range (sum of two avgs).
                // Let's invert it for "easiness": 1 / defensePotential.
                const fixtureEasiness = defensePotential > 0 ? (10 / defensePotential) : 0;

                // --- COMPOSITE FEATURES (INTERACTIONS) ---

                // 1. Form x Fixture (Momentum meeting Opportunity)
                // High Form * Easy Fixture
                const formXFixture = last5Avg * fixtureEasiness;

                // 2. Influence x Fixture
                const influenceXFixture = influenceForm * fixtureEasiness;

                // 3. Reliability Weighted Quality
                // (ICT Form * Minutes Form) / 90. 
                // A player with high ICT but low minutes gets penalized.
                const reliableICT = (ictForm * minutesForm) / 90;

                // 4. Value Form (Form / Price)
                const valueForm = price > 0 ? last5Avg / (price / 10) : 0;

                // 5. Short Term Trend (Last 3 vs Last 5)
                // Are they improving?
                const formTrend = last3Avg - last5Avg;

                // 6. Home/Away bias
                // Some players perform better at home.
                // Simple feature: isHome * last5Avg
                const homeForm = match.was_home ? last5Avg : 0;

                const row = {
                    target_value: targetValue,
                    target_points: match.total_points, // Keep for ref

                    // Base
                    f_price: price,
                    f_last_5_avg: last5Avg,
                    f_influence_form: influenceForm,
                    f_minutes_form: minutesForm,
                    f_fixture_easiness: fixtureEasiness, // derived from defensePotential
                    f_market_sentiment: match.selected, // proxy

                    // Composites
                    f_form_x_fixture: formXFixture,
                    f_influence_x_fixture: influenceXFixture,
                    f_reliable_ict: reliableICT,
                    f_value_form: valueForm,
                    f_form_trend: formTrend,
                    f_home_bias: homeForm
                };

                if (pastMatches.length >= 3) {
                    allRows.push(row);
                }

                cumulativePoints += match.total_points;
                pastMatches.push(match);
            }

            processed++;
            if (processed % 10 === 0) process.stdout.write(`.`);
            await sleep(50);
        } catch (e) {
            console.error(`e`);
        }
    }
    console.log('\nData collection complete. Records:', allRows.length);

    // --- CORRELATION ANALYSIS (TARGET: Points per Million) ---

    if (allRows.length > 0) {
        const features = Object.keys(allRows[0]).filter(k => k.startsWith('f_'));

        console.log('\n--- TARGET: VALUE (Points per Million) ---');
        console.log('Feature | Correlation');
        console.log('--- | ---');

        const results = features.map(feat => {
            const x = allRows.map(r => r[feat]);
            const y = allRows.map(r => r.target_value);
            const corr = calculateCorrelation(x, y);
            return { feat, corr };
        });

        results.sort((a, b) => Math.abs(b.corr) - Math.abs(a.corr));

        results.forEach(r => {
            console.log(`${r.feat}: ${r.corr.toFixed(4)}`);
        });
    }
}

main().catch(console.error);
