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
    matches: (TickerMatch | null)[];
    totalScore: number;
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

    const schedules: TeamSchedule[] = [];

    table.forEach(team => {
        const teamMatches: (TickerMatch | null)[] = [];
        let totalScore = 0;

        for (let gw = startGw; gw <= endGw; gw++) {
            const match = fixtures.find(f =>
                f.event === gw && (f.team_h === team.id || f.team_a === team.id)
            );

            if (match) {
                const isHome = match.team_h === team.id;
                const opponentId = isHome ? match.team_a : match.team_h;
                const opponent = table.find(t => t.id === opponentId);

                if (opponent) {
                    let score = 0;

                    if (metric === 'attack') {
                        if (isHome) {
                            // My Home Attack + Opponent Away Defense
                            score = team.homeGoalsScored + opponent.awayGoalsConceded;
                        } else {
                            // My Away Attack + Opponent Home Defense
                            score = team.awayGoalsScored + opponent.homeGoalsConceded;
                        }
                    } else {
                        // Defense Metric (Lower is Good)
                        if (isHome) {
                            // My Home Defense + Opponent Away Attack (How little I concede vs How little they score)
                            score = team.homeGoalsConceded + opponent.awayGoalsScored;
                        } else {
                            // My Away Defense + Opponent Home Attack
                            score = team.awayGoalsConceded + opponent.homeGoalsScored;
                        }
                    }

                    totalScore += score;

                    teamMatches.push({
                        event: gw,
                        opponent,
                        isHome,
                        score,
                        difficultyClass: 'medium'
                    });
                } else {
                    teamMatches.push(null);
                }
            } else {
                teamMatches.push(null);
            }
        }

        schedules.push({
            team,
            matches: teamMatches,
            totalScore
        });
    });

    const allScores = schedules.flatMap(s => s.matches).filter(m => m !== null).map(m => m!.score);
    if (allScores.length > 0) {
        const maxScore = Math.max(...allScores);
        const minScore = Math.min(...allScores);
        const range = maxScore - minScore;
        const third = range / 3;

        schedules.forEach(s => {
            s.matches.forEach(m => {
                if (m) {
                    if (metric === 'attack') {
                        if (m.score >= minScore + (2 * third)) m.difficultyClass = 'easy';
                        else if (m.score <= minScore + third) m.difficultyClass = 'hard';
                        else m.difficultyClass = 'medium';
                    } else {
                        if (m.score <= minScore + third) m.difficultyClass = 'easy';
                        else if (m.score >= minScore + (2 * third)) m.difficultyClass = 'hard';
                        else m.difficultyClass = 'medium';
                    }
                }
            });
        });
    }

    return schedules.sort((a, b) => {
        if (metric === 'attack') {
            return b.totalScore - a.totalScore;
        } else {
            return a.totalScore - b.totalScore;
        }
    });
}
