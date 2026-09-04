import { useState } from 'react';
import { optimizeTransfers, optimizeWithAllowance, pickBestXI } from '../utils/solver';
import type { UnifiedPlayer, Player } from '../types/fpl';
import type { OptimizationResult, PredictionResult, TransferDetail } from '../utils/solver';
import type { T100OwnershipMap, AIPredictionMap } from './useFPLData';
import type { PredictionMetadata } from '../types/gameweek';
import { getSelectedGameweeks } from '../utils/gameweekValidation';

/**
 * Compute the total haul forecast for a player over the selected gameweek window.
 *
 * For each gameweek in the window we combine the per-fixture probabilities the
 * backend emitted (backend already aggregates multiple fixtures per GW using
 * 1-(1-p1)(1-p2) composition, exposed as projections[].prob_gt_6), then average
 * across non-empty weeks. Falls back to the flat `prob_gt_6` field when
 * projections are missing.
 */
export function computeTotalForecast(
    prediction: any,
    gameweekMetadata: PredictionMetadata | null,
    haulingWeeks: number
): number {
    if (!prediction) return 0;

    const projections = prediction.projections || [];

    // Determine the GW window to optimize for
    let weeks: number[] = [];
    if (gameweekMetadata?.nextPlayGW) {
        weeks = getSelectedGameweeks(haulingWeeks, gameweekMetadata);
    }
    if (weeks.length === 0) {
        // Fallback: use the first N projections as-is
        weeks = projections.slice(0, haulingWeeks).map((p: any) => p.gw);
    }
    if (weeks.length === 0) {
        // Last resort: flat average over the whole prediction horizon
        return prediction.prob_gt_6 || 0;
    }

    let sum = 0;
    let counted = 0;
    for (const gw of weeks) {
        const proj = projections.find((p: any) => p.gw === gw);
        const value = proj ? (proj.prob_gt_6 || 0) : 0;
        sum += value;
        counted += 1;
    }

    if (counted === 0) return prediction.prob_gt_6 || 0;
    return sum / counted;
}

export const useOptimization = (
    activePicks: any[],
    staticData: { elements: UnifiedPlayer[] } | null,
    bank: number,
    t100OwnershipMap: T100OwnershipMap = {},
    gameweekMetadata: PredictionMetadata | null = null,
    aiPredictionMap: AIPredictionMap = {},
    haulingWeeks: number = 3,
    onHaulingWeeksChange?: (n: number) => void
) => {
    const [isOptimizing, setIsOptimizing] = useState(false);
    const [selectedToSell, setSelectedToSell] = useState<Set<number>>(new Set());
    const [optimizationResult, setOptimizationResult] = useState<OptimizationResult | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [transferAllowance, setTransferAllowance] = useState(1); // 0–15
    // User-rejected suggested transfers, keyed as "outPlayerId-inPlayerId"
    const [rejectedPairs, setRejectedPairs] = useState<Set<string>>(new Set());

    const toggleOptimizationMode = () => {
        if (isOptimizing) {
            setIsOptimizing(false);
            setSelectedToSell(new Set());
            setOptimizationResult(null);
            setRejectedPairs(new Set());
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
        setRejectedPairs(new Set());
    };

    // Allowance = extra free transfers on top of any mandatory exclusions
    const handleSetAllowance = (n: number) => {
        setTransferAllowance(n);
        setOptimizationResult(null);
        setRejectedPairs(new Set());
    };

    const runOptimization = (bannedPairs: Set<string> = rejectedPairs) => {
        if (!staticData || !activePicks.length) return;
        setIsProcessing(true);
        const warnings: string[] = [];

        setTimeout(() => {
            // Warn if gameweek metadata is missing
            if (!gameweekMetadata) {
                warnings.push('⚠️ Gameweek metadata not loaded - using fallback calculation');
            }

            // Build current squad structure
            const currentSquad = activePicks.map(p => {
                const player = staticData.elements.find(e => e.id === p.element);
                if (!player) return null;
                const prediction = aiPredictionMap[p.element];
                const forecast = computeTotalForecast(prediction, gameweekMetadata, haulingWeeks);
                return {
                    player,
                    cost: p.selling_price ?? player.now_cost,
                    predictedPoints: prediction?.total3Week ?? 0,
                    totalForecast: forecast,
                    smartValue: 0,
                    next5Points: []
                } as PredictionResult;
            }).filter(Boolean) as PredictionResult[];

            // Build candidates
            const allCandidates: PredictionResult[] = staticData.elements.map(e => {
                const prediction = aiPredictionMap[e.id];
                return {
                    player: e,
                    cost: e.now_cost,
                    predictedPoints: prediction?.total3Week ?? 0,
                    totalForecast: computeTotalForecast(prediction, gameweekMetadata, haulingWeeks),
                    smartValue: 0,
                    next5Points: []
                } as PredictionResult;
            });

            // If user manually picked players to sell → mandatory replacements
            // plus up to `transferAllowance` optional extra upgrades
            if (selectedToSell.size > 0) {
                const legacyRes = optimizeTransfers(currentSquad, selectedToSell, bank, allCandidates, transferAllowance, bannedPairs);

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

                const manualResult: OptimizationResult = {
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
                };
                const allManualResultPlayers = [...manualResult.lineup.starting11, ...manualResult.lineup.bench].map(p => p.player);
                manualResult.warnings = computeT100Warnings(allManualResultPlayers);
                setOptimizationResult(manualResult);
            } else {
                // Smart allowance-based optimization (greedy search)
                const res = optimizeWithAllowance(currentSquad, bank, allCandidates, transferAllowance, bannedPairs);
                const allResultPlayers = [...res.lineup.starting11, ...res.lineup.bench].map(p => p.player);
                res.warnings = computeT100Warnings(allResultPlayers);
                setOptimizationResult(res);
            }

            setIsProcessing(false);
        }, 100);
    };

    // When user changes weeks, clear optimization result (week selection is owned by the parent)
    const handleSetHaulingWeeks = (n: number) => {
        onHaulingWeeksChange?.(n);
        setOptimizationResult(null);
        setRejectedPairs(new Set());
    };

    /**
     * Reject a suggested transfer: ban the exact (out → in) pair and re-run
     * the optimizer so the next-best suggestion is produced instead.
     */
    const handleRejectTransfer = (t: TransferDetail) => {
        const key = `${t.out.player.id}-${t.in.player.id}`;
        const next = new Set(rejectedPairs);
        next.add(key);
        setRejectedPairs(next);
        runOptimization(next);
    };

    /** Clear all rejections and re-run to restore the original suggestion. */
    const handleResetRejections = () => {
        const next = new Set<string>();
        setRejectedPairs(next);
        runOptimization(next);
    };

    // Compute T100 ownership warnings
    const computeT100Warnings = (players: Player[]): string[] => {
        const warnings: string[] = [];

        const over40 = players.filter(p => (t100OwnershipMap[p.id] || 0) > 40).length;
        const over20 = players.filter(p => (t100OwnershipMap[p.id] || 0) > 20).length;
        const below10 = players.filter(p => (t100OwnershipMap[p.id] || 0) < 10);

        if (over40 < 8) {
            warnings.push(`⚠️ Only ${over40}/8 players have >40% T100 ownership (target: at least 8)`);
        }
        if (over20 < 12) {
            warnings.push(`⚠️ Only ${over20}/12 players have >20% T100 ownership (target: at least 12)`);
        }
        if (below10.length > 0) {
            const names = below10.map(p => `${p.web_name} (${(t100OwnershipMap[p.id] || 0).toFixed(0)}%)`);
            warnings.push(`⚠️ ${below10.length} player(s) below 10% T100 ownership: ${names.join(', ')}`);
        }

        return warnings;
    };

    const currentActivePlayers = activePicks.map(p => staticData?.elements.find(e => e.id === p.element)).filter(Boolean) as UnifiedPlayer[];
    const currentWarnings = computeT100Warnings(currentActivePlayers);

    return {
        isOptimizing,
        isProcessing,
        optimizationResult,
        selectedToSell,
        transferAllowance,
        setTransferAllowance: handleSetAllowance,
        haulingWeeks,
        setHaulingWeeks: handleSetHaulingWeeks,
        toggleOptimizationMode,
        handleToggleSell,
        runOptimization,
        setOptimizationResult,
        rejectedPairs,
        handleRejectTransfer,
        handleResetRejections,
        currentWarnings
    };
};
