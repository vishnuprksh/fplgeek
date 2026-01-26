
import type { PredictionResult } from './predictions';

export interface Lineup {
    starting11: PredictionResult[];
    bench: PredictionResult[];
    totalCost: number;
    totalPredictedPoints: number;
}

const MAX_PER_TEAM = 3;

export function optimizeLineup(predictions: PredictionResult[], budget: number = 1000): Lineup {
    // 1. Sort by total predicted points (desc)
    const sorted = [...predictions].sort((a, b) => b.totalForecast - a.totalForecast);

    // Squad structure targets for a valid Starting XI + Bench
    // We will optimize for the best STARTING 11 within the budget. 

    const selected: PredictionResult[] = [];
    const teamCounts = new Map<number, number>();

    // Requirements for 11:
    // GK: 1, DEF: 3, MID: 3, FWD: 1, Flex: 3
    let gks = sorted.filter(p => p.player.element_type === 1);
    let defs = sorted.filter(p => p.player.element_type === 2);
    let mids = sorted.filter(p => p.player.element_type === 3);
    let fwds = sorted.filter(p => p.player.element_type === 4);

    // Helper to check addability
    const canAdd = (p: PredictionResult) => {
        const tCount = teamCounts.get(p.player.team) || 0;
        return tCount < MAX_PER_TEAM;
    };

    const addPlayer = (p: PredictionResult) => {
        selected.push(p);
        teamCounts.set(p.player.team, (teamCounts.get(p.player.team) || 0) + 1);
    };

    // 1. Core Selection (Highest Value Foundation)
    for (const p of gks) { if (canAdd(p)) { addPlayer(p); break; } }

    let defCount = 0;
    for (const p of defs) { if (canAdd(p) && defCount < 3) { addPlayer(p); defCount++; } }

    let midCount = 0;
    for (const p of mids) { if (canAdd(p) && midCount < 3) { addPlayer(p); midCount++; } }

    let fwdCount = 0;
    for (const p of fwds) { if (canAdd(p) && fwdCount < 1) { addPlayer(p); fwdCount++; } }

    // 2. Flex Selection (Best remaining 3)
    const currentIds = new Set(selected.map(s => s.player.id));
    let flexCount = 0;

    for (const p of sorted) {
        if (flexCount >= 3) break;
        if (p.player.element_type === 1) continue; // No more GKs
        if (currentIds.has(p.player.id)) continue;

        const type = p.player.element_type;
        const typeCount = selected.filter(s => s.player.element_type === type).length;
        if (type === 2 && typeCount >= 5) continue;
        if (type === 3 && typeCount >= 5) continue;
        if (type === 4 && typeCount >= 3) continue;

        if (canAdd(p)) {
            addPlayer(p);
            currentIds.add(p.player.id);
            flexCount++;
        }
    }

    // 3. Budget Check & Adjustment
    let currentCost = selected.reduce((sum, p) => sum + p.cost, 0);
    let iterations = 0;
    while (currentCost > budget && iterations < 50) {
        // Sort selected by efficiency (asc)
        selected.sort((a, b) => (a.totalForecast / a.cost) - (b.totalForecast / b.cost));

        const toRemove = selected[0]; // Lowest efficiency
        const type = toRemove.player.element_type;

        const available = sorted.filter(p =>
            p.player.element_type === type &&
            !currentIds.has(p.player.id) &&
            p.cost < toRemove.cost && // Must be cheaper
            canAdd(p)
        );

        if (available.length > 0) {
            const replacement = available[0];
            const idx = selected.findIndex(s => s.player.id === toRemove.player.id);
            selected.splice(idx, 1);
            selected.push(replacement);

            currentIds.delete(toRemove.player.id);
            currentIds.add(replacement.player.id);
            teamCounts.set(toRemove.player.team, (teamCounts.get(toRemove.player.team) || 1) - 1);
            teamCounts.set(replacement.player.team, (teamCounts.get(replacement.player.team) || 0) + 1);

            currentCost = selected.reduce((sum, p) => sum + p.cost, 0);
        } else {
            break;
        }
        iterations++;
    }

    const totalPoints = selected.reduce((sum, p) => sum + p.totalForecast, 0);

    return {
        starting11: selected.sort((a, b) => a.player.element_type - b.player.element_type),
        bench: [],
        totalCost: currentCost,
        totalPredictedPoints: totalPoints
    };
}

export function optimizeSquad(predictions: PredictionResult[], budget: number = 1000): Lineup {
    const sorted = [...predictions].sort((a, b) => b.totalForecast - a.totalForecast);
    const selected: PredictionResult[] = [];
    const teamCounts = new Map<number, number>();

    const canAdd = (p: PredictionResult) => {
        const tCount = teamCounts.get(p.player.team) || 0;
        return tCount < MAX_PER_TEAM;
    };

    const addPlayer = (p: PredictionResult) => {
        selected.push(p);
        teamCounts.set(p.player.team, (teamCounts.get(p.player.team) || 0) + 1);
    };

    // Requirements for 15: GK: 2, DEF: 5, MID: 5, FWD: 3
    let gks = sorted.filter(p => p.player.element_type === 1);
    let defs = sorted.filter(p => p.player.element_type === 2);
    let mids = sorted.filter(p => p.player.element_type === 3);
    let fwds = sorted.filter(p => p.player.element_type === 4);

    // 1. Fill Slots with Best Available
    let gkCount = 0;
    for (const p of gks) { if (canAdd(p) && gkCount < 2) { addPlayer(p); gkCount++; } }

    let defCount = 0;
    for (const p of defs) { if (canAdd(p) && defCount < 5) { addPlayer(p); defCount++; } }

    let midCount = 0;
    for (const p of mids) { if (canAdd(p) && midCount < 5) { addPlayer(p); midCount++; } }

    let fwdCount = 0;
    for (const p of fwds) { if (canAdd(p) && fwdCount < 3) { addPlayer(p); fwdCount++; } }

    // 2. Budget Check & Adjustment
    let currentCost = selected.reduce((sum, p) => sum + p.cost, 0);
    let iterations = 0;

    while (currentCost > budget && iterations < 200) {
        selected.sort((a, b) => (a.totalForecast / a.cost) - (b.totalForecast / b.cost));
        let swapped = false;

        for (let i = 0; i < Math.min(selected.length, 5); i++) {
            const toRemove = selected[i];
            const type = toRemove.player.element_type;

            const available = sorted.filter(p =>
                p.player.element_type === type &&
                !selected.some(s => s.player.id === p.player.id) &&
                p.cost < toRemove.cost &&
                canAdd(p)
            );

            if (available.length > 0) {
                const replacement = available[0];
                const idx = selected.findIndex(s => s.player.id === toRemove.player.id);
                selected.splice(idx, 1);
                addPlayer(replacement);

                teamCounts.set(toRemove.player.team, (teamCounts.get(toRemove.player.team) || 1) - 1);
                currentCost = selected.reduce((sum, p) => sum + p.cost, 0);
                swapped = true;
                break;
            }
        }

        if (!swapped) {
            // Force swap most expensive if efficient swap fails
            selected.sort((a, b) => b.cost - a.cost);
            const expensive = selected[0];
            const type = expensive.player.element_type;

            const available = sorted.filter(p =>
                p.player.element_type === type &&
                !selected.some(s => s.player.id === p.player.id) &&
                p.cost < expensive.cost &&
                canAdd(p)
            );

            if (available.length > 0) {
                const replacement = available[0];
                const idx = selected.findIndex(s => s.player.id === expensive.player.id);
                selected.splice(idx, 1);
                addPlayer(replacement);
                teamCounts.set(expensive.player.team, (teamCounts.get(expensive.player.team) || 1) - 1);
                currentCost = selected.reduce((sum, p) => sum + p.cost, 0);
            } else {
                break;
            }
        }
        iterations++;
    }

    // 3. Separate into Starting XI and Bench
    return pickBestXI(selected, currentCost);
}

export function pickBestXI(squad: PredictionResult[], totalSquadCost: number = 0): Lineup {
    const validFormations = [
        [1, 3, 5, 2],
        [1, 3, 4, 3],
        [1, 4, 4, 2],
        [1, 4, 3, 3],
        [1, 4, 5, 1],
        [1, 5, 3, 2],
        [1, 5, 4, 1],
        [1, 5, 2, 3]
    ];

    const sortedSquad = [...squad].sort((a, b) => b.totalForecast - a.totalForecast);

    // Split by type
    const gks = sortedSquad.filter(p => p.player.element_type === 1);
    const defs = sortedSquad.filter(p => p.player.element_type === 2);
    const mids = sortedSquad.filter(p => p.player.element_type === 3);
    const fwds = sortedSquad.filter(p => p.player.element_type === 4);

    let bestLineup: Lineup | null = null;
    let maxXiPoints = -1;

    for (const form of validFormations) {
        const [nGK, nDEF, nMID, nFWD] = form;

        // Check availability
        if (gks.length < nGK || defs.length < nDEF || mids.length < nMID || fwds.length < nFWD) continue;

        // Pick best for this formation
        const xi: PredictionResult[] = [
            ...gks.slice(0, nGK),
            ...defs.slice(0, nDEF),
            ...mids.slice(0, nMID),
            ...fwds.slice(0, nFWD)
        ];

        const xiPoints = xi.reduce((sum, p) => sum + p.totalForecast, 0);

        if (xiPoints > maxXiPoints) {
            maxXiPoints = xiPoints;

            // Construct Bench
            // Remainder players
            const xiIds = new Set(xi.map(p => p.player.id));
            const bench = sortedSquad.filter(p => !xiIds.has(p.player.id));

            // Order Bench: GK must be first (if any). Then Outfielders by points.
            // FPL Rules: Bench 1 is always GKP? No, Bench 1 is usually substitute GK.
            // Actually in FPL API, position 12 is GK Sub. 13, 14, 15 are outfield subs.
            // Let's ensure the bench GK is first.
            const benchGK = bench.find(p => p.player.element_type === 1);
            const benchOutfield = bench.filter(p => p.player.element_type !== 1).sort((a, b) => b.totalForecast - a.totalForecast);

            const orderedBench = benchGK ? [benchGK, ...benchOutfield] : benchOutfield;

            bestLineup = {
                starting11: xi.sort((a, b) => a.player.element_type - b.player.element_type),
                bench: orderedBench,
                totalCost: totalSquadCost,
                totalPredictedPoints: xiPoints
            };
        }
    }

    if (!bestLineup) {
        // Fallback (should not happen if squad size is correct)
        return {
            starting11: squad.slice(0, 11),
            bench: squad.slice(11),
            totalCost: totalSquadCost,
            totalPredictedPoints: 0
        };
    }

    return bestLineup;
}

export function optimizeTransfers(
    currentSquad: PredictionResult[],
    excludedIds: Set<number>,
    bank: number,
    allCandidates: PredictionResult[]
): { lineup: Lineup, transfers: { in: PredictionResult, out: PredictionResult }[] } {

    // 1. Identify valid slots to fill
    const validSquad = currentSquad.filter(p => !excludedIds.has(p.player.id));
    const playersToRemove = currentSquad.filter(p => excludedIds.has(p.player.id));

    // Calculate initial budget
    let currentBudget = bank + playersToRemove.reduce((sum, p) => sum + p.cost, 0);

    // We need to fill these slots with new players such that:
    // 1. Total cost <= currentBudget
    // 2. Players are not in validSquad
    // 3. Max 3 per team constraint is respected (count existing first)
    // 4. Total predicted points is maximized

    const teamCounts = new Map<number, number>();
    validSquad.forEach(p => {
        teamCounts.set(p.player.team, (teamCounts.get(p.player.team) || 0) + 1);
    });

    const newTransfers: { in: PredictionResult, out: PredictionResult }[] = [];
    const newSquad = [...validSquad];

    // Simple Greedy Approach for each removed player

    // To handle pooled budget correctly for multiple transfers:
    // We need to reserve min cost for other slots.
    // Min cost for pos: GKP=40, DEF=40, MID=45, FWD=45 (approx)
    const minCosts: Record<number, number> = { 1: 40, 2: 40, 3: 45, 4: 45 };

    let remainingBudget = currentBudget;
    const pendingSlots = [...playersToRemove]; // Objects

    for (const pOut of playersToRemove) {
        const type = pOut.player.element_type;

        // Calculate budget available for THIS slot
        // = RemainingBudget - (MinCost of ALL OTHER pending slots)
        const otherSlots = pendingSlots.filter(s => s !== pOut);
        const reservedForOthers = otherSlots.reduce((sum, s) => sum + (minCosts[s.player.element_type] || 40), 0);
        const maxBudgetForThisSlot = remainingBudget - reservedForOthers;

        // Find best candidate
        const candidates = allCandidates
            .filter(c =>
                c.player.element_type === type &&
                !newSquad.some(s => s.player.id === c.player.id) &&
                !newTransfers.some(t => t.in.player.id === c.player.id) &&
                c.cost <= maxBudgetForThisSlot
            )
            .sort((a, b) => b.totalForecast - a.totalForecast); // Best points first

        let bestFit: PredictionResult | null = null;

        for (const cand of candidates) {
            const tCount = teamCounts.get(cand.player.team) || 0;
            if (tCount < MAX_PER_TEAM) {
                bestFit = cand;
                break;
            }
        }

        if (bestFit) {
            newTransfers.push({ in: bestFit, out: pOut });
            newSquad.push(bestFit);
            teamCounts.set(bestFit.player.team, (teamCounts.get(bestFit.player.team) || 0) + 1);
            remainingBudget -= bestFit.cost;

            // Remove from pending
            const idx = pendingSlots.indexOf(pOut);
            if (idx > -1) pendingSlots.splice(idx, 1);
        } else {
            // Failed to find replacement? Keep original (fallback) or pick cheapest valid?
            const fodder = allCandidates
                .filter(c =>
                    c.player.element_type === type &&
                    !newSquad.some(s => s.player.id === c.player.id) &&
                    c.cost <= maxBudgetForThisSlot
                )
                .sort((a, b) => a.cost - b.cost)[0];

            if (fodder) {
                newTransfers.push({ in: fodder, out: pOut });
                newSquad.push(fodder);
                remainingBudget -= fodder.cost;
            } else {
                // Critical failure (shouldn't happen given min costs), keep original
                newSquad.push(pOut);
            }
        }
    }

    // Now optimize the lineup (Starting 11 vs Bench) for the FINAL squad
    const finalLineup = pickBestXI(newSquad, selectedCost(newSquad));

    return { lineup: finalLineup, transfers: newTransfers };
}

function selectedCost(squad: PredictionResult[]) {
    return squad.reduce((sum, p) => sum + p.cost, 0);
}
