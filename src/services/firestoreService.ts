import { db } from '../lib/firebase';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import type { BootstrapStatic, Team, Event, ElementType, UnifiedPlayer } from '../types/fpl';

import type { IDataProvider } from './dataProvider';

export const firestoreService: IDataProvider = {
    async getPlayers(): Promise<UnifiedPlayer[]> {
        const snapshot = await getDocs(collection(db, 'master_players'));
        return snapshot.docs.map(d => d.data() as UnifiedPlayer);
    },

    async getTeams(): Promise<Team[]> {
        const docSnap = await getDoc(doc(db, 'static', 'teams'));
        if (docSnap.exists()) {
            return (docSnap.data().data as Team[]);
        }
        return [];
    },

    async getEvents(): Promise<Event[]> {
        const docSnap = await getDoc(doc(db, 'static', 'events'));
        if (docSnap.exists()) {
            return (docSnap.data().data as Event[]);
        }
        return [];
    },

    async getElementTypes(): Promise<ElementType[]> {
        const docSnap = await getDoc(doc(db, 'static', 'element_types'));
        if (docSnap.exists()) {
            return (docSnap.data().data as ElementType[]);
        }
        return [];
    },

    async getBootstrapStatic(): Promise<BootstrapStatic> {
        const [elements, teams, events, element_types] = await Promise.all([
            this.getPlayers(),
            this.getTeams(),
            this.getEvents(),
            this.getElementTypes()
        ]);

        return {
            elements,
            teams,
            events,
            element_types
        };
    },

    async getPredictions(): Promise<any[]> {
        const snapshot = await getDocs(collection(db, 'predictions'));
        return snapshot.docs.map(d => d.data());
    },

    async getBacktestHistory(): Promise<any[]> {
        // Not implemented for firestore yet
        return [];
    }
};
