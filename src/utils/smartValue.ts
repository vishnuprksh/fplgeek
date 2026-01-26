import type { Player } from '../types/fpl';

export interface NormalizationFactors {
    maxMinutes: number;
    maxInfluence: number;
    maxThreat: number;
    maxIctValue: number;
    maxSaves: number;
    maxPointsPerGame: number;
}

export function calculateNormalizationFactors(elements: Player[]): NormalizationFactors {
    let maxMinutes = 1;
    let maxInfluence = 1;
    let maxThreat = 1;
    let maxIctValue = 1;
    let maxSaves = 1;
    let maxPointsPerGame = 1;

    elements.forEach(p => {
        if (p.minutes > maxMinutes) maxMinutes = p.minutes;

        const inf = parseFloat(p.influence);
        if (inf > maxInfluence) maxInfluence = inf;

        const threat = parseFloat(p.threat);
        if (threat > maxThreat) maxThreat = threat;

        const price = p.now_cost;
        const ictVal = price > 0 ? parseFloat(p.ict_index) / price : 0;
        if (ictVal > maxIctValue) maxIctValue = ictVal;

        // Use saves if available (API should provide it)
        const saves = p.saves || 0;
        if (saves > maxSaves) maxSaves = saves;

        const ppg = parseFloat(p.points_per_game);
        if (ppg > maxPointsPerGame) maxPointsPerGame = ppg;
    });

    return {
        maxMinutes,
        maxInfluence,
        maxThreat,
        maxIctValue,
        maxSaves,
        maxPointsPerGame
    };
}

export function calculateSmartValue(p: Player, factors: NormalizationFactors): number {
    let smartValue = 0;
    const normMin = p.minutes / factors.maxMinutes;
    const price = p.now_cost;
    const ictVal = price > 0 ? parseFloat(p.ict_index) / price : 0;
    const normIctVal = ictVal / factors.maxIctValue;
    const normPPG = parseFloat(p.points_per_game) / factors.maxPointsPerGame;

    if (p.element_type === 1) {
        // GOALKEEPERS: GVS (30% Reliability, 30% PPG, 20% Saves, 20% Economy)
        const normSaves = (p.saves || 0) / factors.maxSaves;
        smartValue = (0.30 * normMin) + (0.30 * normPPG) + (0.20 * normSaves) + (0.20 * normIctVal);
    } else if (p.element_type === 2) {
        // DEFENDERS: DVS (30% Reliability, 30% PPG, 20% Influence, 20% Economy)
        const normInf = parseFloat(p.influence) / factors.maxInfluence;
        smartValue = (0.30 * normMin) + (0.30 * normPPG) + (0.20 * normInf) + (0.20 * normIctVal);
    } else if (p.element_type === 3) {
        // MIDFIELDERS: MVS (30% Reliability, 30% PPG, 20% Influence, 20% Economy)
        const normInf = parseFloat(p.influence) / factors.maxInfluence;
        smartValue = (0.30 * normMin) + (0.30 * normPPG) + (0.20 * normInf) + (0.20 * normIctVal);
    } else if (p.element_type === 4) {
        // FORWARDS: AVS (30% Reliability, 30% PPG, 20% Threat, 20% Economy)
        const normThreat = parseFloat(p.threat) / factors.maxThreat;
        smartValue = (0.30 * normMin) + (0.30 * normPPG) + (0.20 * normThreat) + (0.20 * normIctVal);
    }

    return smartValue;
}
