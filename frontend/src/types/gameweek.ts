/**
 * Gameweek Data Contract Types
 * Ensures consistency between predictions data and optimization logic
 */

/**
 * Metadata about current and upcoming gameweeks
 * Prevents optimization against historical or blank weeks
 */
export interface PredictionMetadata {
    currentGW: number;          // GW currently being played (may have some results in)
    nextPlayGW: number;         // Next GW with fixtures to optimize for
    blankGWs: number[];         // GWs with <10 games (blanks)
    timestamp: string;          // When this metadata was generated
}

/**
 * A single projection (forecast) for a player in a specific gameweek
 * Enhanced with validation status
 */
export interface ValidatedProjection {
    gw: number;
    xP: number;
    prob_gt_6: number;
    prob_gt_10: number;
    f_atk: number;
    f_def: number;
    fixtures_in_gw: number;     // 2 = Double GW, 1 = Normal, 0 = Blank GW
    isBlank: boolean;           // Is this GW a blank week?
    isPast: boolean;            // Is this GW in the past?
}

/**
 * Normalized prediction for a player
 * Guarantees all projections are from nextPlayGW onward, blanks flagged
 */
export interface NormalizedPrediction {
    id: number;
    name: string;
    team: number;
    position: string;
    cost: number;
    prob_gt_6: number;
    prob_gt_6_next: number;
    projections: ValidatedProjection[];     // Re-indexed to start from nextPlayGW
    validProjectionCount: number;           // Count of non-blank projections
    hasOutdatedData?: boolean;              // True if projections start after nextPlayGW (shouldn't happen)
    validationWarnings: string[];           // Any data quality issues
}

/**
 * Haul calculation result with validation info
 */
export interface HaulCalculationResult {
    totalHaul: number;
    validWeeks: number[];
    skippedReasons: string[];
    isValid: boolean;                       // False if haul=0 due to blanks/historical
}

/**
 * Validation result for the entire candidate pool
 */
export interface CandidatePoolValidation {
    totalCandidates: number;
    validCandidates: number;
    filteredByBlank: number;
    filteredByZeroHaul: number;
    filteredByOutdatedData: number;
    warnings: string[];
}
