import type { Player, Match, Team } from '../types/fpl';

// ML Model Coefficients (from ml_model_report.md)
const COEFF = {
    INTERCEPT: 0.2630,
    SMART_VAL: 0.7460,
    HOME: 0.0657,
    PRICE: -0.0032
};

export interface PredictionResult {
    player: Player;
    smartValue: number;
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

        // Use Pre-calculated Weighted Smart Value.
        // It comes in as 0-100 range from calculateSmartValues.
        const rawSmartValue = p.smart_value ?? 0;

        // Normalize to 0-1 for the regression formula
        const smartValueNorm = rawSmartValue / 100;

        const myFixtures = teamFixtures.get(p.team) || [];
        const next5 = myFixtures.slice(0, 5);

        const predictedPointsList: number[] = [];

        next5.forEach(match => {
            const isHome = match.team_h === p.team;

            // Linear Regression Formula for VALUE (Points per £m)
            // Val = Intercept + (C1 * SmartVal) + (C2 * Home) + (C3 * Price)
            const predValue = COEFF.INTERCEPT +
                (COEFF.SMART_VAL * smartValueNorm) +
                (COEFF.HOME * (isHome ? 1 : 0)) +
                (COEFF.PRICE * p.now_cost);

            // Convert Value -> Points
            // Points = Value * (Price / 10)
            let predPoints = predValue * (p.now_cost / 10);

            // Decay/Adjustment for availability (simple chance_of_playing check)
            const chance = p.chance_of_playing_next_round;
            if (chance !== null && chance !== undefined) {
                predPoints = predPoints * (chance / 100);
            }

            if (isNaN(predPoints)) predPoints = 0;

            predictedPointsList.push(Math.max(0, predPoints));
        });

        // Fill remaining if < 5 fixtures (e.g. end of season)
        while (predictedPointsList.length < 5) predictedPointsList.push(0);

        const totalForecast = predictedPointsList.reduce((a, b) => a + b, 0);

        predictions.push({
            player: p,
            smartValue: rawSmartValue, // UX expects 0-100 scale
            predictedPoints: totalForecast / 5, // Avg per game
            next5Points: predictedPointsList,
            totalForecast: totalForecast,
            cost: p.now_cost
        });
    });

    return predictions.sort((a, b) => b.totalForecast - a.totalForecast);
}
