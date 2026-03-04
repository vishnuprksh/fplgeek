import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
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
import reportRoutes from './ai/report.js';
import chatRoutes from './ai/chat.js';
import analysisRoutes from './ai/teamAnalysis.js';
import suggestionRoutes from './ai/suggestions.js';

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', version: '1.0.0' });
});

// Mount AI routes
app.use('/report', reportRoutes);
app.use('/chat', chatRoutes);
app.use('/analysis', analysisRoutes);
app.use('/suggestions', suggestionRoutes);

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log('Environment:', {
        GOOGLE_API_KEY_SET: !!process.env.GOOGLE_API_KEY
    });
});
