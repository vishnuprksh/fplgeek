
import { useEffect, useState } from 'react';
import { fplService } from './services/fpl';
import type { TeamEntry, BootstrapStatic, TeamPicks, Match, Player, Pick } from './types/fpl';
import { TeamCard } from './components/TeamCard';
import { PitchView } from './components/PitchView';
import { FixtureAnalysis } from './components/FixtureAnalysis';
import { PlayerAnalysis } from './components/PlayerAnalysis';
import { Predictions } from './components/Predictions';
import { ChatWindow } from './components/ChatWindow';
import { TransferModal } from './components/TransferModal';
import { AiHistory } from './components/AiHistory';
import { getDataProvider } from './services/dataFactory';
import './App.css';
import { BottomNav } from './components/BottomNav';
import { optimizeTransfers } from './utils/solver';
import type { PredictionResult } from './utils/predictions';

function App() {
  const [teamId, setTeamId] = useState(6075264);
  const [teamData, setTeamData] = useState<TeamEntry | null>(null);
  const [staticData, setStaticData] = useState<BootstrapStatic | null>(null);
  const [picksData, setPicksData] = useState<TeamPicks | null>(null);
  const [fixtures, setFixtures] = useState<Match[]>([]);
  const [currentView, setCurrentView] = useState<'dashboard' | 'fixtures' | 'players' | 'predictions' | 'ai-history'>('dashboard');
  // Mutable state for transfers
  const [activePicks, setActivePicks] = useState<Pick[]>([]);
  const [bank, setBank] = useState(0);
  const [selectedTransferPlayer, setSelectedTransferPlayer] = useState<Player | null>(null);

  // Optimization State
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [selectedToSell, setSelectedToSell] = useState<Set<number>>(new Set());
  const [optimizationResult, setOptimizationResult] = useState<{ lineup: any, transfers: any[] } | null>(null);
  const [isProcessingOpt, setIsProcessingOpt] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Load static data and fixtures once on mount
    const loadGlobals = async () => {
      try {
        const [bootstrap, matches] = await Promise.all([
          fplService.getBootstrapStatic(),
          fplService.getFixtures()
        ]);
        setStaticData(bootstrap);
        setFixtures(matches);

        // After static loaded, load default team
        if (bootstrap) {
          fetchData(teamId);
        }
      } catch (e) {
        console.error("Failed to load global FPL data", e);
        setError("Failed to load FPL database.");
      }
    };
    loadGlobals();
  }, []);

  // Helper outside or inside
  const calculateSellingPrice = (purchasePrice: number, nowCost: number) => {
    if (nowCost <= purchasePrice) return nowCost;
    return purchasePrice + Math.floor((nowCost - purchasePrice) / 2);
  };

  const fetchData = async (id: number) => {
    setLoading(true);
    setError(null);
    setPicksData(null);

    try {
      if (!staticData) return; // Should be loaded

      // 1. Get Team Details & Transfers
      const [data, transfersHistory] = await Promise.all([
        fplService.getTeamDetails(id),
        fplService.getTransfers(id)
      ]);
      setTeamData(data);

      // 2. Get Picks for current event
      if (data.current_event) {
        const picks = await fplService.getTeamPicks(id, data.current_event);
        setPicksData(picks);

        // 3. Calculate Prices
        const picksWithPrices = picks.picks.map(p => {
          const player = staticData.elements.find(e => e.id === p.element);
          if (!player) return { ...p, selling_price: 0, purchase_price: 0 };

          // Find latest transfer-in
          const lastTransfer = transfersHistory
            .filter((t: any) => t.element_in === p.element)
            .sort((a: any, b: any) => new Date(b.time).getTime() - new Date(a.time).getTime())[0];

          // If no transfer found, assume they were in initial squad (Start Price)
          // cost_change_start = Now - Start => Start = Now - cost_change_start
          const purchasePrice = lastTransfer ? lastTransfer.element_in_cost : (player.now_cost - player.cost_change_start);

          const sellingPrice = calculateSellingPrice(purchasePrice, player.now_cost);

          return {
            ...p,
            purchase_price: purchasePrice,
            selling_price: sellingPrice
          };
        });

        setActivePicks(picksWithPrices);
        setBank(picks.entry_history.bank);
      }
    } catch (err) {
      console.error(err);
      setError('Failed to fetch team data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Predictions State
  const [predictionsMap, setPredictionsMap] = useState<Record<number, { totalForecast: number, next5Points: number[] }>>({});

  useEffect(() => {
    // Load predictions only if we have static data (elements)
    if (!staticData) return;

    const loadPredictions = async () => {
      try {
        const storedPreds = await getDataProvider().getPredictions();
        if (storedPreds && storedPreds.length > 0) {
          const map: Record<number, any> = {};

          storedPreds.forEach((sp: any) => {
            map[sp.id] = {
              totalForecast: sp.total5Week,
              next5Points: sp.projections.map((p: any) => p.xP)
            };
          });
          setPredictionsMap(map);
        }
      } catch (e) {
        console.error("Failed to load predictions for dashboard", e);
      }
    };
    loadPredictions();
  }, [staticData]);


  const toggleOptimizationMode = () => {
    if (isOptimizing) {
      // Cancel
      setIsOptimizing(false);
      setSelectedToSell(new Set());
      setOptimizationResult(null);
    } else {
      setIsOptimizing(true);
    }
  };

  const handleToggleSell = (id: number) => {
    const next = new Set(selectedToSell);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedToSell(next);
    setOptimizationResult(null);
  };

  const runOptimization = () => {
    if (!staticData || !activePicks.length) return;
    setIsProcessingOpt(true);

    setTimeout(() => {
      // Build current squad structure
      const currentSquad = activePicks.map(p => {
        const player = staticData.elements.find(e => e.id === p.element);
        const pred = predictionsMap[p.element];
        if (!player) return null;
        return {
          player,
          cost: p.selling_price ?? player.now_cost, // Fallback to now_cost if selling_price missing
          predictedPoints: (pred?.totalForecast || 0) / 5,
          totalForecast: pred?.totalForecast || 0,
          smartValue: 0,
          next5Points: []
        } as PredictionResult;
      }).filter(Boolean) as PredictionResult[];

      // Build candidates (all robust players)
      const allCandidates: PredictionResult[] = staticData.elements.map(e => ({
        player: e,
        cost: e.now_cost, // USE BUY PRICE for candidates
        predictedPoints: (predictionsMap[e.id]?.totalForecast || 0) / 5,
        totalForecast: predictionsMap[e.id]?.totalForecast || 0,
        smartValue: 0,
        next5Points: []
      })).filter(p => p.totalForecast > 0);

      const res = optimizeTransfers(currentSquad, selectedToSell, bank, allCandidates);
      setOptimizationResult(res);
      setIsProcessingOpt(false);
    }, 100);
  };

  const applyOptimization = () => {
    if (!optimizationResult) return;
    handleBatchTransfer(
      optimizationResult.transfers.map((t: any) => ({ in: t.in.player, out: t.out.player })),
      [...optimizationResult.lineup.starting11, ...optimizationResult.lineup.bench]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchData(teamId);
  };

  const handleTransfer = (playerOut: Player, playerIn: Player) => {
    // Determine Selling Price
    const pick = activePicks.find(p => p.element === playerOut.id);
    const sellPrice = pick ? pick.selling_price : playerOut.now_cost;

    // 1. Validation (Double Safe)
    const costDiff = playerIn.now_cost - sellPrice; // Price Diff = Buy Price - Sell Price
    if (bank - costDiff < 0) {
      alert(`Insufficient funds! Need £${costDiff / 10}m but have £${bank / 10}m.`);
      return;
    }

    // 2. Update Picks
    const newPicks = activePicks.map(p => {
      if (p.element === playerOut.id) {
        return {
          ...p,
          element: playerIn.id,
          selling_price: playerIn.now_cost, // Reset for new player
          purchase_price: playerIn.now_cost
        };
      }
      return p;
    });

    setActivePicks(newPicks);
    setBank(prev => prev - costDiff);
    setSelectedTransferPlayer(null); // Close modal
  };

  const handleBatchTransfer = (transfers: { in: Player, out: Player }[], newLineup?: any[]) => {
    let currentBank = bank;
    let newPicks = [...activePicks];

    // 1. Apply Transfers (ID Swaps) & Calc Bank
    let totalCostDiff = 0;

    transfers.forEach(t => {
      const pick = activePicks.find(p => p.element === t.out.id);
      const sellPrice = pick ? pick.selling_price : t.out.now_cost;
      totalCostDiff += (t.in.now_cost - sellPrice);
    });

    if (currentBank - totalCostDiff < 0) {
      alert(`Insufficient funds for these transfers! Need £${totalCostDiff / 10}m.`);
      return;
    }

    transfers.forEach(t => {
      const pickIdx = newPicks.findIndex(p => p.element === t.out.id);
      if (pickIdx !== -1) {
        newPicks[pickIdx] = {
          ...newPicks[pickIdx],
          element: t.in.id,
          selling_price: t.in.now_cost,
          purchase_price: t.in.now_cost
        };
      }
    });

    // 2. Apply Lineup (Formation / Bench Ordering)
    if (newLineup && newLineup.length === 15) {
      // newLineup is array of PredictionResult (ordered 1-11 XI, 12-15 Bench)
      // We need to re-assign positions to matching picks

      const orderedPicks: Pick[] = [];

      newLineup.forEach((p, index) => {
        const pick = newPicks.find(existing => existing.element === p.player.id);
        if (pick) {
          orderedPicks.push({
            ...pick,
            position: index + 1,
            multiplier: index < 11 ? 1 : 0, // Reset multipliers: XI gets 1, Bench 0
            is_captain: false,      // Reset captaincy for safety (user should pick) or auto-pick?
            is_vice_captain: false  // For now reset. 
          });
        }
      });

      // Auto-pick captain (highest predicted in XI)
      if (orderedPicks.length === 15) {
        // Find best in XI
        let bestIdx = 0;
        let maxP = -1;
        newLineup.slice(0, 11).forEach((p, i) => {
          if (p.totalForecast > maxP) {
            maxP = p.totalForecast;
            bestIdx = i;
          }
        });
        orderedPicks[bestIdx].is_captain = true;
        orderedPicks[bestIdx].multiplier = 2;

        // Vice captain (2nd best)
        let vcIdx = (bestIdx === 0 ? 1 : 0);
        let maxVC = -1;
        newLineup.slice(0, 11).forEach((p, i) => {
          if (i !== bestIdx && p.totalForecast > maxVC) {
            maxVC = p.totalForecast;
            vcIdx = i;
          }
        });
        orderedPicks[vcIdx].is_vice_captain = true;

        newPicks = orderedPicks;
      }
    }

    setActivePicks(newPicks);
    setBank(prev => prev - totalCostDiff);
    toggleOptimizationMode();
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo-container">
          <div className="logo-icon">⚽</div>
          <h1>FPL GEEK</h1>
        </div>
        <div className="user-avatar" onClick={() => window.location.reload()}>VP</div>
      </header>

      <main className="main-content">
        {!teamData && (
          <div className="hero-section">
            <div className="hero-content">
              <span className="hero-badge">AI-Powered FPL Tools</span>
              <h2>Dominate Your League</h2>
              <p>Get advanced analytics, AI team recommendations, and fixture insights to stay ahead in your Fantasy Premier League.</p>
              <div className="search-form">
                <input
                  type="number"
                  placeholder="Enter Team ID"
                  value={teamId || ''}
                  onChange={(e) => setTeamId(Number(e.target.value))}
                  className="search-input"
                  onKeyPress={(e) => e.key === 'Enter' && fetchData(teamId)}
                />
                <button
                  onClick={() => fetchData(teamId)}
                  disabled={loading}
                  className="search-button"
                >
                  {loading ? 'Crunching Numbers...' : 'Analyze My Team'}
                </button>
              </div>
              <div className="hero-stats">
                <div className="hero-stat">
                  <span className="stat-label">Trusted by</span>
                  <span className="stat-number">10k+ Managers</span>
                </div>
                <div className="hero-stat">
                  <span className="stat-label">Data Points</span>
                  <span className="stat-number">Real-time</span>
                </div>
              </div>
            </div>
            <div className="hero-visual">
              <div className="vibe-orb"></div>
            </div>
          </div>
        )}

        {error && <div className="error-message">{error}</div>}

        {currentView === 'dashboard' && (
          <>
            {loading && (
              <div className="info-message">
                Fetching data from FPL API...
              </div>
            )}

            {teamData && !loading && (
              <div className="fade-in">
                <div className="dashboard-grid">
                  {/* LEFT COLUMN: My Team */}
                  <div className="dashboard-left-col dashboard-panel">
                    <TeamCard
                      team={teamData}
                      totalValue={picksData?.entry_history.value}
                      bank={bank}
                    />

                    {activePicks.length > 0 && (
                      <div style={{ padding: '0 20px', marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: '40px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <h3 style={{ margin: 0 }}>👤 My Team</h3>

                          {!isOptimizing ? (
                            <button
                              onClick={toggleOptimizationMode}
                              style={{
                                background: 'transparent',
                                border: '1px solid #00ff87',
                                color: '#00ff87',
                                borderRadius: '50px',
                                padding: '4px 12px',
                                fontSize: '0.8em',
                                cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: '5px'
                              }}
                            >
                              ⚡ Optimize
                            </button>
                          ) : (
                            <div style={{ display: 'flex', gap: '10px' }}>
                              <button
                                onClick={runOptimization}
                                disabled={isProcessingOpt}
                                style={{
                                  background: '#00ff87',
                                  border: 'none',
                                  color: '#000',
                                  borderRadius: '50px',
                                  padding: '4px 12px',
                                  fontSize: '0.8em',
                                  cursor: 'pointer',
                                  fontWeight: 'bold'
                                }}
                              >
                                {isProcessingOpt ? 'Thinking...' : 'Run Optimization'}
                              </button>

                              {optimizationResult && (
                                <button
                                  onClick={applyOptimization}
                                  style={{
                                    background: '#ffd700',
                                    border: 'none',
                                    color: '#000',
                                    borderRadius: '50px',
                                    padding: '4px 12px',
                                    fontSize: '0.8em',
                                    cursor: 'pointer',
                                    fontWeight: 'bold'
                                  }}
                                >
                                  Apply Changes
                                </button>
                              )}

                              <button
                                onClick={toggleOptimizationMode}
                                style={{
                                  background: 'rgba(255,255,255,0.1)',
                                  border: 'none',
                                  color: '#ccc',
                                  borderRadius: '50px',
                                  padding: '4px 12px',
                                  fontSize: '0.8em',
                                  cursor: 'pointer'
                                }}
                              >
                                Cancel
                              </button>
                            </div>
                          )}
                        </div>

                        {optimizationResult && (
                          <div style={{ fontSize: '0.8em', color: '#00ff87' }}>
                            Gain: +{(optimizationResult.lineup.totalPredictedPoints - activePicks.reduce((acc, p) => acc + (predictionsMap[p.element]?.totalForecast || 0), 0)).toFixed(1)} pts
                          </div>
                        )}

                        {!isOptimizing && (
                          <div style={{ background: '#37003c', color: '#00ff87', padding: '5px 12px', borderRadius: '4px', fontSize: '0.9em', display: 'flex', gap: '15px' }}>
                            <span>
                              <b>XI:</b> {(activePicks.filter(p => p.position <= 11).reduce((acc, p) => acc + (predictionsMap[p.element]?.totalForecast || 0), 0) / 5).toFixed(1)}
                            </span>
                            <span style={{ color: '#ccc' }}>
                              <b>Bench:</b> {(activePicks.filter(p => p.position > 11).reduce((acc, p) => acc + (predictionsMap[p.element]?.totalForecast || 0), 0) / 5).toFixed(1)}
                            </span>
                            <span style={{ color: '#888', fontSize: '0.8em', alignSelf: 'center' }}>(avg/gw)</span>
                          </div>
                        )}
                      </div>
                    )}

                    {activePicks.length > 0 && staticData && (
                      <PitchView
                        picks={activePicks}
                        elements={staticData.elements}
                        teams={staticData.teams}
                        onPlayerClick={setSelectedTransferPlayer}
                        predictions={predictionsMap}
                        isOptimizing={isOptimizing}
                        selectedToSell={selectedToSell}
                        onToggleSell={handleToggleSell}
                      />
                    )}
                  </div>

                  {/* RIGHT COLUMN: AI Assistant */}
                  <div className="dashboard-right-col dashboard-panel">
                    <div style={{ padding: '15px', borderBottom: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)' }}>
                      <h3 style={{ margin: 0 }}>💬 AI Assistant</h3>
                    </div>
                    <ChatWindow
                      teamData={teamData}
                      picks={activePicks}
                      elements={staticData?.elements}
                    />
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {currentView === 'fixtures' && staticData && (
          <div className="fade-in">
            <FixtureAnalysis
              fixtures={fixtures}
              teams={staticData.teams}
              currentEvent={staticData.events.find(e => e.is_next)?.id || 1}
            />
          </div>
        )}

        {currentView === 'players' && staticData && (
          <div className="fade-in">
            <PlayerAnalysis
              elements={staticData.elements}
              teams={staticData.teams}
            />
          </div>
        )}

        {currentView === 'predictions' && staticData && (
          <div className="fade-in">
            <Predictions
              elements={staticData.elements}
              teams={staticData.teams}
              fixtures={fixtures}
            />
          </div>
        )}

        {currentView === 'ai-history' && staticData && (
          <div className="fade-in">
            <AiHistory
              elements={staticData.elements}
              teams={staticData.teams}
            />
          </div>
        )}
      </main>

      {selectedTransferPlayer && staticData && (
        <TransferModal
          player={selectedTransferPlayer}
          elements={staticData.elements}
          teams={staticData.teams}
          currentPicks={activePicks}
          bank={bank}
          onClose={() => setSelectedTransferPlayer(null)}
          onTransfer={handleTransfer}
        />
      )}

      <BottomNav currentView={currentView} onChangeView={setCurrentView} />
    </div>
  );
}

export default App;
