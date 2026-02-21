
import type { PredictionResult } from './predictions';

export interface Lineup {
    starting11: PredictionResult[];
    bench: PredictionResult[];
    totalCost: number;
    totalPredictedPoints: number;
}

export interface TransferDetail {
    out: PredictionResult;
    in: PredictionResult;
    haulBefore: number;  // prob_gt_6 of player going out
    haulAfter: number;   // prob_gt_6 of player coming in
    gainPercent: number; // net haul gain (after - before) * 100
    costDiff: number;    // in.cost - out.cost (in FPL units e.g. 45 = £4.5m)
}

export interface OptimizationResult {
    lineup: Lineup;
    squadAfter: PredictionResult[];
    transfers: TransferDetail[];
    haulBefore: number;  // XI haul % before transfers
    haulAfter: number;   // XI haul % after transfers
    netGainPercent: number;
    formationSelected: string;
    logLines: string[];  // human-readable explanation
}

const MAX_PER_TEAM = 3;

// ─── Helper: squad total haul (best XI) ────────────────────────────────────
function squadXIHaul(squad: PredictionResult[]): number {
    const best = pickBestXI(squad, 0);
    return best.starting11.reduce((sum, p) => sum + (p.totalForecast || 0), 0);
}

// ─── Helper: format percentage ──────────────────────────────────────────────
function pct(v: number) { return +(v * 100).toFixed(1); }

// ─── optimizeLineup ─────────────────────────────────────────────────────────
export function optimizeLineup(predictions: PredictionResult[], budget: number = 1000): Lineup {
    const sorted = [...predictions].sort((a, b) => b.totalForecast - a.totalForecast);
    const selected: PredictionResult[] = [];
    const teamCounts = new Map<number, number>();

    const canAdd = (p: PredictionResult) => (teamCounts.get(p.player.team) || 0) < MAX_PER_TEAM;
    const addPlayer = (p: PredictionResult) => {
        selected.push(p);
        teamCounts.set(p.player.team, (teamCounts.get(p.player.team) || 0) + 1);
    };

    let gks = sorted.filter(p => p.player.element_type === 1);
    let defs = sorted.filter(p => p.player.element_type === 2);
    let mids = sorted.filter(p => p.player.element_type === 3);
    let fwds = sorted.filter(p => p.player.element_type === 4);

    for (const p of gks) { if (canAdd(p)) { addPlayer(p); break; } }

    let defCount = 0;
    for (const p of defs) { if (canAdd(p) && defCount < 3) { addPlayer(p); defCount++; } }

    let midCount = 0;
    for (const p of mids) { if (canAdd(p) && midCount < 3) { addPlayer(p); midCount++; } }

    let fwdCount = 0;
    for (const p of fwds) { if (canAdd(p) && fwdCount < 1) { addPlayer(p); fwdCount++; } }

    const currentIds = new Set(selected.map(s => s.player.id));
    let flexCount = 0;
    for (const p of sorted) {
        if (flexCount >= 3) break;
        if (p.player.element_type === 1) continue;
        if (currentIds.has(p.player.id)) continue;
        const type = p.player.element_type;
        const typeCount = selected.filter(s => s.player.element_type === type).length;
        if (type === 2 && typeCount >= 5) continue;
        if (type === 3 && typeCount >= 5) continue;
        if (type === 4 && typeCount >= 3) continue;
        if (canAdd(p)) { addPlayer(p); currentIds.add(p.player.id); flexCount++; }
    }

    let currentCost = selected.reduce((sum, p) => sum + p.cost, 0);
    let iterations = 0;
    while (currentCost > budget && iterations < 50) {
        selected.sort((a, b) => (a.totalForecast / a.cost) - (b.totalForecast / b.cost));
        const toRemove = selected[0];
        const type = toRemove.player.element_type;
        const available = sorted.filter(p =>
            p.player.element_type === type &&
            !currentIds.has(p.player.id) &&
            p.cost < toRemove.cost &&
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
        } else { break; }
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

// ─── optimizeSquad ───────────────────────────────────────────────────────────
export function optimizeSquad(predictions: PredictionResult[], budget: number = 1000): Lineup {
    const sorted = [...predictions].sort((a, b) => b.totalForecast - a.totalForecast);
    const selected: PredictionResult[] = [];
    const teamCounts = new Map<number, number>();

    const canAdd = (p: PredictionResult) => (teamCounts.get(p.player.team) || 0) < MAX_PER_TEAM;
    const addPlayer = (p: PredictionResult) => {
        selected.push(p);
        teamCounts.set(p.player.team, (teamCounts.get(p.player.team) || 0) + 1);
    };

    const gks = sorted.filter(p => p.player.element_type === 1);
    const defs = sorted.filter(p => p.player.element_type === 2);
    const mids = sorted.filter(p => p.player.element_type === 3);
    const fwds = sorted.filter(p => p.player.element_type === 4);

    let gkCount = 0;
    for (const p of gks) { if (canAdd(p) && gkCount < 2) { addPlayer(p); gkCount++; } }
    let defCount = 0;
    for (const p of defs) { if (canAdd(p) && defCount < 5) { addPlayer(p); defCount++; } }
    let midCount = 0;
    for (const p of mids) { if (canAdd(p) && midCount < 5) { addPlayer(p); midCount++; } }
    let fwdCount = 0;
    for (const p of fwds) { if (canAdd(p) && fwdCount < 3) { addPlayer(p); fwdCount++; } }

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
                p.cost < toRemove.cost && canAdd(p)
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
            selected.sort((a, b) => b.cost - a.cost);
            const expensive = selected[0];
            const type = expensive.player.element_type;
            const available = sorted.filter(p =>
                p.player.element_type === type &&
                !selected.some(s => s.player.id === p.player.id) &&
                p.cost < expensive.cost && canAdd(p)
            );
            if (available.length > 0) {
                const replacement = available[0];
                const idx = selected.findIndex(s => s.player.id === expensive.player.id);
                selected.splice(idx, 1);
                addPlayer(replacement);
                teamCounts.set(expensive.player.team, (teamCounts.get(expensive.player.team) || 1) - 1);
                currentCost = selected.reduce((sum, p) => sum + p.cost, 0);
            } else { break; }
        }
        iterations++;
    }

    return pickBestXI(selected, currentCost);
}

// ─── pickBestXI ──────────────────────────────────────────────────────────────
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
    const gks = sortedSquad.filter(p => p.player.element_type === 1);
    const defs = sortedSquad.filter(p => p.player.element_type === 2);
    const mids = sortedSquad.filter(p => p.player.element_type === 3);
    const fwds = sortedSquad.filter(p => p.player.element_type === 4);

    let bestLineup: Lineup | null = null;
    let maxXiPoints = -1;

    for (const form of validFormations) {
        const [nGK, nDEF, nMID, nFWD] = form;
        if (gks.length < nGK || defs.length < nDEF || mids.length < nMID || fwds.length < nFWD) continue;

        const xi: PredictionResult[] = [
            ...gks.slice(0, nGK),
            ...defs.slice(0, nDEF),
            ...mids.slice(0, nMID),
            ...fwds.slice(0, nFWD)
        ];

        const xiPoints = xi.reduce((sum, p) => sum + p.totalForecast, 0);

        if (xiPoints > maxXiPoints) {
            maxXiPoints = xiPoints;
            const xiIds = new Set(xi.map(p => p.player.id));
            const bench = sortedSquad.filter(p => !xiIds.has(p.player.id));
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
        return {
            starting11: squad.slice(0, 11),
            bench: squad.slice(11),
            totalCost: totalSquadCost,
            totalPredictedPoints: 0
        };
    }

    return bestLineup;
}

// ─── optimizeTransfers (legacy — still works for manual sell mode) ──────────
export function optimizeTransfers(
    currentSquad: PredictionResult[],
    excludedIds: Set<number>,
    bank: number,
    allCandidates: PredictionResult[]
): { lineup: Lineup, transfers: any[] } {

    const validSquad = currentSquad.filter(p => !excludedIds.has(p.player.id));
    const playersToRemove = currentSquad.filter(p => excludedIds.has(p.player.id));

    let currentBudget = bank + playersToRemove.reduce((sum, p) => sum + p.cost, 0);

    const teamCounts = new Map<number, number>();
    validSquad.forEach(p => {
        teamCounts.set(p.player.team, (teamCounts.get(p.player.team) || 0) + 1);
    });

    const newTransfers: { in: PredictionResult, out: PredictionResult }[] = [];
    const newSquad = [...validSquad];

    const minCosts: Record<number, number> = { 1: 40, 2: 40, 3: 45, 4: 45 };
    let remainingBudget = currentBudget;
    const pendingSlots = [...playersToRemove];

    for (const pOut of playersToRemove) {
        const type = pOut.player.element_type;
        const otherSlots = pendingSlots.filter(s => s !== pOut);
        const reservedForOthers = otherSlots.reduce((sum, s) => sum + (minCosts[s.player.element_type] || 40), 0);
        const maxBudgetForThisSlot = remainingBudget - reservedForOthers;

        const candidates = allCandidates
            .filter(c =>
                c.player.element_type === type &&
                !newSquad.some(s => s.player.id === c.player.id) &&
                !newTransfers.some(t => t.in.player.id === c.player.id) &&
                c.cost <= maxBudgetForThisSlot
            )
            .sort((a, b) => b.totalForecast - a.totalForecast);

        let bestFit: PredictionResult | null = null;
        for (const cand of candidates) {
            const tCount = teamCounts.get(cand.player.team) || 0;
            if (tCount < MAX_PER_TEAM) { bestFit = cand; break; }
        }

        if (bestFit) {
            newTransfers.push({ in: bestFit, out: pOut });
            newSquad.push(bestFit);
            teamCounts.set(bestFit.player.team, (teamCounts.get(bestFit.player.team) || 0) + 1);
            remainingBudget -= bestFit.cost;
            const idx = pendingSlots.indexOf(pOut);
            if (idx > -1) pendingSlots.splice(idx, 1);
        } else {
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
                newSquad.push(pOut);
            }
        }
    }

    const finalLineup = pickBestXI(newSquad, newSquad.reduce((s, p) => s + p.cost, 0));
    return { lineup: finalLineup, transfers: newTransfers };
}

// ─── optimizeWithAllowance ── MAIN NEW FUNCTION ───────────────────────────────
/**
 * Greedy best-swap optimizer.
 * For each allowance slot it:
 *  1. Computes baseline XI haul
 *  2. Tries replacing every player in the squad with every affordable same-position candidate
 *  3. Picks the swap with the highest haul gain
 *  4. Repeats for remaining allowances
 *
 * Returns a rich OptimizationResult with per-transfer details and log lines.
 */
export function optimizeWithAllowance(
    currentSquad: PredictionResult[],
    bank: number,
    allCandidates: PredictionResult[],
    allowance: number
): OptimizationResult {
    const logLines: string[] = [];
    const transfers: TransferDetail[] = [];

    let squad = [...currentSquad];
    const haulBefore = squadXIHaul(squad);
    logLines.push(`📊 Starting XI Haul: ${pct(haulBefore)}% across all starters`);

    if (allowance === 0) {
        // Just optimise lineup / formation
        const lineup = pickBestXI(squad, squad.reduce((s, p) => s + p.cost, 0));
        const formations = lineup.starting11;
        const defCount = formations.filter(p => p.player.element_type === 2).length;
        const midCount = formations.filter(p => p.player.element_type === 3).length;
        const fwdCount = formations.filter(p => p.player.element_type === 4).length;
        const formStr = `1-${defCount}-${midCount}-${fwdCount}`;
        logLines.push(`🔄 No transfers allowed — optimising formation only`);
        logLines.push(`✅ Best formation: ${formStr}`);

        const haulAfter = squadXIHaul(squad);
        return {
            lineup, squadAfter: squad, transfers: [],
            haulBefore, haulAfter,
            netGainPercent: pct(haulAfter - haulBefore),
            formationSelected: formStr,
            logLines
        };
    }

    for (let round = 1; round <= allowance; round++) {
        const baselineHaul = squadXIHaul(squad);
        let bestGain = -Infinity;
        let bestSwap: { outIdx: number; candidate: PredictionResult } | null = null;

        // Build team usage counts from current squad
        const teamCounts = new Map<number, number>();
        squad.forEach(p => teamCounts.set(p.player.team, (teamCounts.get(p.player.team) || 0) + 1));

        // Try each player in squad as a potential sell
        for (let i = 0; i < squad.length; i++) {
            const pOut = squad[i];
            const sellPrice = pOut.cost;
            const budgetForSlot = bank + sellPrice; // bank + sell proceeds

            // Candidates: same position, not already in squad, within budget, team limit OK
            const squadIds = new Set(squad.map(p => p.player.id));
            const candidates = allCandidates.filter(c =>
                c.player.element_type === pOut.player.element_type &&
                !squadIds.has(c.player.id) &&
                c.cost <= budgetForSlot
            );

            for (const cand of candidates) {
                // Team limit check: if adding cand, does it violate max 3 per team?
                const candTeamCount = teamCounts.get(cand.player.team) || 0;
                // pOut's team count will decrease by 1, so allow if team differs or cand team still has room
                const effectiveCount = cand.player.team === pOut.player.team
                    ? candTeamCount - 1   // pOut leaves, we slot one back in
                    : candTeamCount;
                if (effectiveCount >= MAX_PER_TEAM) continue;

                // Simulate swap
                const trialSquad = [...squad];
                trialSquad[i] = { ...cand };

                const newHaul = squadXIHaul(trialSquad);
                const gain = newHaul - baselineHaul;

                if (gain > bestGain) {
                    bestGain = gain;
                    bestSwap = { outIdx: i, candidate: cand };
                }
            }
        }

        if (!bestSwap || bestGain <= 0) {
            logLines.push(`🔁 Round ${round}: No beneficial swap found — stopping early`);
            break;
        }

        // Apply the swap
        const pOut = squad[bestSwap.outIdx];
        const pIn = bestSwap.candidate;
        const costDiff = pIn.cost - pOut.cost;

        squad[bestSwap.outIdx] = { ...pIn };
        bank = bank - costDiff; // update running bank

        const detail: TransferDetail = {
            out: pOut,
            in: pIn,
            haulBefore: pOut.totalForecast,
            haulAfter: pIn.totalForecast,
            gainPercent: pct(bestGain),
            costDiff
        };
        transfers.push(detail);

        const sign = costDiff >= 0 ? `-£${(costDiff / 10).toFixed(1)}m` : `+£${(Math.abs(costDiff) / 10).toFixed(1)}m`;
        logLines.push(
            `🔄 Transfer ${round}: ${pOut.player.web_name} (${pct(pOut.totalForecast)}%) → ${pIn.player.web_name} (${pct(pIn.totalForecast)}%)  [gain: +${pct(bestGain)}%  cost: ${sign}]`
        );
    }

    // Final lineup optimisation
    const finalLineup = pickBestXI(squad, squad.reduce((s, p) => s + p.cost, 0));
    const formations = finalLineup.starting11;
    const defCount = formations.filter(p => p.player.element_type === 2).length;
    const midCount = formations.filter(p => p.player.element_type === 3).length;
    const fwdCount = formations.filter(p => p.player.element_type === 4).length;
    const formStr = `1-${defCount}-${midCount}-${fwdCount}`;

    const haulAfter = squadXIHaul(squad);
    const netGainPercent = pct(haulAfter - haulBefore);

    logLines.push(`✅ Best formation: ${formStr}`);
    logLines.push(`📈 Final XI Haul: ${pct(haulAfter)}%  (was ${pct(haulBefore)}%, net gain: +${netGainPercent}%)`);

    return {
        lineup: finalLineup,
        squadAfter: squad,
        transfers,
        haulBefore,
        haulAfter,
        netGainPercent,
        formationSelected: formStr,
        logLines
    };
}

function selectedCost(squad: PredictionResult[]) {
    return squad.reduce((sum, p) => sum + p.cost, 0);
}

// suppress unused warning
void selectedCost;
