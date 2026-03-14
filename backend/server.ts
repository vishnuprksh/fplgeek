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

// Load environment variables from root .env
dotenv.config({ path: path.join(__dirname, '../.env') });

const app = express();
const PORT = process.env.ServerPort || 3000;

app.use(cors());
app.use(express.json());

const DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, '../data');
const DB_PATH = path.join(DATA_DIR, 'fpl.sqlite');
const db = new Database(DB_PATH);

// Training Data Endpoint
app.get('/api/training-data', (req, res) => {
    const { position = 'MID', page = 1, pageSize = 50, search = '' } = req.query;
    const pos = String(position).toUpperCase();
    const query = String(search).toLowerCase();

    try {
        let sql = `SELECT metadata, target_class FROM preprocessed_data WHERE position = ?`;
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

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', version: '1.0.0' });
});


app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
