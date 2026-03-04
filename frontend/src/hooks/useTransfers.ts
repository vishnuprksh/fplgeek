import { useState, useEffect } from 'react';
import { enrichPicksWithPrices } from '../utils/price';
import { isValidFormation } from '../utils/fpl';
import type { Pick, Player, TeamPicks, UnifiedPlayer } from '../types/fpl';

export const useTransfers = (
    picksData: TeamPicks | null,
    staticData: { elements: UnifiedPlayer[] } | null,
    transfersHistory: any[]
) => {
    const [activePicks, setActivePicks] = useState<Pick[]>([]);
    const [bank, setBank] = useState(0);

    // Initialize Active Picks when data loads
    useEffect(() => {
        if (picksData && staticData && transfersHistory) {
            const enriched = enrichPicksWithPrices(picksData.picks, staticData.elements, transfersHistory);
            setActivePicks(enriched);
            setBank(picksData.entry_history.bank);
        }
    }, [picksData, staticData, transfersHistory]);

    const handleSwap = (id1: number, id2: number) => {
        if (!staticData) return;

        setActivePicks(prev => {
            const newPicks = [...prev];
            const p1Index = newPicks.findIndex(p => p.element === id1);
            const p2Index = newPicks.findIndex(p => p.element === id2);

            if (p1Index === -1 || p2Index === -1) return prev;

            // Swap positions
            const pos1 = newPicks[p1Index].position;
            const pos2 = newPicks[p2Index].position;

            // Mutate clone
            newPicks[p1Index] = { ...newPicks[p1Index], position: pos2 };
            newPicks[p2Index] = { ...newPicks[p2Index], position: pos1 };

            // Sort by position to keep data clean
            newPicks.sort((a, b) => a.position - b.position);

            // Validate Formation if swapping starter <-> bench
            const isP1Starter = pos1 <= 11;
            const isP2Starter = pos2 <= 11;

            if (isP1Starter !== isP2Starter) {
                if (!isValidFormation(newPicks, staticData.elements)) {
                    alert("Invalid Formation! You must have at least 1 GK, 3 Defenders, and 1 Forward.");
                    return prev;
                }
            }

            return newPicks;
        });
    };

    const handleTransfer = (playerOut: Player, playerIn: Player) => {
        // Determine Selling Price
        const pick = activePicks.find(p => p.element === playerOut.id);
        const sellPrice = pick ? pick.selling_price : playerOut.now_cost;

        // 1. Validation
        const costDiff = playerIn.now_cost - sellPrice;
        if (bank - costDiff < 0) {
            alert(`Insufficient funds! Need £${costDiff / 10}m but have £${bank / 10}m.`);
            return;
        }

        // 2. Update Picks
        const newPicks = activePicks.map(p => {
            if (p.element === playerOut.id) {
                return {
                    ...p,
                    element: playerIn.id,
                    selling_price: playerIn.now_cost, // Reset for new player
                    purchase_price: playerIn.now_cost
                };
            }
            return p;
        });

        setActivePicks(newPicks);
        setBank(prev => prev - costDiff);
    };

    const handleBatchTransfer = (transfers: { in: Player, out: Player }[], newLineup?: any[]) => {
        let currentBank = bank;
        let newPicks = [...activePicks];

        // 1. Apply Transfers (ID Swaps) & Calc Bank
        let totalCostDiff = 0;

        transfers.forEach(t => {
            const pick = activePicks.find(p => p.element === t.out.id);
            const sellPrice = pick ? pick.selling_price : t.out.now_cost;
            totalCostDiff += (t.in.now_cost - sellPrice);
        });

        if (currentBank - totalCostDiff < 0) {
            alert(`Insufficient funds for these transfers! Need £${totalCostDiff / 10}m.`);
            return;
        }

        transfers.forEach(t => {
            const pickIdx = newPicks.findIndex(p => p.element === t.out.id);
            if (pickIdx !== -1) {
                newPicks[pickIdx] = {
                    ...newPicks[pickIdx],
                    element: t.in.id,
                    selling_price: t.in.now_cost,
                    purchase_price: t.in.now_cost
                };
            }
        });

        // 2. Apply Lineup (Formation / Bench Ordering)
        if (newLineup && newLineup.length === 15) {
            // newLineup is array of PredictionResult
            const orderedPicks: Pick[] = [];

            newLineup.forEach((p, index) => {
                const pick = newPicks.find(existing => existing.element === p.player.id);
                if (pick) {
                    orderedPicks.push({
                        ...pick,
                        position: index + 1,
                        multiplier: index < 11 ? 1 : 0,
                        is_captain: false,
                        is_vice_captain: false
                    });
                }
            });

            // Auto-pick captain (highest predicted in XI)
            if (orderedPicks.length === 15) {
                let bestIdx = 0;
                let maxP = -1;
                newLineup.slice(0, 11).forEach((p, i) => {
                    if (p.totalForecast > maxP) {
                        maxP = p.totalForecast;
                        bestIdx = i;
                    }
                });
                if (orderedPicks[bestIdx]) {
                    orderedPicks[bestIdx].is_captain = true;
                    orderedPicks[bestIdx].multiplier = 2;
                }

                // Vice captain (2nd best)
                let vcIdx = (bestIdx === 0 ? 1 : 0);
                let maxVC = -1;
                newLineup.slice(0, 11).forEach((p, i) => {
                    if (i !== bestIdx && p.totalForecast > maxVC) {
                        maxVC = p.totalForecast;
                        vcIdx = i;
                    }
                });
                if (orderedPicks[vcIdx]) {
                    orderedPicks[vcIdx].is_vice_captain = true;
                }

                newPicks = orderedPicks;
            }
        }

        setActivePicks(newPicks);
        setBank(prev => prev - totalCostDiff);
    };

    return {
        activePicks,
        bank,
        handleSwap,
        handleTransfer,
        handleBatchTransfer
    };
};
