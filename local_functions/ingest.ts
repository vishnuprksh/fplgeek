import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const { ingestData } = require("./ingestLogic.ts");
const { SqliteRepository } = require("./sqliteRepository.ts");

console.log("DEBUG: Imports loaded", { ingestData: typeof ingestData, SqliteRepository: typeof SqliteRepository });
import path from "path";
import fs from "fs";

// Simple Logger Implementation
const logger = {
    info: (msg: string, ...args: any[]) => console.log(`[INFO] ${msg}`, ...args),
    error: (msg: string, ...args: any[]) => console.error(`[ERROR] ${msg}`, ...args),
    warn: (msg: string, ...args: any[]) => console.warn(`[WARN] ${msg}`, ...args),
};

async function main() {
    console.log("🚀 Starting Local Ingestion...");

    const dataDir = path.resolve(process.cwd(), "public/data");
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }

    const dbPath = path.join(dataDir, "fpl.sqlite");
    console.log(`📂 Database Path: ${dbPath}`);

    const repo = new SqliteRepository(dbPath);

    try {
        await ingestData(repo, logger);
        console.log("✅ Local Ingestion Successful!");
    } catch (error) {
        console.error("❌ Ingestion Failed:", error);
        process.exit(1);
    }
}

main();
