/**
 * Gameweek Validation Utilities
 * Helper functions for working with predictions and gameweeks
 */

import type { PredictionMetadata, ValidatedProjection, NormalizedPrediction, HaulCalculationResult, CandidatePoolValidation } from '../types/gameweek';

/**
 * Check if a gameweek is blank (fewer than 10 games)
 */
export function isBlankGW(gw: number, blankGWs: number[]): boolean {
    return blankGWs.includes(gw);
}

/**
 * Check if a gameweek is in the past
 */
export function isPastGW(gw: number, nextPlayGW: number): boolean {
    return gw < nextPlayGW;
}

/**
 * Validate a single projection
 */
export function validateProjection(
    proj: any,
    nextPlayGW: number,
    blankGWs: number[]
): ValidatedProjection {
    return {
        gw: proj.gw,
        xP: proj.xP || 0,
        prob_gt_6: proj.prob_gt_6 || 0,
        prob_gt_10: proj.prob_gt_10 || 0,
        f_atk: proj.f_atk || 0,
        f_def: proj.f_def || 0,
        isBlank: isBlankGW(proj.gw, blankGWs),
        isPast: isPastGW(proj.gw, nextPlayGW),
    };
}

/**
 * Normalize predictions to start from nextPlayGW
 * Filters out past gameweeks and flags blanks
 */
export function normalizePrediction(
    player: any,
    metadata: PredictionMetadata
): NormalizedPrediction {
    const { nextPlayGW, blankGWs } = metadata;
    
    // Validate and filter projections
    const validatedProjs = (player.projections || []).map((proj: any) =>
        validateProjection(proj, nextPlayGW, blankGWs)
    );

    // Filter to only include gameweeks >= nextPlayGW
    const normalizedProjs = validatedProjs.filter((proj: ValidatedProjection) => proj.gw >= nextPlayGW);

    const validProjectionCount = normalizedProjs.filter((proj: ValidatedProjection) => !proj.isBlank).length;
    
    const warnings: string[] = [];
    
    // Check for data quality issues
    if (normalizedProjs.length === 0) {
        warnings.push(`No projections from GW ${nextPlayGW} onward`);
    }
    
    if (normalizedProjs.length < validatedProjs.length) {
        const skipped = validatedProjs.length - normalizedProjs.length;
        warnings.push(`${skipped} past projections removed`);
    }

    if (validProjectionCount === 0 && normalizedProjs.length > 0) {
        warnings.push('All normalized projections are blank weeks');
    }

    return {
        id: player.id,
        name: player.name,
        team: player.team,
        position: player.position,
        cost: player.now_cost,
        prob_gt_6: player.prob_gt_6 || 0,
        prob_gt_6_next: player.prob_gt_6_next || 0,
        projections: normalizedProjs,
        validProjectionCount,
        validationWarnings: warnings,
    };
}

/**
 * Calculate haul with gameweek validation
 * Returns 0 with warnings if all selected weeks are blank/past
 */
export function calculateValidatedHaul(
    player: NormalizedPrediction,
    selectedWeeks: number[],
    metadata: PredictionMetadata
): HaulCalculationResult {
    const { blankGWs } = metadata;
    const skippedReasons: string[] = [];
    const validWeeks: number[] = [];
    let sum = 0;

    for (const week of selectedWeeks) {
        // Find projection for this week
        const proj = player.projections.find(p => p.gw === week);

        if (!proj) {
            skippedReasons.push(`GW ${week} not in projections`);
            continue;
        }

        // Note blank weeks but still include their per-player projection.
        // A "blank GW" has fewer fixtures overall, but individual players who
        // DO have a game will have non-zero prob_gt_6, and those without a
        // fixture will already have prob_gt_6 = 0 in the data.
        if (isBlankGW(week, blankGWs)) {
            skippedReasons.push(`GW ${week} is a blank week (reduced fixtures)`);
        }

        sum += proj.prob_gt_6;
        validWeeks.push(week);
    }

    const totalHaul = validWeeks.length > 0 ? sum / validWeeks.length : 0;
    const isValid = validWeeks.length > 0 && totalHaul > 0;

    return {
        totalHaul,
        validWeeks,
        skippedReasons,
        isValid,
    };
}

/**
 * Validate candidate pool before filtering
 */
export function validateCandidatePool(
    candidates: NormalizedPrediction[],
    selectedWeeks: number[],
    metadata: PredictionMetadata
): CandidatePoolValidation {
    let validCount = 0;
    let blankCount = 0;
    let zeroHaulCount = 0;
    let outdatedCount = 0;

    for (const candidate of candidates) {
        if (candidate.validationWarnings.length > 0) {
            outdatedCount++;
            continue;
        }

        const haulResult = calculateValidatedHaul(candidate, selectedWeeks, metadata);

        if (haulResult.skippedReasons.some(r => r.includes('is blank'))) {
            blankCount++;
        } else if (haulResult.totalHaul === 0) {
            zeroHaulCount++;
        } else {
            validCount++;
        }
    }

    const warnings: string[] = [];
    if (validCount < 100) {
        warnings.push(`⚠️ Only ${validCount} valid candidates (need 50+ for good optimization)`);
    }
    if (outdatedCount > 0) {
        warnings.push(`⚠️ ${outdatedCount} players have outdated/missing projections`);
    }

    return {
        totalCandidates: candidates.length,
        validCandidates: validCount,
        filteredByBlank: blankCount,
        filteredByZeroHaul: zeroHaulCount,
        filteredByOutdatedData: outdatedCount,
        warnings,
    };
}

/**
 * Convert selected haul window to gameweeks
 * Returns the specific gameweeks to optimize for
 */
export function getSelectedGameweeks(
    weeks: number,
    metadata: PredictionMetadata
): number[] {
    const { nextPlayGW } = metadata;
    const selected: number[] = [];

    // Return the next `weeks` sequential GWs starting from nextPlayGW.
    // Blank GWs are intentionally included here so that the explicit GW
    // selection ("GW 34", "GW 35"…) reflects the real calendar week.
    // calculateValidatedHaul will then correctly score blank weeks as 0.
    for (let i = 0; i < weeks; i++) {
        const gw = nextPlayGW + i;
        if (gw > 38) break;
        selected.push(gw);
    }

    return selected;
}
