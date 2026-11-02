import type { OverviewPageProps } from '../dashboard.types';

const OverviewPage = ({ totalGames, totalWins, winRate, streakLabel, matchHistory }: OverviewPageProps) => (
    <section>
        <h3>Performance Overview</h3>
        <p style={{ color: '#aaa', marginBottom: '18px' }}>Track your match results, recent form, and progress without losing sight of your play style.</p>
        <div className="overview-grid">
            <div className="profile-card">
                <h4>Your Profile</h4>
                <div className="profile-line"><span>Games Played</span><strong>{totalGames}</strong></div>
                <div className="profile-line"><span>Wins</span><strong>{totalWins}</strong></div>
                <div className="profile-line"><span>Win Rate</span><strong>{winRate}%</strong></div>
                <div className="profile-line"><span>Current Streak</span><strong>{streakLabel}</strong></div>
            </div>
            <div className="profile-card">
                <h4>Recent Form</h4>
                {matchHistory.length > 0 ? (
                    matchHistory.slice().reverse().slice(0, 4).map((match, index) => (
                        <div key={index} className="recent-match">
                            <div>
                                <strong>{new Date(match.matchDate).toLocaleDateString()}</strong>
                                <p style={{ margin: '4px 0 0', color: '#9bb4ff' }}>{match.opponent}</p>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <span className={match.isWin ? 'text-green' : 'text-red'}>{match.isWin ? 'WIN' : 'LOSS'}</span>
                            </div>
                        </div>
                    ))
                ) : (
                    <p style={{ color: '#666' }}>No recent results yet. Start a match to build your form history.</p>
                )}
            </div>
        </div>
    </section>
);

export default OverviewPage;
