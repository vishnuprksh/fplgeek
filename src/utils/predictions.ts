import type { Player, Match, Team } from '../types/fpl';
import { calculateSmartValue, calculateNormalizationFactors } from './smartValue';

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

    // 2. Calculate Normalization Factors once for the whole dataset
    const normFactors = calculateNormalizationFactors(elements);

    // 3. Predict for each player
    elements.forEach(p => {
        // Filter out inactive players to speed up optimization and clean UI
        if (p.minutes < 90 && parseFloat(p.form) < 0.5) return;

        // Use Pre-calculated Weighted Smart Value if available, else fallback to live calc
        // Firestore data includes 'smart_value' (0-1 range approx, from analysis.ts)
        const smartValue = p.smart_value !== undefined
            ? p.smart_value
            : calculateSmartValue(p, normFactors);

        const myFixtures = teamFixtures.get(p.team) || [];
        const next5 = myFixtures.slice(0, 5);

        const predictedPointsList: number[] = [];

        next5.forEach(match => {
            const isHome = match.team_h === p.team;

            // Linear Regression Formula for VALUE (Points per £m)
            // Val = Intercept + (C1 * SmartVal) + (C2 * Home) + (C3 * Price)
            const predValue = COEFF.INTERCEPT +
                (COEFF.SMART_VAL * smartValue) +
                (COEFF.HOME * (isHome ? 1 : 0)) +
                (COEFF.PRICE * p.now_cost);

            // Convert Value -> Points
            // Points = Value * (Price / 10)
            let predPoints = predValue * (p.now_cost / 10);

            // Decay/Adjustment for availability (simple chance_of_playing check)
            // Decay/Adjustment for availability (simple chance_of_playing check)
            // Handle null (unknown) or undefined. If it's 100 or null, we might assume 100?
            // Actually API says null means "Active/Available" usually, unless status says otherwise.
            // But let's check for explicit number.
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
            smartValue: smartValue * 100, // UX expects 0-100 scale
            predictedPoints: totalForecast / 5, // Avg per game
            next5Points: predictedPointsList,
            totalForecast: totalForecast,
            cost: p.now_cost
        });
    });

    return predictions.sort((a, b) => b.totalForecast - a.totalForecast);
}
