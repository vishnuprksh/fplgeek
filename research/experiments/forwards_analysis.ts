
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
    starts: number;
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

function getFixtureDifficulty(teamId: number, opponentId: number, isHome: boolean, stats: Map<number, TeamStats>): number {
    const team = stats.get(teamId);
    const opponent = stats.get(opponentId);

    if (!team || !opponent) return 2.5; // avg fallback

    // We want to know how hard it is to SCORE against the opponent.
    // Difficulty = Opponent Defense Strength.

    // Low value = Bad Defense = Easy Fixture.
    // High value = Good Defense = Hard Fixture.

    if (isHome) {
        // We are Home vs Opponent Away.
        // Opponent Away Defense: How many goals they concede Away.
        // Wait, "Difficulty" usually means "Strength". 
        // A strong defense concedes FEW goals.
        // So let's measure "Defensive Weakness" (Goals Conceded). 
        // High GC = Weak Defense = Easy Fixture.

        // Let's stick to "Expected Goals Scored" by us.
        // My Home Attack + Opponent Away Defense (weakness).
        const myAttack = team.homePlayed > 0 ? team.homeGoalsScored / team.homePlayed : 1.3;
        const oppDefense = opponent.awayPlayed > 0 ? opponent.awayGoalsConceded / opponent.awayPlayed : 1.3;
        return myAttack + oppDefense; // "Attacking Potential". High is Good.
    } else {
        const myAttack = team.awayPlayed > 0 ? team.awayGoalsScored / team.awayPlayed : 1.3;
        const oppDefense = opponent.homePlayed > 0 ? opponent.homeGoalsConceded / opponent.homePlayed : 1.3;
        return myAttack + oppDefense;
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
    console.log('Fetching Data for Forwards Analysis (Iteration 3 - Fixtures)...');
    const staticData = await fetchJson(`${BASE_URL}/bootstrap-static/`);
    const elements: Player[] = staticData.elements;
    const teams: Team[] = staticData.teams;
    const fixtures: Match[] = await fetchJson(`${BASE_URL}/fixtures/`);

    const forwards = elements.filter(p => p.element_type === 4);

    const MAX_GW = 21;
    const allRows: any[] = [];
    let processed = 0;

    for (const player of forwards) {
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
                    const threatForm = getAvgLastN(pastMatches, 5, 'threat');
                    const ictForm = getAvgLastN(pastMatches, 5, 'ict_index');

                    // Fixture Potential
                    const teamStats = calculateTeamStats(fixtures, gw, teams);
                    const attackingPotential = getFixtureDifficulty(player.team, match.opponent_team, match.was_home, teamStats);
                    // attackingPotential is "Expected Goals Scored". Higher = Easier/Better fixture.

                    // Composite: Threat * Potential
                    const threatXFixture = threatForm * attackingPotential;

                    allRows.push({
                        target_value: targetValue,
                        f_minutes_form: minutesForm,
                        f_threat_form: threatForm,
                        f_fixture_potential: attackingPotential,
                        f_threat_x_fixture: threatXFixture
                    });
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

        console.log('\n--- ITERATION 3: Fixture Impact on Forwards ---');
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
