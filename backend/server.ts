import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from root .env
dotenv.config({ path: path.join(__dirname, '../.env') });

const app = express();
const PORT = process.env.ServerPort || 3000;

app.use(cors());
app.use(express.json());

// Routes will be imported here
const DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, '../data');

// Training Data Endpoint
app.get('/api/training-data', (req, res) => {
    const { position = 'MID', page = 1, pageSize = 50, search = '' } = req.query;
    const pos = String(position).toUpperCase();
    const query = String(search).toLowerCase();
    const filePath = path.join(DATA_DIR, 'processed', `dataset_${pos}.json`);

    try {
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: `Dataset for ${pos} not found` });
        }

        const rawData = fs.readFileSync(filePath, 'utf-8');
        let data = JSON.parse(rawData);

        // Filter by search query if provided
        if (query) {
            data = data.filter((item: any) =>
                item.name && item.name.toLowerCase().includes(query)
            );
        }

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
        console.error('Error serving training data:', err);
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
