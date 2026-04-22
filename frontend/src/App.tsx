import { useEffect, useState } from 'react';
import { useFPLData } from './hooks/useFPLData';
import { useTransfers } from './hooks/useTransfers';
import { useOptimization } from './hooks/useOptimization';
import './App.css';


import { TeamCard } from './components/TeamCard';
import { PitchView } from './components/PitchView';
import { FixtureAnalysis } from './components/FixtureAnalysis';
import { PlayerAnalysis } from './components/PlayerAnalysis';
import { OptimizationReport } from './components/OptimizationReport';


import { TransferModal } from './components/TransferModal';
import { LeagueAnalysis } from './components/LeagueAnalysis';
import { AnalysisView } from './components/AnalysisView';
import { BottomNav } from './components/BottomNav';
import { DataView } from './components/DataView';


import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import type { Player } from './types/fpl';

export default function App() {
  console.log("🚀 App component rendering");
  const [teamId, setTeamId] = useState(6075264);
  const [currentView, setCurrentView] = useState<'dashboard' | 'fixtures' | 'players' | 'predictions' | 'league' | 'data' | 'analysis'>('dashboard');


  const [selectedTransferPlayer, setSelectedTransferPlayer] = useState<Player | null>(null);


  // 1. Data Fetching Hook
  const {
    staticData,
    fixtures,
    predictionsMap,
    t100OwnershipMap,
    teamData,
    picksData,
    transfersHistory,
    loading,
    error,
    loadTeam,
    logout: logoutValues
  } = useFPLData();

  const handleLogout = () => {
    logoutValues();
    setTeamId(0);
    // Force reload to clear any persistent state if needed, or just let React handle it
    // window.location.reload(); // Optional, but let's try just state clear first
  };

  // 2. Transfers & State Hook
  const {
    activePicks,
    bank,
    handleSwap,
    handleTransfer,
    handleBatchTransfer
  } = useTransfers(picksData, staticData, transfersHistory);

  // 3. Optimization Hook
  const {
    isOptimizing,
    isProcessing: isProcessingOpt,
    optimizationResult,
    selectedToSell,
    transferAllowance,
    setTransferAllowance,
    haulingWeeks,
    setHaulingWeeks,
    toggleOptimizationMode,
    handleToggleSell,
    runOptimization,
    currentWarnings
  } = useOptimization(activePicks, staticData, predictionsMap, bank, t100OwnershipMap);


  // Load default team when static data is ready (and no team data yet)
  useEffect(() => {
    if (staticData && !teamData) {
      loadTeam(teamId);
    }
  }, [staticData, teamData, teamId, loadTeam]);

  // Bridge Optimization Application to Transfer Logic
  const applyOptimization = () => {
    if (!optimizationResult) return;
    handleBatchTransfer(
      optimizationResult.transfers.map((t: { in: { player: Player }, out: { player: Player } }) => ({ in: t.in.player, out: t.out.player })),
      [...optimizationResult.lineup.starting11, ...optimizationResult.lineup.bench]
    );
    toggleOptimizationMode();
  };

  const ALLOWANCE_OPTIONS = Array.from({ length: 16 }, (_, i) => ({
    value: i,
    label: String(i)
  }));

  // Helper: Calculate haul from projections based on weeks
  const calculateHaulFromProjections = (predictionsData: any, weeks: number): number => {
    if (!predictionsData?.projections || predictionsData.projections.length === 0) {
      return predictionsData?.prob_gt_6 || 0;
    }
    const weeksToConsider = Math.min(weeks, predictionsData.projections.length);
    let sum = 0;
    for (let i = 0; i < weeksToConsider; i++) {
      sum += predictionsData.projections[i].prob_gt_6 || 0;
    }
    return weeksToConsider > 0 ? sum / weeksToConsider : 0;
  };

  const onTransferWrapper = (playerOut: Player, playerIn: Player) => {
    handleTransfer(playerOut, playerIn);
    setSelectedTransferPlayer(null); // Close modal
  };

  return (
    <DndProvider backend={HTML5Backend}>
      <header className="app-header">
        <div className="header-inner">
          <div className="logo-container">
            <div className="logo-icon">⚽</div>
            <h1>FPL GEEK</h1>
          </div>
          <div className="user-avatar" onClick={handleLogout} title="Click to Logout" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.8em', opacity: 0.8 }}>Logout</span>
            <div style={{ width: '32px', height: '32px', background: '#37003c', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>VP</div>
          </div>
        </div>
      </header>
      <div className="app-container">
        <main className="main-content">
          {!teamData && (
            <div className="hero-section">
              <div className="hero-content">
                <span className="hero-badge">Advanced FPL Tools</span>
                <h2>Dominate Your League</h2>
                <p>Get advanced analytics, team recommendations, and fixture insights to stay ahead in your Fantasy Premier League.</p>
                <div className="search-form">
                  <input
                    type="number"
                    placeholder="Enter Team ID"
                    value={teamId || ''}
                    onChange={(e) => setTeamId(Number(e.target.value))}
                    className="search-input"
                    onKeyPress={(e) => e.key === 'Enter' && loadTeam(teamId)}
                  />
                  <button
                    onClick={() => loadTeam(teamId)}
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
                <div className="dashboard-grid fade-in">
                  <div className="dashboard-main">
                    <TeamCard
                      team={teamData}
                      totalValue={picksData?.entry_history.value}
                      bank={bank}
                    />

                    {activePicks.length > 0 && (
                      <div style={{ padding: '0 20px', marginBottom: '10px' }}>
                        {/* Row 1: Team title + action buttons */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: '40px', gap: '10px', flexWrap: 'wrap', marginBottom: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <h3 style={{ margin: 0 }}>👤 My Team</h3>

                            {!isOptimizing ? (
                              <button onClick={toggleOptimizationMode} className="optimize-btn">
                                ⚡ Optimize
                              </button>
                            ) : (
                              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                <button
                                  onClick={runOptimization}
                                  disabled={isProcessingOpt}
                                  className="optimize-btn active"
                                >
                                  {isProcessingOpt ? '⏳ Thinking...' : '▶ Run Auto-Pick'}
                                </button>

                                {optimizationResult && (
                                  <button onClick={applyOptimization} className="optimize-btn apply">
                                    ✓ Apply Changes
                                  </button>
                                )}

                                <button
                                  onClick={toggleOptimizationMode}
                                  className="optimize-btn"
                                  style={{ border: '1px solid #ef4444', color: '#ef4444' }}
                                >
                                  ✕ Cancel
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Haul summary pill (non-optimize mode) */}
                          {!isOptimizing && (
                            <div className="haul-summary-pill">
                              <span className="haul-item">
                                <span className="haul-icon">📈</span>
                                <b>XI Haul:</b> {((activePicks.filter(p => p.position <= 11).reduce((acc, p) => acc + (calculateHaulFromProjections(predictionsMap[p.element], haulingWeeks) || 0), 0)) * 100).toFixed(0)}%
                              </span>
                              <span className="haul-divider"></span>
                              <span className="haul-item bench">
                                <span className="haul-icon">🪑</span>
                                <b>Bench:</b> {((activePicks.filter(p => p.position > 11).reduce((acc, p) => acc + (calculateHaulFromProjections(predictionsMap[p.element], haulingWeeks) || 0), 0)) * 100).toFixed(0)}%
                              </span>
                              <span className="haul-meta">({haulingWeeks}w avg)</span>
                            </div>
                          )}
                        </div>

                        {/* Row 2: Transfer Allowance Selector (only in optimize mode) */}
                        {isOptimizing && (
                          <div className="transfer-allowance-selector">
                            <span className="allowance-label">Transfers:</span>
                            <div className="allowance-pills">
                              {ALLOWANCE_OPTIONS.map(opt => (
                                <button
                                  key={opt.value}
                                  className={`allowance-pill${transferAllowance === opt.value ? ' active' : ''}`}
                                  onClick={() => { setTransferAllowance(opt.value); }}
                                >
                                  {opt.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Row 3: Haul Weeks Selector (only in optimize mode) */}
                        {isOptimizing && (
                          <div className="transfer-allowance-selector">
                            <span className="allowance-label">Haul Window:</span>
                            <div className="allowance-pills">
                              {[1, 2, 3].map(weeks => (
                                <button
                                  key={weeks}
                                  className={`allowance-pill${haulingWeeks === weeks ? ' active' : ''}`}
                                  onClick={() => { setHaulingWeeks(weeks); }}
                                  title={`${weeks} week${weeks > 1 ? 's' : ''} ahead`}
                                >
                                  {weeks}w
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {activePicks.length > 0 && staticData && (
                      <div className="pitch-layout-container">
                        <div className="pitch-left-panel">
                          <PitchView
                            picks={activePicks}
                            elements={staticData.elements}
                            teams={staticData.teams}
                            onPlayerClick={setSelectedTransferPlayer}
                            predictions={predictionsMap}
                            isOptimizing={isOptimizing}
                            selectedToSell={selectedToSell}
                            onToggleSell={handleToggleSell}
                            onSwap={handleSwap}
                            t100Ownership={t100OwnershipMap}
                          />
                        </div>
                        <div className="pitch-right-panel">
                          {optimizationResult ? (
                            <OptimizationReport result={optimizationResult} />
                          ) : isProcessingOpt ? (
                            <div className="opt-report" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '300px', textAlign: 'center' }}>
                              <h3 style={{ color: '#00d2ff', marginBottom: '16px' }}>🤖 AI is crunching the numbers...</h3>
                              <p style={{ color: '#888' }}>Simulating future gameweeks and evaluating thousands of transfer combinations.</p>
                            </div>
                          ) : (
                            <div className="opt-report">
                              <div className="opt-report-header">
                                <h3>📊 Squad Analysis</h3>
                              </div>
                              {currentWarnings && currentWarnings.length > 0 ? (
                                <div className="opt-warnings" style={{ marginTop: '16px' }}>
                                  <h4 style={{ color: '#f59e0b', marginBottom: '8px' }}>⚠️ T100 Ownership Warnings</h4>
                                  {currentWarnings.map((w, i) => (
                                    <div key={i} className="opt-warning-item" style={{
                                      background: 'rgba(245, 158, 11, 0.1)',
                                      border: '1px solid rgba(245, 158, 11, 0.3)',
                                      borderRadius: '6px',
                                      padding: '8px 12px',
                                      marginBottom: '6px',
                                      fontSize: '0.85em',
                                      color: '#fbbf24'
                                    }}>
                                      {w}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div style={{ color: '#00ff87', marginTop: '16px', padding: '12px', background: 'rgba(0, 255, 135, 0.1)', border: '1px solid rgba(0, 255, 135, 0.2)', borderRadius: '6px' }}>
                                  ✅ Squad T100 ownership looks optimal!
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
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
                predictions={predictionsMap}
                t100Ownership={t100OwnershipMap}
              />
            </div>
          )}

          {currentView === 'league' && (
            <div className="fade-in">
              <LeagueAnalysis />
            </div>
          )}

          {currentView === 'data' && (
            <div className="fade-in">
              <DataView />
            </div>
          )}

          {currentView === 'analysis' && (
            <div className="fade-in">
              <AnalysisView />
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
            onTransfer={onTransferWrapper}
            predictions={predictionsMap}
            t100Ownership={t100OwnershipMap}
          />
        )}
      </div >
      <BottomNav currentView={currentView} onChangeView={setCurrentView} />
    </DndProvider>
  );
}
