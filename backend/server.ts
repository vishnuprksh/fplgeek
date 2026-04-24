import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
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
        let currentGW = 33; // default
        let nextPlayGW = 34; // default
        const blankGWs: number[] = [];

        for (const [gw, stats] of gwStats) {
            // Blank week = fewer than 10 games
            if (stats.total < 10) {
                blankGWs.push(gw);
            }
            
            // Current GW = one with some but not all games finished
            if (stats.finished > 0 && stats.finished < stats.total) {
                currentGW = gw;
            }
        }

        // Next playable GW = first with 0 finished games
        for (const [gw, stats] of Array.from(gwStats.entries()).sort((a, b) => a[0] - b[0])) {
            if (stats.finished === 0 && stats.total > 0) {
                nextPlayGW = gw;
                break;
            }
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
app.get('/api/data/predictions', (req, res) => {
    const filePath = path.join(DATA_DIR, 'ai_predictions.json');
    try {
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
app.get('/api/data/fixtures', (req, res) => {
    const filePath = path.join(DATA_DIR, 'fixtures.json');
    try {
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
app.get('/api/data/league-analysis', (req, res) => {
    const filePath = path.join(DATA_DIR, 'league_analysis.json');
    try {
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
app.get('/api/data/feature-importance', (req, res) => {
    const filePath = path.join(DATA_DIR, 'feature_importance.json');
    try {
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

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', version: '1.0.0' });
});


app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
