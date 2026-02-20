import { useState, useEffect, useCallback } from 'react';
import { fplService } from '../services/fpl';
import { getDataProvider } from '../services/dataFactory';
import type { TeamEntry, BootstrapStatic, TeamPicks, Match } from '../types/fpl';

export interface PredictionMap {
    [id: number]: {
        totalForecast: number;
        next5Points: number[];
        prob_gt_6?: number;
        prob_gt_10?: number;
        r10_inf?: number;
        r10_thr?: number;
    };
}

export const useFPLData = () => {
    const [staticData, setStaticData] = useState<BootstrapStatic | null>(null);
    const [fixtures, setFixtures] = useState<Match[]>([]);
    const [predictionsMap, setPredictionsMap] = useState<PredictionMap>({});

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

                // Load Predictions dependent on static data (actually it's independent fetch, but mapped later)
                // We can fetch it parallel too
                const storedPreds = await getDataProvider().getPredictions();
                if (storedPreds && storedPreds.length > 0) {
                    const map: PredictionMap = {};
                    storedPreds.forEach((sp: any) => {
                        map[sp.id] = {
                            totalForecast: sp.total5Week,
                            next5Points: sp.projections.map((p: any) => p.xP),
                            prob_gt_6: sp.prob_gt_6,
                            prob_gt_10: sp.prob_gt_10,
                            r10_inf: sp.r10_inf,
                            r10_thr: sp.r10_thr
                        };
                    });
                    setPredictionsMap(map);
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
        predictionsMap,
        teamData,
        picksData,
        transfersHistory,
        loading,
        error,
        loadTeam,
        logout
    };
};
