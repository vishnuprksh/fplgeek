import type { UnifiedPlayer, Player } from '../types/fpl';

export interface PredictionResult {
    player: Player | UnifiedPlayer;
    cost: number;
    predictedPoints: number;
    totalForecast: number;
    smartValue: number;
    next5Points: number[];
}

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
    warnings?: string[];
}

const MAX_PER_TEAM = 3;

// ─── Helper: squad total haul (best XI) ────────────────────────────────────
function squadXIHaul(squad: PredictionResult[]): number {
    const best = pickBestXI(squad, 0);
    return best.starting11.reduce((sum, p) => sum + (p.totalForecast || 0), 0);
}

// ─── Helper: format percentage ──────────────────────────────────────────────
function pct(v: number) { return +(v * 100).toFixed(1); }

// ─── Helper: format formation string ────────────────────────────────────────
function formatFormation(squad: PredictionResult[]): string {
    const d = squad.filter(p => p.player.element_type === 2).length;
    const m = squad.filter(p => p.player.element_type === 3).length;
    const f = squad.filter(p => p.player.element_type === 4).length;
    return `1-${d}-${m}-${f}`;
}

/** Binomial coefficient C(n, k) — for logging only */
function comb(n: number, k: number): number {
    if (k > n) return 0;
    if (k === 0 || k === n) return 1;
    let result = 1;
    for (let i = 0; i < k; i++) { result = result * (n - i) / (i + 1); }
    return Math.round(result);
}

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

    const gks = sorted.filter(p => p.player.element_type === 1);
    const defs = sorted.filter(p => p.player.element_type === 2);
    const mids = sorted.filter(p => p.player.element_type === 3);
    const fwds = sorted.filter(p => p.player.element_type === 4);

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

// ─── optimizeTransfers (legacy — for manual sell mode) ──────────────────────
export function optimizeTransfers(
    currentSquad: PredictionResult[],
    excludedIds: Set<number>,
    bank: number,
    allCandidates: PredictionResult[]
): { lineup: Lineup, transfers: any[] } {

    const validSquad = currentSquad.filter(p => !excludedIds.has(p.player.id));
    const playersToRemove = currentSquad.filter(p => excludedIds.has(p.player.id));

    const pooledBudget = bank + playersToRemove.reduce((sum, p) => sum + p.cost, 0);

    // Use the same simultaneous slot-filling as the main optimizer
    const slots = playersToRemove.map(p => ({ type: p.player.element_type }));
    const { filled, success } = fillSlots(validSquad, slots, pooledBudget, allCandidates);

    const newTransfers: { in: PredictionResult, out: PredictionResult }[] = [];
    let newSquad: PredictionResult[];

    if (success) {
        newSquad = [...validSquad, ...filled];
        playersToRemove.forEach((pOut, i) => {
            newTransfers.push({ in: filled[i], out: pOut });
        });
    } else {
        // Fallback: keep original squad
        newSquad = [...currentSquad];
    }

    const finalLineup = pickBestXI(newSquad, newSquad.reduce((s, p) => s + p.cost, 0));
    return { lineup: finalLineup, transfers: newTransfers };
}

// ─── Combinatorial helpers ────────────────────────────────────────────────────

/** Generate all k-size index combinations from [0..n-1] */
function* combinations(n: number, k: number): Generator<number[]> {
    const c = Array.from({ length: k }, (_, i) => i);
    while (true) {
        yield [...c];
        let i = k - 1;
        while (i >= 0 && c[i] === n - k + i) i--;
        if (i < 0) return;
        c[i]++;
        for (let j = i + 1; j < k; j++) c[j] = c[j - 1] + 1;
    }
}

/**
 * Given retained squad + N empty position slots to fill,
 * find the best N candidates using a pooled budget.
 *
 * All slots are filled simultaneously with a shared budget pool.
 * Slots are sorted expensive-first so budget is allocated optimally.
 */
function fillSlots(
    retained: PredictionResult[],
    slots: { type: number }[],
    pooledBudget: number,
    allCandidates: PredictionResult[]
): { filled: PredictionResult[]; success: boolean } {
    const minCosts: Record<number, number> = { 1: 40, 2: 40, 3: 45, 4: 45 };

    // Sort slots by highest min-cost first → expensive positions get first pick
    const indexedSlots = slots.map((s, origIdx) => ({ ...s, origIdx }));
    indexedSlots.sort((a, b) => (minCosts[b.type] || 40) - (minCosts[a.type] || 40));

    const retainedIds = new Set(retained.map(p => p.player.id));
    const teamCounts = new Map<number, number>();
    retained.forEach(p => teamCounts.set(p.player.team, (teamCounts.get(p.player.team) || 0) + 1));

    const filledByOrig: (PredictionResult | null)[] = new Array(slots.length).fill(null);
    const pickedIds = new Set<number>();
    let budget = pooledBudget;

    for (let i = 0; i < indexedSlots.length; i++) {
        const slot = indexedSlots[i];
        // Reserve minimum cost for remaining unfilled slots
        const remaining = indexedSlots.slice(i + 1);
        const reserved = remaining.reduce((s, sl) => s + (minCosts[sl.type] || 40), 0);
        const maxForThisSlot = budget - reserved;

        const candidates = allCandidates
            .filter(c =>
                c.player.element_type === slot.type &&
                !retainedIds.has(c.player.id) &&
                !pickedIds.has(c.player.id) &&
                c.cost <= maxForThisSlot &&
                ((teamCounts.get(c.player.team) || 0) < MAX_PER_TEAM)
            )
            .sort((a, b) => b.totalForecast - a.totalForecast);

        if (candidates.length === 0) return { filled: [], success: false };

        const pick = candidates[0];
        filledByOrig[slot.origIdx] = pick;
        pickedIds.add(pick.player.id);
        teamCounts.set(pick.player.team, (teamCounts.get(pick.player.team) || 0) + 1);
        budget -= pick.cost;
    }

    // Check all slots were filled
    const filled = filledByOrig.filter(Boolean) as PredictionResult[];
    if (filled.length !== slots.length) return { filled: [], success: false };

    return { filled, success: true };
}

// ─── optimizeWithAllowance ── COMBINATORIAL SEARCH ────────────────────────────
/**
 * Combinatorial optimizer.
 *
 * For N transfers ≤ 11:
 *  1. Generates all C(15, N) combinations of N players to remove
 *  2. For each combo, pools the freed budget (bank + all sell prices)
 *  3. Fills all N positional slots simultaneously with best available candidates
 *  4. Picks the combo with the highest resulting XI haul
 *
 * For N > 11 (2-PHASE APPROACH):
 *  Phase 1: Optimize for best XI only using N-4 transfers (leaving 4+ for bench)
 *  Phase 2: Fill bench positions with remaining transfers and leftover budget
 *
 * This prioritizes starting XI haul first, then optimizes bench for rotation/coverage.
 */
export function optimizeWithAllowance(
    currentSquad: PredictionResult[],
    bank: number,
    allCandidates: PredictionResult[],
    allowance: number
): OptimizationResult {
    const logLines: string[] = [];
    const haulBefore = squadXIHaul(currentSquad);
    logLines.push(`📊 Starting XI Haul: ${pct(haulBefore)}% across all starters`);

    if (allowance === 0) {
        const lineup = pickBestXI(currentSquad, currentSquad.reduce((s, p) => s + p.cost, 0));
        const formStr = formatFormation(lineup.starting11);
        logLines.push(`🔄 No transfers allowed — optimising formation only`);
        logLines.push(`✅ Best formation: ${formStr}`);
        const haulAfter = squadXIHaul(currentSquad);
        return {
            lineup, squadAfter: [...currentSquad], transfers: [],
            haulBefore, haulAfter,
            netGainPercent: pct(haulAfter - haulBefore),
            formationSelected: formStr,
            logLines
        };
    }

    // TWO-PHASE APPROACH FOR LARGE ALLOWANCES
    if (allowance > 11) {
        logLines.push(`🎯 Two-phase optimization (${allowance} transfers available)`);
        logLines.push(`  Phase 1: Maximize XI haul`);
        logLines.push(`  Phase 2: Maximize bench`);

        // Phase 1: Optimize for XI with most of the transfers
        const phase1Allowance = Math.max(11, allowance - 4); // Leave 4+ for bench
        const phase1Result = optimizeWithAllowance(currentSquad, bank, allCandidates, phase1Allowance);

        if (!phase1Result.transfers || phase1Result.transfers.length === 0) {
            // No beneficial transfers found, just optimize formation
            return phase1Result;
        }

        // Phase 1 squad (after XI optimizations)
        const phase1Squad = phase1Result.squadAfter;
        logLines.push(`📊 After Phase 1 (XI optimization): ${pct(phase1Result.haulAfter)}% XI haul`);

        // Phase 2: With remaining transfers, optimize bench
        const usedTransfers = phase1Result.transfers.length;
        const remainingTransfers = allowance - usedTransfers;

        if (remainingTransfers > 0) {
            logLines.push(`🪑 Phase 2: Optimizing bench with ${remainingTransfers} remaining transfers`);
            
            // Find bench players (positions 12-15 in phase1 lineup)
            const phase1Lineup = pickBestXI(phase1Squad, 0);
            const xiPlayerIds = new Set(phase1Lineup.starting11.map(p => p.player.id));
            const benchPlayers = phase1Squad.filter(p => !xiPlayerIds.has(p.player.id));
            
            // Calculate remaining budget after Phase 1 (not currently used)
            // phase1Squad.reduce((s, p) => s + p.cost, 0) + bank;
            
            // Try to upgrade bench with remaining transfers
            const phase2Squad = [...phase1Squad];
            const phase2Transfers: TransferDetail[] = [...phase1Result.transfers];
            
            // Greedily upgrade worst bench players
            for (let i = 0; i < Math.min(remainingTransfers, benchPlayers.length); i++) {
                const benchPlayer = benchPlayers[i];
                const type = benchPlayer.player.element_type;
                
                // Find best available replacement
                const candidates = allCandidates.filter(c =>
                    c.player.element_type === type &&
                    !xiPlayerIds.has(c.player.id) &&
                    !phase2Squad.some(p => p.player.id === c.player.id) &&
                    c.totalForecast > benchPlayer.totalForecast
                );
                
                if (candidates.length > 0) {
                    candidates.sort((a, b) => b.totalForecast - a.totalForecast);
                    const replacement = candidates[0];
                    
                    // Replace bench player
                    const idx = phase2Squad.findIndex(p => p.player.id === benchPlayer.player.id);
                    if (idx >= 0) {
                        phase2Squad[idx] = replacement;
                        phase2Transfers.push({
                            out: benchPlayer,
                            in: replacement,
                            haulBefore: benchPlayer.totalForecast,
                            haulAfter: replacement.totalForecast,
                            gainPercent: pct(replacement.totalForecast - benchPlayer.totalForecast),
                            costDiff: replacement.cost - benchPlayer.cost
                        });
                        logLines.push(`  Bench upgrade: ${benchPlayer.player.web_name} → ${replacement.player.web_name}`);
                    }
                }
            }
            
            const phase2Lineup = pickBestXI(phase2Squad, 0);
            const formStr = formatFormation(phase2Lineup.starting11);
            const haulAfter = squadXIHaul(phase2Squad);
            const netGainPercent = pct(haulAfter - haulBefore);
            
            logLines.push(`✅ Best formation: ${formStr}`);
            logLines.push(`📈 Final XI Haul: ${pct(haulAfter)}%  (was ${pct(haulBefore)}%, net gain: +${netGainPercent}%)`);
            
            return {
                lineup: phase2Lineup,
                squadAfter: phase2Squad,
                transfers: phase2Transfers,
                haulBefore,
                haulAfter,
                netGainPercent,
                formationSelected: formStr,
                logLines
            };
        }

        return phase1Result;
    }

    // SINGLE-PHASE FOR ALLOWANCE ≤ 11 — EXHAUSTIVE SEARCH
    // Consider all 15 squad members for exhaustive optimization
    const eligibleIndices = currentSquad.map((_, i) => i);
    const effectiveAllowance = Math.min(allowance, eligibleIndices.length);
    const comboCount = comb(eligibleIndices.length, effectiveAllowance);
    logLines.push(`🔍 Exhaustive search: ${comboCount} removal combinations (C(${eligibleIndices.length}, ${effectiveAllowance}))`);

    let bestHaul = -Infinity;
    let bestTransfers: TransferDetail[] = [];
    let bestSquad: PredictionResult[] = [...currentSquad];
    let combosEvaluated = 0;

    for (const combo of combinations(eligibleIndices.length, effectiveAllowance)) {
        // Map combo indices back to actual squad indices
        const removeIndices = combo.map(ci => eligibleIndices[ci]);
        const removedPlayers = removeIndices.map(i => currentSquad[i]);

        // Pool budget: bank + all sell prices
        const pooled = bank + removedPlayers.reduce((s, p) => s + p.cost, 0);

        // Retained squad = everyone not removed
        const removeSet = new Set(removeIndices);
        const retained = currentSquad.filter((_, i) => !removeSet.has(i));

        // Slots to fill (one per removed player, same position type)
        const slots = removedPlayers.map(p => ({ type: p.player.element_type }));

        // Fill all slots simultaneously with shared budget
        const { filled, success } = fillSlots(retained, slots, pooled, allCandidates);
        if (!success) continue;

        // Build trial squad and score it
        const trialSquad = [...retained, ...filled];
        const haul = squadXIHaul(trialSquad);

        if (haul > bestHaul) {
            bestHaul = haul;
            bestSquad = trialSquad;

            // Build transfer details (preserving original order)
            bestTransfers = removedPlayers.map((pOut, j) => {
                const pIn = filled[j];
                return {
                    out: pOut,
                    in: pIn,
                    haulBefore: pOut.totalForecast,
                    haulAfter: pIn.totalForecast,
                    gainPercent: pct(pIn.totalForecast - pOut.totalForecast),
                    costDiff: pIn.cost - pOut.cost
                };
            });
        }

        combosEvaluated++;
    }

    logLines.push(`📦 Evaluated ${combosEvaluated} valid combinations`);

    if (bestTransfers.length === 0 || bestHaul <= haulBefore) {
        logLines.push(`✅ No beneficial transfers found — current squad is optimal`);
        const lineup = pickBestXI(currentSquad, currentSquad.reduce((s, p) => s + p.cost, 0));
        const formStr = formatFormation(lineup.starting11);
        return {
            lineup, squadAfter: [...currentSquad], transfers: [],
            haulBefore, haulAfter: haulBefore,
            netGainPercent: 0,
            formationSelected: formStr,
            logLines
        };
    }

    // Log each transfer
    for (let i = 0; i < bestTransfers.length; i++) {
        const t = bestTransfers[i];
        const sign = t.costDiff >= 0 ? `-£${(t.costDiff / 10).toFixed(1)}m` : `+£${(Math.abs(t.costDiff) / 10).toFixed(1)}m`;
        logLines.push(
            `🔄 Transfer ${i + 1}: ${t.out.player.web_name} (${pct(t.haulBefore)}%) → ${t.in.player.web_name} (${pct(t.haulAfter)}%)  [cost: ${sign}]`
        );
    }

    const finalLineup = pickBestXI(bestSquad, bestSquad.reduce((s, p) => s + p.cost, 0));
    const formStr = formatFormation(finalLineup.starting11);
    const haulAfter = bestHaul;
    const netGainPercent = pct(haulAfter - haulBefore);

    logLines.push(`✅ Best formation: ${formStr}`);
    logLines.push(`📈 Final XI Haul: ${pct(haulAfter)}%  (was ${pct(haulBefore)}%, net gain: +${netGainPercent}%)`);

    return {
        lineup: finalLineup,
        squadAfter: bestSquad,
        transfers: bestTransfers,
        haulBefore,
        haulAfter,
        netGainPercent,
        formationSelected: formStr,
        logLines
    };
}
