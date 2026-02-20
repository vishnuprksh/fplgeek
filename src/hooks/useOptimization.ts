import { useState } from 'react';
import { optimizeTransfers } from '../utils/solver';
import type { Pick, UnifiedPlayer } from '../types/fpl';
import type { PredictionResult } from '../utils/predictions';
import type { PredictionMap } from './useFPLData';

export const useOptimization = (
    activePicks: Pick[],
    staticData: { elements: UnifiedPlayer[] } | null,
    predictionsMap: PredictionMap,
    bank: number
) => {
    const [isOptimizing, setIsOptimizing] = useState(false);
    const [selectedToSell, setSelectedToSell] = useState<Set<number>>(new Set());
    const [optimizationResult, setOptimizationResult] = useState<{ lineup: any, transfers: any[] } | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);

    const toggleOptimizationMode = () => {
        if (isOptimizing) {
            setIsOptimizing(false);
            setSelectedToSell(new Set());
            setOptimizationResult(null);
        } else {
            setIsOptimizing(true);
        }
    };

    const handleToggleSell = (id: number) => {
        const next = new Set(selectedToSell);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedToSell(next);
        setOptimizationResult(null);
    };

    const runOptimization = () => {
        if (!staticData || !activePicks.length) return;
        setIsProcessing(true);

        setTimeout(() => {
            // Build current squad structure
            const currentSquad = activePicks.map(p => {
                const player = staticData.elements.find(e => e.id === p.element);
                const pred = predictionsMap[p.element];
                if (!player) return null;
                return {
                    player,
                    cost: p.selling_price ?? player.now_cost,
                    predictedPoints: (pred?.totalForecast || 0) / 3,
                    totalForecast: pred?.totalForecast || 0,
                    smartValue: 0,
                    next5Points: []
                } as PredictionResult;
            }).filter(Boolean) as PredictionResult[];

            // Build candidates (all robust players)
            const allCandidates: PredictionResult[] = staticData.elements.map(e => ({
                player: e,
                cost: e.now_cost,
                predictedPoints: (predictionsMap[e.id]?.totalForecast || 0) / 3,
                totalForecast: predictionsMap[e.id]?.totalForecast || 0,
                smartValue: 0,
                next5Points: []
            })).filter(p => p.totalForecast > 0);

            const res = optimizeTransfers(currentSquad, selectedToSell, bank, allCandidates);
            setOptimizationResult(res);
            setIsProcessing(false);
        }, 100);
    };

    return {
        isOptimizing,
        isProcessing,
        optimizationResult,
        selectedToSell,
        toggleOptimizationMode,
        handleToggleSell,
        runOptimization,
        setOptimizationResult // Exposed to clear if needed
    };
};
