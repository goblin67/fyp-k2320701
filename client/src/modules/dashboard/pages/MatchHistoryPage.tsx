import type { MatchHistoryPageProps } from '../dashboard.types';

const MatchHistoryPage = ({ matchHistory }: MatchHistoryPageProps) => (
    <section>
        <h3>Match History</h3>
        {matchHistory.length > 0 ? (
            <table>
                <thead>
                    <tr><th>Date</th><th>Opponent</th><th>Result</th></tr>
                </thead>
                <tbody>
                    {matchHistory.slice().reverse().map((match, index) => (
                        <tr key={index}>
                            <td>{new Date(match.matchDate).toLocaleDateString()}</td>
                            <td>{match.opponent}</td>
                            <td className={match.isWin ? 'text-green' : 'text-red'}>{match.isWin ? 'WIN' : 'LOSS'}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        ) : (
            <p style={{ color: '#666' }}>No matches recorded yet. Start a session to play!</p>
        )}
    </section>
);

export default MatchHistoryPage;
