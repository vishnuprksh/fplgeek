import { useEffect, useState } from 'react';
import { useFPLData } from './hooks/useFPLData';
import { useTransfers } from './hooks/useTransfers';
import { useOptimization } from './hooks/useOptimization';

import { TeamCard } from './components/TeamCard';
import { PitchView } from './components/PitchView';
import { FixtureAnalysis } from './components/FixtureAnalysis';
import { PlayerAnalysis } from './components/PlayerAnalysis';

import { ChatWindow } from './components/ChatWindow';
import { TransferModal } from './components/TransferModal';
import { AiHistory } from './components/AiHistory';
import { LeagueAnalysis } from './components/LeagueAnalysis';
import './App.css';
import { BottomNav } from './components/BottomNav';

import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import type { Player } from './types/fpl';

function App() {
  console.log("🚀 App component rendering");
  const [teamId, setTeamId] = useState(6075264);
  const [currentView, setCurrentView] = useState<'dashboard' | 'fixtures' | 'players' | 'predictions' | 'ai-history' | 'league'>('dashboard');
  const [selectedTransferPlayer, setSelectedTransferPlayer] = useState<Player | null>(null);

  // 1. Data Fetching Hook
  const {
    staticData,
    fixtures,
    predictionsMap,
    teamData,
    picksData,
    transfersHistory,
    loading,
    error,
    loadTeam
  } = useFPLData();

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
    toggleOptimizationMode,
    handleToggleSell,
    runOptimization
  } = useOptimization(activePicks, staticData, predictionsMap, bank);


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
      optimizationResult.transfers.map((t: any) => ({ in: t.in.player, out: t.out.player })),
      [...optimizationResult.lineup.starting11, ...optimizationResult.lineup.bench]
    );
    toggleOptimizationMode(); // Turn off optimization mode after applying
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
          <div className="user-avatar" onClick={() => window.location.reload()}>VP</div>
        </div>
      </header>
      <div className="app-container">
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
                                className="optimize-btn"
                              >
                                ⚡ Optimize (5 GWs)
                              </button>
                            ) : (
                              <div style={{ display: 'flex', gap: '10px' }}>
                                <button
                                  onClick={runOptimization}
                                  disabled={isProcessingOpt}
                                  className="optimize-btn active"
                                >
                                  {isProcessingOpt ? 'Thinking...' : '▶ Run Auto-Pick'}
                                </button>

                                {optimizationResult && (
                                  <button
                                    onClick={applyOptimization}
                                    className="optimize-btn apply"
                                  >
                                    Apply Changes
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
                          onSwap={handleSwap}
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
                predictions={predictionsMap}
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

          {currentView === 'league' && (
            <div className="fade-in">
              <LeagueAnalysis />
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
          />
        )}
      </div >
      <BottomNav currentView={currentView} onChangeView={setCurrentView} />
    </DndProvider>
  );
}

export default App;
