import type { Player, Match, Team } from '../types/fpl';

// ML Model Coefficients (from ml_model_report.md)


export interface PredictionResult {
    player: Player;
    predictedPoints: number;
    next5Points: number[]; // Points for next 5 GWs
    totalForecast: number;
    cost: number;
}

export function generatePredictions(elements: Player[], _teams: Team[], fixtures: Match[]): PredictionResult[] {
    const predictions: PredictionResult[] = [];

    // 1. Map Team -> Upcoming Fixtures
    const teamFixtures = new Map<number, Match[]>();

    fixtures
        .filter(f => !f.finished && f.event !== null)
        .forEach(f => {
            // Home Team
            if (!teamFixtures.has(f.team_h)) teamFixtures.set(f.team_h, []);
            teamFixtures.get(f.team_h)?.push(f);

            // Away Team
            if (!teamFixtures.has(f.team_a)) teamFixtures.set(f.team_a, []);
            teamFixtures.get(f.team_a)?.push(f);
        });

    // Sort fixtures by time for each team
    teamFixtures.forEach((matches, _teamId) => {
        matches.sort((a, b) => new Date(a.kickoff_time).getTime() - new Date(b.kickoff_time).getTime());
    });

    // 3. Predict for each player
    elements.forEach(p => {
        // Filter out inactive players to speed up optimization and clean UI
        if (p.minutes < 90 && parseFloat(p.form) < 0.5) return;

        const myFixtures = teamFixtures.get(p.team) || [];
        const next5 = myFixtures.slice(0, 5);

        const predictedPointsList: number[] = [];

        next5.forEach((_match, index) => {
            // Replaced fallback predictor with 0 points
            let predPoints = 0;
            predictedPointsList.push(predPoints);
        });

        // Fill remaining if < 5 fixtures (e.g. end of season)
        while (predictedPointsList.length < 5) predictedPointsList.push(0);

        const totalForecast = predictedPointsList.reduce((a, b) => a + b, 0);

        predictions.push({
            player: p,
            predictedPoints: totalForecast / 5, // Avg per game
            next5Points: predictedPointsList,
            totalForecast: totalForecast,
            cost: p.now_cost
        });
    });

    return predictions.sort((a, b) => b.totalForecast - a.totalForecast);
}
