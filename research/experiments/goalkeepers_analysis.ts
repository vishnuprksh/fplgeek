
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
    saves: number;
    clean_sheets: number;
    goals_conceded: number;
    transfers_in: number;
    transfers_out: number;
    selected: number;
    opponent_team: number;
    was_home: boolean;
    round: number;
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
    console.log('Fetching Data for Goalkeeper Analysis...');
    const staticData = await fetchJson(`${BASE_URL}/bootstrap-static/`);
    const elements: Player[] = staticData.elements;
    const teams: Team[] = staticData.teams;
    const fixtures: Match[] = await fetchJson(`${BASE_URL}/fixtures/`);

    // element_type 1 is Goalkeeper
    const goalkeepers = elements.filter(p => p.element_type === 1);
    console.log(`Found ${goalkeepers.length} goalkeepers.`);

    const MAX_GW = 21;
    const allRows: any[] = [];
    let processed = 0;

    for (const player of goalkeepers) {
        try {
            const summary = await fetchJson(`${BASE_URL}/element-summary/${player.id}/`);
            const history: PlayerHistory[] = summary.history;
            history.sort((a, b) => new Date(a.kickoff_time).getTime() - new Date(b.kickoff_time).getTime());

            const pastMatches: PlayerHistory[] = [];

            for (const match of history) {
                const gw = match.round;
                // Only consider up to MAX_GW to replicate historical analysis condition if needed, 
                // or just to limit data range. Adapting from other scripts.
                if (gw > MAX_GW) continue;

                // Normalize price typically to around 5.0
                const price = match.value;
                // Target: Points per Million 
                const targetValue = price > 0 ? (match.total_points / (price / 10)) : 0;

                if (pastMatches.length >= 3) {
                    // --- BASE FEATURES ---
                    const last5Avg = getAvgLastN(pastMatches, 5, 'total_points');
                    const minutesForm = getAvgLastN(pastMatches, 5, 'minutes');
                    const ictForm = getAvgLastN(pastMatches, 5, 'ict_index');
                    const influenceForm = getAvgLastN(pastMatches, 5, 'influence');
                    const savesForm = getAvgLastN(pastMatches, 5, 'saves');
                    const cleanSheetForm = getAvgLastN(pastMatches, 5, 'clean_sheets');
                    const goalsConcededForm = getAvgLastN(pastMatches, 5, 'goals_conceded');

                    // --- FIXTURE FEATURES ---
                    const teamStats = calculateTeamStats(fixtures, gw, teams);
                    // getDefensePotential returns Expected Goals Conceded (lower is better for defense/easy fixture)
                    const expectedGC = getDefensePotential(player.team, match.opponent_team, match.was_home, teamStats);

                    // Fixture Easiness: High is Good (Easy). 
                    // expectedGC is typically 1.5 - 3.0. 
                    const fixtureEasiness = expectedGC > 0 ? (10 / expectedGC) : 0;

                    // --- COMPOSITE FEATURES ---

                    // 1. Form x Fixture (Momentum meeting Opportunity)
                    const formXFixture = last5Avg * fixtureEasiness;

                    // 2. Influence x Fixture
                    const influenceXFixture = influenceForm * fixtureEasiness;

                    // 3. Saves x Difficulty
                    // Keepers can get save points in hard games (High expectedGC = Hard).
                    // So we might want High Saves Form * High ExpectedGC (Hard Fixture).
                    const savesXHardFixture = savesForm * expectedGC;

                    // 4. Value Form (Form / Price)
                    const valueForm = price > 0 ? last5Avg / (price / 10) : 0;

                    // 5. Clean Sheet Potential
                    // Clean Sheet Form * Easy Fixture
                    const csPotential = cleanSheetForm * fixtureEasiness;

                    allRows.push({
                        target_value: targetValue,
                        target_points: match.total_points,

                        // Base
                        f_price: price,
                        f_last_5_avg: last5Avg,
                        f_minutes_form: minutesForm,
                        f_ict_form: ictForm,
                        f_saves_form: savesForm,
                        f_clean_sheet_form: cleanSheetForm,
                        f_goals_conceded_form: goalsConcededForm,

                        // Fixture
                        f_fixture_easiness: fixtureEasiness, // Good for CS
                        f_expected_gc: expectedGC,           // "Difficulty" - Good for saves?

                        // Composite
                        f_form_x_fixture: formXFixture,
                        f_influence_x_fixture: influenceXFixture,
                        f_saves_x_hard_fixture: savesXHardFixture,
                        f_value_form: valueForm,
                        f_cs_potential: csPotential
                    });
                }
                pastMatches.push(match);
            }

            processed++;
            if (processed % 10 === 0) process.stdout.write(`.`);
            await sleep(20);

        } catch (e) {
            // console.error(e);
        }
    }
    console.log('\nData collection complete. Records:', allRows.length);

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
