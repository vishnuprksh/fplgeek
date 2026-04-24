import { Request, Response } from 'express';
import {
    ingestPredictions,
    ingestFixtures,
    ingestLeagueAnalysis,
    ingestFeatureImportance
} from './database.js';

/**
 * Handle data ingestion from GitHub Actions or manual updates
 * Expects JSON body with optional data fields:
 * {
 *   predictions: [...],
 *   fixtures: [...],
 *   league_analysis: {...},
 *   feature_importance: {...}
 * }
 */
export async function handleIngestData(req: Request, res: Response) {
    try {
        const { predictions, fixtures, league_analysis, feature_importance } = req.body;

        if (!predictions && !fixtures && !league_analysis && !feature_importance) {
            return res.status(400).json({
                error: 'At least one data field must be provided (predictions, fixtures, league_analysis, or feature_importance)'
            });
        }

        const startTime = Date.now();
        const results = [];

        try {
            if (predictions && Array.isArray(predictions)) {
                await ingestPredictions(predictions);
                results.push(`Ingested ${predictions.length} predictions`);
            }

            if (fixtures && Array.isArray(fixtures)) {
                await ingestFixtures(fixtures);
                results.push(`Ingested ${fixtures.length} fixtures`);
            }

            if (league_analysis) {
                await ingestLeagueAnalysis(league_analysis);
                results.push('Ingested league analysis');
            }

            if (feature_importance) {
                await ingestFeatureImportance(feature_importance);
                results.push('Ingested feature importance');
            }

            const duration = Date.now() - startTime;

            res.status(200).json({
                success: true,
                message: 'Data ingestion completed successfully',
                results,
                duration_ms: duration,
                timestamp: new Date().toISOString()
            });

            console.log(`✓ Data ingestion completed in ${duration}ms`);
        } catch (err) {
            console.error('Error during data ingestion:', err);
            res.status(500).json({
                error: 'Data ingestion failed',
                details: err instanceof Error ? err.message : 'Unknown error'
            });
        }
    } catch (err) {
        console.error('Error parsing request:', err);
        res.status(400).json({
            error: 'Invalid request body'
        });
    }
}
