import { useState } from 'react';
import { optimizeTransfers, optimizeWithAllowance, pickBestXI } from '../utils/solver';
import type { Pick, UnifiedPlayer } from '../types/fpl';
import type { PredictionResult } from '../utils/predictions';
import type { OptimizationResult } from '../utils/solver';
import type { PredictionMap } from './useFPLData';

export const useOptimization = (
    activePicks: Pick[],
    staticData: { elements: UnifiedPlayer[] } | null,
    predictionsMap: PredictionMap,
    bank: number
) => {
    const [isOptimizing, setIsOptimizing] = useState(false);
    const [selectedToSell, setSelectedToSell] = useState<Set<number>>(new Set());
    const [optimizationResult, setOptimizationResult] = useState<OptimizationResult | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [transferAllowance, setTransferAllowance] = useState(1); // 0–15

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
        setTransferAllowance(next.size); // auto-sync pill
        setOptimizationResult(null);
    };

    // When user changes allowance via pills, clear manual selections
    const handleSetAllowance = (n: number) => {
        setTransferAllowance(n);
        if (n !== selectedToSell.size) {
            setSelectedToSell(new Set());
        }
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
                    predictedPoints: pred?.prob_gt_6 || 0,
                    totalForecast: pred?.prob_gt_6 || 0,
                    smartValue: 0,
                    next5Points: []
                } as PredictionResult;
            }).filter(Boolean) as PredictionResult[];

            // Build candidates (all players with a prediction)
            const allCandidates: PredictionResult[] = staticData.elements.map(e => ({
                player: e,
                cost: e.now_cost,
                predictedPoints: predictionsMap[e.id]?.prob_gt_6 || 0,
                totalForecast: predictionsMap[e.id]?.prob_gt_6 || 0,
                smartValue: 0,
                next5Points: []
            })).filter(p => p.totalForecast > 0);

            // If user manually picked players to sell → use targeted replacement
            if (selectedToSell.size > 0) {
                const legacyRes = optimizeTransfers(currentSquad, selectedToSell, bank, allCandidates);

                // Compute before/after hauls for a richer report
                const beforeLineup = pickBestXI(currentSquad, 0);
                const haulBefore = beforeLineup.starting11.reduce((s, p) => s + (p.totalForecast || 0), 0);
                const haulAfter = legacyRes.lineup.starting11.reduce((s, p) => s + (p.totalForecast || 0), 0);
                const pct = (v: number) => +(v * 100).toFixed(1);

                const formations = legacyRes.lineup.starting11;
                const defC = formations.filter(p => p.player.element_type === 2).length;
                const midC = formations.filter(p => p.player.element_type === 3).length;
                const fwdC = formations.filter(p => p.player.element_type === 4).length;
                const formStr = `1-${defC}-${midC}-${fwdC}`;

                const logLines: string[] = [
                    `📊 Starting XI Haul: ${pct(haulBefore)}% across all starters`,
                    ...legacyRes.transfers.map((t: any, i: number) => {
                        const sign = (t.in.cost - t.out.cost) >= 0
                            ? `-£${((t.in.cost - t.out.cost) / 10).toFixed(1)}m`
                            : `+£${(Math.abs(t.in.cost - t.out.cost) / 10).toFixed(1)}m`;
                        return `🔄 Transfer ${i + 1}: ${t.out.player.web_name} (${pct(t.out.totalForecast)}%) → ${t.in.player.web_name} (${pct(t.in.totalForecast)}%)  [cost: ${sign}]`;
                    }),
                    `✅ Best formation: ${formStr}`,
                    `📈 Final XI Haul: ${pct(haulAfter)}%  (was ${pct(haulBefore)}%, net gain: +${pct(haulAfter - haulBefore)}%)`
                ];

                setOptimizationResult({
                    lineup: legacyRes.lineup,
                    squadAfter: [],
                    transfers: legacyRes.transfers.map((t: any) => ({
                        out: t.out,
                        in: t.in,
                        haulBefore: t.out.totalForecast,
                        haulAfter: t.in.totalForecast,
                        gainPercent: +((t.in.totalForecast - t.out.totalForecast) * 100).toFixed(1),
                        costDiff: t.in.cost - t.out.cost
                    })),
                    haulBefore,
                    haulAfter,
                    netGainPercent: pct(haulAfter - haulBefore),
                    formationSelected: formStr,
                    logLines
                });
            } else {
                // Smart allowance-based optimization (greedy search)
                const res = optimizeWithAllowance(currentSquad, bank, allCandidates, transferAllowance);
                setOptimizationResult(res);
            }

            setIsProcessing(false);
        }, 100);
    };

    return {
        isOptimizing,
        isProcessing,
        optimizationResult,
        selectedToSell,
        transferAllowance,
        setTransferAllowance: handleSetAllowance,
        toggleOptimizationMode,
        handleToggleSell,
        runOptimization,
        setOptimizationResult
    };
};
