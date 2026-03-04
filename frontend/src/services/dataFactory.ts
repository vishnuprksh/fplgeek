import { sqliteProvider } from './sqliteService';
import type { IDataProvider } from './dataProvider';

export function getDataProvider(): IDataProvider {
    console.log("Using Local SQLite Provider");
    return sqliteProvider;
}
