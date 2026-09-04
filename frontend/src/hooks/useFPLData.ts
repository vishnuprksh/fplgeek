import { useState, useEffect, useCallback } from 'react';
import { fplService } from '../services/fpl';
import type { TeamEntry, BootstrapStatic, TeamPicks, Match } from '../types/fpl';
import type { PredictionMetadata } from '../types/gameweek';

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
    // True while the initial global data (bootstrap, fixtures, metadata,
    // ownership, predictions) is still settling on app load.
    const [booting, setBooting] = useState(true);

    // 1. Load Globals on Mount
    useEffect(() => {
        const loadGlobals = async () => {
            console.log("🔄 loadGlobals starting...");
            try {
                // Parallel fetch for static data, fixtures, gameweek metadata,
                // T100 ownership and AI predictions — all independent, so run
                // them together instead of sequentially to cut boot time.
                const safeJson = async (url: string) => {
                    try {
                        const res = await fetch(url);
                        if (!res.ok) return null;
                        const contentType = res.headers.get('content-type');
                        if (!contentType || !contentType.includes('application/json')) return null;
                        return await res.json();
                    } catch (e) {
                        console.warn(`⚠️ Could not fetch ${url}:`, e);
                        return null;
                    }
                };

                const [bootstrap, matches, gwMetadata, leagueData, predData] = await Promise.all([
                    fplService.getBootstrapStatic(),
                    fplService.getFixtures(),
                    safeJson('/ai-api/api/gameweek-context'),
                    safeJson('/ai-api/api/data/league-analysis'),
                    safeJson('/ai-api/api/data/predictions')
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
                if (leagueData?.history && leagueData.history.length > 0) {
                    const latestGw = leagueData.history[leagueData.history.length - 1];
                    const ownershipMap: T100OwnershipMap = {};
                    latestGw.top_owned.forEach((p: any) => {
                        ownershipMap[p.id] = p.percent;
                    });
                    setT100OwnershipMap(ownershipMap);
                }

                // Load AI predictions
                if (Array.isArray(predData)) {
                    const predMap: AIPredictionMap = {};
                    predData.forEach(p => { predMap[p.id] = p; });
                    setAiPredictionMap(predMap);
                    console.log('✅ AI predictions loaded:', predData.length, 'players');
                }
            } catch (e) {
                console.error("❌ Failed to load global FPL data", e);
                setError("Failed to load FPL database or fixtures.");
            } finally {
                // Boot phase is over (success or failure) — reveal the app.
                setBooting(false);
            }
        };

        loadGlobals();
    }, []);

    // 2. Load User Team
    const loadTeam = useCallback(async (id: number) => {
        if (!staticData) return; // Guard: need static data first

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
        booting,
        error,
        loadTeam,
        logout
    };
};
