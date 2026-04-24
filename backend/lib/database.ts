import { Pool, PoolClient } from 'pg';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create connection pool
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // For development/Render free tier, reduce pool size
    max: process.env.NODE_ENV === 'production' ? 20 : 5,
});

pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
});

/**
 * Initialize database schema
 * Creates tables if they don't exist
 */
export async function initializeDatabase() {
    const client = await pool.connect();
    try {
        console.log('Initializing database schema...');

        // Create predictions table
        await client.query(`
            CREATE TABLE IF NOT EXISTS predictions (
                id SERIAL PRIMARY KEY,
                player_id INTEGER NOT NULL UNIQUE,
                player_name VARCHAR(255) NOT NULL,
                team VARCHAR(255),
                position VARCHAR(10),
                data JSONB NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Create fixtures table
        await client.query(`
            CREATE TABLE IF NOT EXISTS fixtures (
                id SERIAL PRIMARY KEY,
                fixture_id INTEGER UNIQUE,
                event INTEGER,
                home_team VARCHAR(255),
                away_team VARCHAR(255),
                data JSONB NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Create league_analysis table
        await client.query(`
            CREATE TABLE IF NOT EXISTS league_analysis (
                id SERIAL PRIMARY KEY,
                data JSONB NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Create feature_importance table
        await client.query(`
            CREATE TABLE IF NOT EXISTS feature_importance (
                id SERIAL PRIMARY KEY,
                data JSONB NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Create indices for common queries
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_predictions_player_id ON predictions(player_id);
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_fixtures_event ON fixtures(event);
        `);

        console.log('✓ Database schema initialized successfully');
    } catch (err) {
        console.error('Failed to initialize database schema:', err);
        throw err;
    } finally {
        client.release();
    }
}

/**
 * Seed initial data from JSON files (one-time operation)
 */
export async function seedInitialData(dataDir: string) {
    const client = await pool.connect();
    try {
        console.log('Checking if data needs to be seeded...');

        // Check if predictions table already has data
        const result = await client.query('SELECT COUNT(*) FROM predictions');
        const count = parseInt(result.rows[0].count, 10);

        if (count > 0) {
            console.log(`✓ Database already has ${count} predictions, skipping seed`);
            return;
        }

        console.log('Seeding initial data from JSON files...');

        // Seed predictions
        const predictionsPath = path.join(dataDir, 'ai_predictions.json');
        if (fs.existsSync(predictionsPath)) {
            const predictions = JSON.parse(fs.readFileSync(predictionsPath, 'utf-8'));
            for (const pred of predictions) {
                await client.query(
                    `INSERT INTO predictions (player_id, player_name, team, position, data) 
                     VALUES ($1, $2, $3, $4, $5)
                     ON CONFLICT (player_id) DO UPDATE SET data = EXCLUDED.data, updated_at = CURRENT_TIMESTAMP`,
                    [pred.player_id, pred.player_name, pred.team, pred.position, JSON.stringify(pred)]
                );
            }
            console.log(`✓ Seeded ${predictions.length} predictions`);
        }

        // Seed fixtures
        const fixturesPath = path.join(dataDir, 'fixtures.json');
        if (fs.existsSync(fixturesPath)) {
            const fixtures = JSON.parse(fs.readFileSync(fixturesPath, 'utf-8'));
            for (const fixture of fixtures) {
                await client.query(
                    `INSERT INTO fixtures (fixture_id, event, home_team, away_team, data) 
                     VALUES ($1, $2, $3, $4, $5)
                     ON CONFLICT (fixture_id) DO UPDATE SET data = EXCLUDED.data, updated_at = CURRENT_TIMESTAMP`,
                    [fixture.id, fixture.event, fixture.home_team, fixture.away_team, JSON.stringify(fixture)]
                );
            }
            console.log(`✓ Seeded ${fixtures.length} fixtures`);
        }

        // Seed league_analysis
        const leagueAnalysisPath = path.join(dataDir, 'league_analysis.json');
        if (fs.existsSync(leagueAnalysisPath)) {
            const leagueAnalysis = JSON.parse(fs.readFileSync(leagueAnalysisPath, 'utf-8'));
            await client.query(
                `INSERT INTO league_analysis (data) VALUES ($1)
                 ON CONFLICT DO NOTHING`,
                [JSON.stringify(leagueAnalysis)]
            );
            console.log('✓ Seeded league analysis');
        }

        // Seed feature_importance
        const featureImportancePath = path.join(dataDir, 'feature_importance.json');
        if (fs.existsSync(featureImportancePath)) {
            const featureImportance = JSON.parse(fs.readFileSync(featureImportancePath, 'utf-8'));
            await client.query(
                `INSERT INTO feature_importance (data) VALUES ($1)
                 ON CONFLICT DO NOTHING`,
                [JSON.stringify(featureImportance)]
            );
            console.log('✓ Seeded feature importance');
        }
    } catch (err) {
        console.error('Failed to seed initial data:', err);
        throw err;
    } finally {
        client.release();
    }
}

/**
 * Get predictions from database
 */
export async function getPredictions() {
    const client = await pool.connect();
    try {
        const result = await client.query('SELECT data FROM predictions ORDER BY id');
        return result.rows.map(row => row.data);
    } finally {
        client.release();
    }
}

/**
 * Get fixtures from database
 */
export async function getFixtures() {
    const client = await pool.connect();
    try {
        const result = await client.query('SELECT data FROM fixtures ORDER BY event, id');
        return result.rows.map(row => row.data);
    } finally {
        client.release();
    }
}

/**
 * Get league analysis from database
 */
export async function getLeagueAnalysis() {
    const client = await pool.connect();
    try {
        const result = await client.query('SELECT data FROM league_analysis ORDER BY updated_at DESC LIMIT 1');
        return result.rows.length > 0 ? result.rows[0].data : null;
    } finally {
        client.release();
    }
}

/**
 * Get feature importance from database
 */
export async function getFeatureImportance() {
    const client = await pool.connect();
    try {
        const result = await client.query('SELECT data FROM feature_importance ORDER BY updated_at DESC LIMIT 1');
        return result.rows.length > 0 ? result.rows[0].data : null;
    } finally {
        client.release();
    }
}

/**
 * Ingest/update predictions data
 */
export async function ingestPredictions(predictions: any[]) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        // Delete old predictions
        await client.query('DELETE FROM predictions');
        
        // Insert new predictions
        for (const pred of predictions) {
            await client.query(
                `INSERT INTO predictions (player_id, player_name, team, position, data) 
                 VALUES ($1, $2, $3, $4, $5)`,
                [pred.player_id, pred.player_name, pred.team, pred.position, JSON.stringify(pred)]
            );
        }
        
        await client.query('COMMIT');
        console.log(`✓ Ingested ${predictions.length} predictions`);
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

/**
 * Ingest/update fixtures data
 */
export async function ingestFixtures(fixtures: any[]) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        // Delete old fixtures
        await client.query('DELETE FROM fixtures');
        
        // Insert new fixtures
        for (const fixture of fixtures) {
            await client.query(
                `INSERT INTO fixtures (fixture_id, event, home_team, away_team, data) 
                 VALUES ($1, $2, $3, $4, $5)`,
                [fixture.id, fixture.event, fixture.home_team, fixture.away_team, JSON.stringify(fixture)]
            );
        }
        
        await client.query('COMMIT');
        console.log(`✓ Ingested ${fixtures.length} fixtures`);
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

/**
 * Ingest league analysis
 */
export async function ingestLeagueAnalysis(data: any) {
    const client = await pool.connect();
    try {
        await client.query(
            `DELETE FROM league_analysis;
             INSERT INTO league_analysis (data) VALUES ($1)`,
            [JSON.stringify(data)]
        );
        console.log('✓ Ingested league analysis');
    } finally {
        client.release();
    }
}

/**
 * Ingest feature importance
 */
export async function ingestFeatureImportance(data: any) {
    const client = await pool.connect();
    try {
        await client.query(
            `DELETE FROM feature_importance;
             INSERT INTO feature_importance (data) VALUES ($1)`,
            [JSON.stringify(data)]
        );
        console.log('✓ Ingested feature importance');
    } finally {
        client.release();
    }
}

export { pool };
