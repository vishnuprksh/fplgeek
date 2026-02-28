import type { Match, Team } from '../types/fpl';

export interface TeamStats {
    id: number;
    name: string;
    short_name: string;
    played: number;
    goalsScored: number;
    goalsConceded: number;
    // Granular Stats
    homeGoalsScored: number;
    homeGoalsConceded: number;
    awayGoalsScored: number;
    awayGoalsConceded: number;
}

export function calculateTable(fixtures: Match[], teams: Team[]): TeamStats[] {
    const table: Record<number, TeamStats> = {};

    // Initialize table
    teams.forEach(team => {
        table[team.id] = {
            id: team.id,
            name: team.name,
            short_name: team.short_name,
            played: 0,
            goalsScored: 0,
            goalsConceded: 0,
            homeGoalsScored: 0,
            homeGoalsConceded: 0,
            awayGoalsScored: 0,
            awayGoalsConceded: 0
        };
    });

    // Process finished matches
    fixtures.filter(m => m.finished).forEach(match => {
        const home = table[match.team_h];
        const away = table[match.team_a];

        if (home && away) {
            home.played++;
            away.played++;

            // Total Stats
            home.goalsScored += match.team_h_score;
            home.goalsConceded += match.team_a_score;

            away.goalsScored += match.team_a_score;
            away.goalsConceded += match.team_h_score;

            // Granular Stats
            home.homeGoalsScored += match.team_h_score;
            home.homeGoalsConceded += match.team_a_score;

            away.awayGoalsScored += match.team_a_score;
            away.awayGoalsConceded += match.team_h_score;
        }
    });

    return Object.values(table);
}

export interface ScoredFixture {
    match: Match;
    attackingTeam: TeamStats;
    defendingTeam: TeamStats;
    score: number; // Potential score
    isHome: boolean;
}

export function getRankedFixtures(fixtures: Match[], table: TeamStats[], currentEvent: number): ScoredFixture[] {
    // Get next gameweek matches
    const nextGwObj = fixtures.find(f => !f.finished && f.event >= currentEvent);
    if (!nextGwObj) return [];

    const nextGw = nextGwObj.event;
    const upcomingMatches = fixtures.filter(f => f.event === nextGw);

    const ranked: ScoredFixture[] = [];

    upcomingMatches.forEach(match => {
        const homeTeam = table.find(t => t.id === match.team_h);
        const awayTeam = table.find(t => t.id === match.team_a);

        if (homeTeam && awayTeam) {
            // Home Team Attacking (vs Away Defense)
            const homeScore = homeTeam.homeGoalsScored + awayTeam.awayGoalsConceded;

            // Away Team Attacking (vs Home Defense)
            const awayScore = awayTeam.awayGoalsScored + homeTeam.homeGoalsConceded;

            ranked.push({
                match,
                attackingTeam: homeTeam,
                defendingTeam: awayTeam,
                score: homeScore,
                isHome: true
            });

            ranked.push({
                match,
                attackingTeam: awayTeam,
                defendingTeam: homeTeam,
                score: awayScore,
                isHome: false
            });
        }
    });

    // Sort by score descending (highest potential first)
    return ranked.sort((a, b) => b.score - a.score);
}

export interface TickerMatch {
    event: number;
    opponent: TeamStats;
    isHome: boolean;
    score: number;
    difficultyClass: 'easy' | 'medium' | 'hard';
}

export interface TeamSchedule {
    team: TeamStats;
    matches: TickerMatch[][];
    totalScore: number;
    averageScore: number;
}

export function getFixtureTicker(
    fixtures: Match[],
    table: TeamStats[],
    currentEvent: number,
    weeks: number = 5,
    metric: 'attack' | 'defense' = 'attack'
): TeamSchedule[] {
    const startGw = currentEvent;
    const endGw = currentEvent + weeks - 1;

    // FIRST PASS: Calculate RAW scores for all matches to find global MIN/MAX
    const rawMatches: { teamId: number; gw: number; score: number }[] = [];
    table.forEach(team => {
        for (let gw = startGw; gw <= endGw; gw++) {
            const matchesInGw = fixtures.filter(f =>
                f.event === gw && (f.team_h === team.id || f.team_a === team.id)
            );
            matchesInGw.forEach(match => {
                const isHome = match.team_h === team.id;
                const opponentId = isHome ? match.team_a : match.team_h;
                const opponent = table.find(t => t.id === opponentId);
                if (opponent) {
                    let score = 0;
                    if (metric === 'attack') {
                        score = isHome ? (team.homeGoalsScored + opponent.awayGoalsConceded) : (team.awayGoalsScored + opponent.homeGoalsConceded);
                    } else {
                        score = isHome ? (team.homeGoalsConceded + opponent.awayGoalsScored) : (team.awayGoalsConceded + opponent.homeGoalsScored);
                    }
                    rawMatches.push({ teamId: team.id, gw, score });
                }
            });
        }
    });

    const allRawScores = rawMatches.map(m => m.score);
    const minRaw = allRawScores.length > 0 ? Math.min(...allRawScores) : 0;
    const maxRaw = allRawScores.length > 0 ? Math.max(...allRawScores) : 1;
    const range = maxRaw - minRaw || 1;

    // SECOND PASS: Build schedules with SCALED scores
    const schedules: TeamSchedule[] = [];

    table.forEach(team => {
        const teamMatches: TickerMatch[][] = [];
        let totalScaledScore = 0;

        for (let gw = startGw; gw <= endGw; gw++) {
            const matchesInGw = fixtures.filter(f =>
                f.event === gw && (f.team_h === team.id || f.team_a === team.id)
            );

            const gwMatches: TickerMatch[] = [];

            matchesInGw.forEach(match => {
                const isHome = match.team_h === team.id;
                const opponentId = isHome ? match.team_a : match.team_h;
                const opponent = table.find(t => t.id === opponentId);

                if (opponent) {
                    let rawScore = 0;
                    if (metric === 'attack') {
                        rawScore = isHome ? (team.homeGoalsScored + opponent.awayGoalsConceded) : (team.awayGoalsScored + opponent.homeGoalsConceded);
                    } else {
                        rawScore = isHome ? (team.homeGoalsConceded + opponent.awayGoalsScored) : (team.awayGoalsConceded + opponent.homeGoalsScored);
                    }

                    // Scale 0 to 1
                    let scaledScore = 0;
                    if (metric === 'attack') {
                        // High is good (1), Low is bad (0)
                        scaledScore = (rawScore - minRaw) / range;
                    } else {
                        // Low is good (1), High is bad (0)
                        scaledScore = (maxRaw - rawScore) / range;
                    }

                    totalScaledScore += scaledScore;

                    gwMatches.push({
                        event: gw,
                        opponent,
                        isHome,
                        score: scaledScore,
                        difficultyClass: scaledScore >= 0.66 ? 'easy' : scaledScore <= 0.33 ? 'hard' : 'medium'
                    });
                }
            });

            teamMatches.push(gwMatches);
        }

        schedules.push({
            team,
            matches: teamMatches,
            totalScore: totalScaledScore,
            averageScore: totalScaledScore / weeks // average scaled potential per GW
        });
    });

    return schedules.sort((a, b) => b.totalScore - a.totalScore);
}
