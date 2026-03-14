import { useState, useEffect, useCallback } from 'react';
import { fplService } from '../services/fpl';
import { getDataProvider } from '../services/dataFactory';
import type { TeamEntry, BootstrapStatic, TeamPicks, Match } from '../types/fpl';

export type T100OwnershipMap = Record<number, number>;

export const useFPLData = () => {
    const [staticData, setStaticData] = useState<BootstrapStatic | null>(null);
    const [fixtures, setFixtures] = useState<Match[]>([]);
    const [t100OwnershipMap, setT100OwnershipMap] = useState<T100OwnershipMap>({});

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
                // Parallel fetch for static data and fixtures
                const [bootstrap, matches] = await Promise.all([
                    fplService.getBootstrapStatic(),
                    fplService.getFixtures()
                ]);

                console.log("✅ Bootstrap fetched with", bootstrap?.elements?.length, "elements");
                console.log("✅ Fixtures fetched:", matches?.length);

                setStaticData(bootstrap);
                setFixtures(matches);

                // Load T100 ownership from league analysis
                try {
                    const leagueRes = await fetch('/data/league_analysis.json');
                    const contentType = leagueRes.headers.get('content-type');
                    if (leagueRes.ok && contentType && contentType.includes('application/json')) {
                        const leagueData = await leagueRes.json();
                        if (leagueData.history && leagueData.history.length > 0) {
                            const latestGw = leagueData.history[leagueData.history.length - 1];
                            const ownershipMap: T100OwnershipMap = {};
                            latestGw.top_owned.forEach((p: any) => {
                                ownershipMap[p.id] = p.percent;
                            });
                            setT100OwnershipMap(ownershipMap);
                        }
                    }
                } catch (e) {
                    console.warn('⚠️ Could not load league analysis for T100 ownership', e);
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
        teamData,
        picksData,
        transfersHistory,
        loading,
        error,
        loadTeam,
        logout
    };
};
