import type { LeaderboardPageProps } from '../dashboard.types';

const LeaderboardPage = ({ loading, error, rows, totalGames, winRate, activePlayerCount }: LeaderboardPageProps) => (
    <section>
        <h3>Leaderboard</h3>
        {loading ? (
            <p style={{ color: '#aaa' }}>Loading leaderboard...</p>
        ) : error ? (
            <p style={{ color: '#f44336' }}>{error}</p>
        ) : (
            <>
                <div style={{ overflowX: 'auto' }}>
                    <table className="leaderboard-table">
                        <thead>
                            <tr>
                                <th>Rank</th>
                                <th>Player</th>
                                <th>Games</th>
                                <th>Wins</th>
                                <th>Win Rate</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row) => (
                                <tr key={`${row.player}-${row.rank}`} className="leaderboard-row">
                                    <td>{row.rank}</td>
                                    <td className="player-name">{row.player}</td>
                                    <td>{row.games}</td>
                                    <td>{row.wins}</td>
                                    <td className={row.winRate >= 65 ? 'text-green' : 'text-red'}>{row.winRate}%</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {rows.length === 0 && (
                    <p style={{ color: '#666', marginTop: '18px' }}>No shared session users found. Your leaderboard is limited to your account.</p>
                )}
                <div className="leaderboard-summary">
                    <div className="summary-pill"><span>Total Matches</span><strong>{totalGames}</strong></div>
                    <div className="summary-pill"><span>Avg Win Rate</span><strong>{winRate}%</strong></div>
                    <div className="summary-pill"><span>Active Players</span><strong>{activePlayerCount}</strong></div>
                </div>
            </>
        )}
    </section>
);

export default LeaderboardPage;
