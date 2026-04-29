import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { exec } from 'child_process';
import {
    initializeDatabase,
    seedInitialData,
    getPredictions,
    getFixtures,
    getLeagueAnalysis,
    getFeatureImportance,
    ingestPredictions,
    ingestFixtures,
    ingestLeagueAnalysis,
    ingestFeatureImportance
} from './lib/database.js';
import { handleIngestData } from './lib/ingestData.js';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from root .env or environment
dotenv.config({ path: path.join(__dirname, '../.env') });

const app = express();
const PORT = process.env.PORT || process.env.ServerPort || 3000;

app.use(cors());
app.use(express.json());

const DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, '../data');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    console.log(`Creating data directory at ${DATA_DIR}`);
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'fpl.sqlite');

// Check if database exists, if not maybe we need to seed it or log error
if (!fs.existsSync(DB_PATH)) {
    console.warn(`Database not found at ${DB_PATH}. Backend might fail until data is ingested.`);
}

const db = new Database(DB_PATH);

// Initialize Postgres on startup (if DATABASE_URL is configured)
async function initializeApp() {
    if (process.env.DATABASE_URL) {
        try {
            await initializeDatabase();
            await seedInitialData(DATA_DIR);
            console.log('✓ Postgres database initialized and seeded');
        } catch (err) {
            console.error('Warning: Failed to initialize Postgres database:', err);
            console.log('Continuing with file-based fallback...');
        }
    } else {
        console.log('ℹ DATABASE_URL not configured. Using file-based data (local development).');
    }
}

// Training Data Endpoint
app.get('/api/training-data', (req, res) => {
    const { position = 'MID', page = 1, pageSize = 50, search = '' } = req.query;
    const pos = String(position).toUpperCase();
    const query = String(search).toLowerCase();

    try {
        let sql = `SELECT gw, season, metadata, target_class FROM preprocessed_data WHERE position = ?`;
        let params: any[] = [pos];

        if (query) {
            sql += ` AND metadata LIKE ?`;
            params.push(`%${query}%`);
        }

        const allRows = db.prepare(sql).all(...params);

        const data = allRows.map((row: any) => {
            const meta = JSON.parse(row.metadata);
            return {
                ...meta,
                gw: row.gw,
                season: row.season,
                target: row.target_class, // Display bucketized target
                is_future: meta.is_future ?? false
            };
        });

        const start = (Number(page) - 1) * Number(pageSize);
        const end = start + Number(pageSize);
        const paginatedData = data.slice(start, end);

        res.json({
            data: paginatedData,
            total: data.length,
            page: Number(page),
            pageSize: Number(pageSize),
            totalPages: Math.ceil(data.length / Number(pageSize))
        });
    } catch (err) {
        console.error('Error serving training data from DB:', err);
        res.status(500).json({ error: 'Failed to load training data' });
    }
});


// Serve the shared data/ directory (SQLite DB, JSON predictions, models)
// DATA_DIR env var defaults to ../data relative to this file (repo root data/)
app.use('/data', express.static(DATA_DIR));

// Gameweek Context Endpoint
// Provides metadata: current GW, next playable GW, blank GWs for frontend validation
app.get('/api/gameweek-context', (req, res) => {
    try {
        // Load fixtures to determine gameweek status
        const fixturesPath = path.join(DATA_DIR, 'fixtures.json');
        if (!fs.existsSync(fixturesPath)) {
            return res.status(404).json({ error: 'Fixtures data not found' });
        }

        const fixtures = JSON.parse(fs.readFileSync(fixturesPath, 'utf-8'));
        
        // Count games per GW and check finish status
        const gwStats = new Map<number, { finished: number; total: number }>();
        
        for (const fixture of fixtures) {
            if (!fixture.event) continue;
            const gw = fixture.event;
            
            if (!gwStats.has(gw)) {
                gwStats.set(gw, { finished: 0, total: 0 });
            }
            
            const stats = gwStats.get(gw)!;
            stats.total++;
            if (fixture.finished) stats.finished++;
        }

        // Determine current and next GW
        let currentGW = 1; // default
        let nextPlayGW = 1; // default
        const blankGWs: number[] = [];

        // Sort GWs numerically
        const sortedGWs = Array.from(gwStats.entries()).sort((a, b) => a[0] - b[0]);

        for (const [gw, stats] of sortedGWs) {
            // Blank week = fewer than 10 games
            if (stats.total < 10) {
                blankGWs.push(gw);
            }
        }

        // Current GW = highest GW that has at least 1 finished fixture
        for (const [gw, stats] of [...sortedGWs].reverse()) {
            if (stats.finished > 0) {
                currentGW = gw;
                break;
            }
        }

        // Next playable GW = first GW after currentGW with 0 finished games and > 0 total
        for (const [gw, stats] of sortedGWs) {
            if (gw > currentGW && stats.finished === 0 && stats.total > 0) {
                nextPlayGW = gw;
                break;
            }
        }
        // Fallback: if no unplayed GW found after current, use currentGW + 1
        if (nextPlayGW === 1) {
            nextPlayGW = currentGW + 1;
        }

        res.json({
            currentGW,
            nextPlayGW,
            blankGWs: blankGWs.sort((a, b) => a - b),
            timestamp: new Date().toISOString()
        });
    } catch (err) {
        console.error('Error computing gameweek context:', err);
        res.status(500).json({ error: 'Failed to compute gameweek context' });
    }
});

// Data API Endpoints - Serve JSON data files
// These endpoints provide single source of truth for frontend data
// All data is stored in /data folder and processed by backend scripts

// GET /api/data/predictions - Serve AI predictions
app.get('/api/data/predictions', async (req: Request, res: Response) => {
    try {
        // Try Postgres first if configured
        if (process.env.DATABASE_URL) {
            const data = await getPredictions();
            return res.json(data);
        }
        
        // Fallback to file-based read
        const filePath = path.join(DATA_DIR, 'ai_predictions.json');
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'Predictions data not found' });
        }
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        res.json(data);
    } catch (err) {
        console.error('Error serving predictions:', err);
        res.status(500).json({ error: 'Failed to load predictions' });
    }
});

// GET /api/data/fixtures - Serve fixture data
app.get('/api/data/fixtures', async (req: Request, res: Response) => {
    try {
        // Try Postgres first if configured
        if (process.env.DATABASE_URL) {
            const data = await getFixtures();
            return res.json(data);
        }
        
        // Fallback to file-based read
        const filePath = path.join(DATA_DIR, 'fixtures.json');
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'Fixtures data not found' });
        }
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        res.json(data);
    } catch (err) {
        console.error('Error serving fixtures:', err);
        res.status(500).json({ error: 'Failed to load fixtures' });
    }
});

// GET /api/data/league-analysis - Serve league analysis
app.get('/api/data/league-analysis', async (req: Request, res: Response) => {
    try {
        // Try Postgres first if configured
        if (process.env.DATABASE_URL) {
            const data = await getLeagueAnalysis();
            if (!data) {
                return res.status(404).json({ error: 'League analysis data not found' });
            }
            return res.json(data);
        }
        
        // Fallback to file-based read
        const filePath = path.join(DATA_DIR, 'league_analysis.json');
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'League analysis data not found' });
        }
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        res.json(data);
    } catch (err) {
        console.error('Error serving league analysis:', err);
        res.status(500).json({ error: 'Failed to load league analysis' });
    }
});

// GET /api/data/feature-importance - Serve feature importance analysis
app.get('/api/data/feature-importance', async (req: Request, res: Response) => {
    try {
        // Try Postgres first if configured
        if (process.env.DATABASE_URL) {
            const data = await getFeatureImportance();
            if (!data) {
                return res.status(404).json({ error: 'Feature importance data not found' });
            }
            return res.json(data);
        }
        
        // Fallback to file-based read
        const filePath = path.join(DATA_DIR, 'feature_importance.json');
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'Feature importance data not found' });
        }
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        res.json(data);
    } catch (err) {
        console.error('Error serving feature importance:', err);
        res.status(500).json({ error: 'Failed to load feature importance' });
    }
});

// GET /api/data/:filename - Generic data file handler (with security check)
// Allowed files: ai_predictions.json, fixtures.json, league_analysis.json, feature_importance.json, fpl.sqlite
app.get('/api/data/:filename', (req, res) => {
    const allowedFiles = ['ai_predictions.json', 'fixtures.json', 'league_analysis.json', 'feature_importance.json', 'fpl.sqlite'];
    const { filename } = req.params;
    
    if (!allowedFiles.includes(filename)) {
        return res.status(403).json({ error: 'File not allowed' });
    }
    
    const filePath = path.join(DATA_DIR, filename);
    
    try {
        // Prevent directory traversal
        if (!path.resolve(filePath).startsWith(path.resolve(DATA_DIR))) {
            return res.status(403).json({ error: 'Invalid path' });
        }
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'File not found' });
        }
        
        // For JSON files, parse and serve as JSON
        if (filename.endsWith('.json')) {
            const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            res.json(data);
        } else {
            // For binary files (sqlite), serve as-is
            res.sendFile(filePath);
        }
    } catch (err) {
        console.error(`Error serving file ${filename}:`, err);
        res.status(500).json({ error: 'Failed to load file' });
    }
});

// POST /api/ingest-data - Ingest data from GitHub Actions or manual updates
// Accepts JSON body with predictions, fixtures, league_analysis, feature_importance
app.post('/api/ingest-data', handleIngestData);

// Track update status
let updateInProgress = false;
let lastUpdateTime = new Date(0);

// Data Update Endpoint - Triggers complete data pipeline
// POST /api/update-data
app.post('/api/update-data', (req, res) => {
    if (updateInProgress) {
        return res.status(400).json({ 
            error: 'Update already in progress',
            status: 'updating'
        });
    }
    
    const repoRoot = path.resolve(__dirname, '..');
    const updateScript = path.join(repoRoot, 'scripts', 'update_data.sh');
    
    if (!fs.existsSync(updateScript)) {
        return res.status(404).json({ error: 'Update script not found' });
    }
    
    console.log('🚀 Starting data update pipeline...');
    updateInProgress = true;
    
    // Execute update script in background
    exec(`bash ${updateScript}`, 
        { 
            cwd: repoRoot, 
            maxBuffer: 50 * 1024 * 1024,
            timeout: 30 * 60 * 1000 // 30 minute timeout
        },
        (error, stdout, stderr) => {
            updateInProgress = false;
            if (error) {
                console.error('❌ Update pipeline failed:', error.message);
                if (stderr) console.error('stderr:', stderr);
            } else {
                lastUpdateTime = new Date();
                console.log('✅ Update pipeline completed successfully!');
                console.log('stdout:', stdout);
            }
        }
    );
    
    // Return immediately with status that update is in progress
    res.json({
        status: 'started',
        message: 'Data update pipeline initiated. This may take 5-15 minutes.',
        timestamp: new Date().toISOString()
    });
});

// Update Status Endpoint - Check if data has been updated
// GET /api/update-status
app.get('/api/update-status', (req, res) => {
    const predictionsPath = path.join(DATA_DIR, 'ai_predictions.json');
    const fixturesPath = path.join(DATA_DIR, 'fixtures.json');
    
    try {
        let allFilesExist = fs.existsSync(predictionsPath) && fs.existsSync(fixturesPath);
        let predictionsModified = 0;
        let fixturesModified = 0;
        
        if (allFilesExist) {
            const predStats = fs.statSync(predictionsPath);
            const fixtStats = fs.statSync(fixturesPath);
            predictionsModified = predStats.mtimeMs;
            fixturesModified = fixtStats.mtimeMs;
        }
        
        const mostRecentModification = Math.max(predictionsModified, fixturesModified);
        
        res.json({
            isUpdating: updateInProgress,
            status: updateInProgress ? 'updating' : 'idle',
            lastUpdateTime: new Date(mostRecentModification).toISOString(),
            dataExists: allFilesExist,
            predictionsUpdated: new Date(predictionsModified).toISOString(),
            fixturesUpdated: new Date(fixturesModified).toISOString()
        });
    } catch (err) {
        console.error('Error checking update status:', err);
        res.status(500).json({ error: 'Failed to check update status' });
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', version: '1.0.0', timestamp: new Date().toISOString() });
});

// Start server
async function startServer() {
    try {
        await initializeApp();
        app.listen(PORT, () => {
            console.log(`🚀 Server running on port ${PORT}`);
        });
    } catch (err) {
        console.error('Failed to start server:', err);
        process.exit(1);
    }
}

startServer();
