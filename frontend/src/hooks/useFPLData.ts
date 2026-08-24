import { useState, useEffect, useCallback } from 'react';
import { fplService } from '../services/fpl';
import type { TeamEntry, BootstrapStatic, TeamPicks, Match } from '../types/fpl';
import type { PredictionMetadata } from '../types/gameweek';
import { dataApi } from '../services/dataApi';

export type T100OwnershipMap = Record<number, number>;
export type AIPredictionMap = Record<number, any>;

export const useFPLData = () => {
    const [staticData, setStaticData] = useState<BootstrapStatic | null>(null);
    const [fixtures, setFixtures] = useState<Match[]>([]);
    const [t100OwnershipMap, setT100OwnershipMap] = useState<T100OwnershipMap>({});
    const [gameweekMetadata, setGameweekMetadata] = useState<PredictionMetadata | null>(null);
    const [aiPredictionMap, setAiPredictionMap] = useState<AIPredictionMap>({});

    const [teamData, setTeamData] = useState<TeamEntry | null>(null);
    const [picksData, setPicksData] = useState<TeamPicks | null>(null);
    const [transfersHistory, setTransfersHistory] = useState<any[]>([]);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // 1. Load Globals on Mount
    useEffect(() => {
        const loadGlobals = async () => {
            console.log("🔄 loadGlobals starting...");
            try {
                // Parallel fetch for static data, fixtures, and gameweek metadata
                const [bootstrap, matches, gwMetadata] = await Promise.all([
                    fplService.getBootstrapStatic(),
                    fplService.getFixtures(),
                    // Optional analytics should not block core FPL data.
                    dataApi.getGameweekContext().catch(err => {
                        console.warn('⚠️ Could not fetch gameweek context:', err);
                        return null;
                    })
                ]);

                console.log("✅ Bootstrap fetched with", bootstrap?.elements?.length, "elements");
                console.log("✅ Fixtures fetched:", matches?.length);
                console.log("✅ Gameweek metadata:", gwMetadata);

                setStaticData(bootstrap);
                setFixtures(matches);
                if (gwMetadata) {
                    setGameweekMetadata(gwMetadata);
                }

                // Load T100 ownership from league analysis
                try {
                    const leagueData = await dataApi.getLeagueAnalysis();
                    const ownershipMap: T100OwnershipMap = {};
                    leagueData.flatMap(entry => entry.top_10).forEach(player => {
                        if (player.id !== undefined) ownershipMap[player.id] = player.percent || 0;
                    });
                    setT100OwnershipMap(ownershipMap);
                } catch (e) {
                    console.warn('⚠️ Could not load league analysis for T100 ownership', e);
                }

                // Load AI predictions
                try {
                    const predData = await dataApi.getPredictions();
                    const predMap: AIPredictionMap = {};
                    predData.forEach(p => { predMap[p.id] = p; });
                    setAiPredictionMap(predMap);
                    console.log('✅ AI predictions loaded:', predData.length, 'players');
                } catch (e) {
                    console.warn('⚠️ Could not load AI predictions', e);
                }

            } catch (e) {
                console.error("❌ Failed to load global FPL data", e);
                setError("Failed to load FPL database or fixtures.");
            }
        };

        loadGlobals();
    }, []);

    // 2. Load User Team
    const loadTeam = useCallback(async (id: number) => {
        if (!staticData) return; // Guard: need static data first
        if (!Number.isInteger(id) || id < 1 || id > 10_000_000) {
            setError('Enter a valid FPL team ID.');
            return;
        }

        setLoading(true);
        setError(null);
        setPicksData(null); // Reset prev picks
        setTeamData(null);

        try {
            const [data, history] = await Promise.all([
                fplService.getTeamDetails(id),
                fplService.getTransfers(id)
            ]);
            setTeamData(data);
            setTransfersHistory(history);

            if (data.current_event) {
                const picks = await fplService.getTeamPicks(id, data.current_event);
                setPicksData(picks);
            }
        } catch (err) {
            console.error(err);
            setError('Failed to fetch team data. Please try again.');
        } finally {
            setLoading(false);
        }
    }, [staticData]);

    const logout = useCallback(() => {
        setTeamData(null);
        setPicksData(null);
        setTransfersHistory([]);
        // Optional: clear local storage if used
    }, []);

    return {
        staticData,
        fixtures,
        t100OwnershipMap,
        aiPredictionMap,
        gameweekMetadata,
        teamData,
        picksData,
        transfersHistory,
        loading,
        error,
        loadTeam,
        logout
    };
};
