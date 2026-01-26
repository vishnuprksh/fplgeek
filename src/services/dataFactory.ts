import { firestoreService } from './firestoreService';
import { sqliteProvider } from './sqliteService';
import type { IDataProvider } from './dataProvider';

const USE_LOCAL_DB = import.meta.env.VITE_USE_LOCAL_DB === 'true';

export function getDataProvider(): IDataProvider {
    if (USE_LOCAL_DB) {
        console.log("Using Local SQLite Provider");
        return sqliteProvider;
    }
    return firestoreService;
}
