import type { SessionSummaryPageProps } from '../dashboard.types';

const SessionSummaryPage = ({ session, selectedSession, onBack }: SessionSummaryPageProps) => (
    <section>
        <h2 className="text-green">Session Summary</h2>
        <p style={{ color: '#aaa' }}>Session: {session.title || 'CourtSync Session'}</p>
        <div style={{ background: '#1f1f1f', border: '1px solid #333', borderRadius: '12px', padding: '20px', maxWidth: '700px', margin: '20px auto' }}>
            <p><strong>Total players:</strong> {session.players.length}</p>
            <p><strong>Total matches:</strong> {session.matches.length}</p>
            <p><strong>Completed matches:</strong> {session.matches.filter((match) => match.status === 'finished').length}</p>
            <p><strong>Ongoing matches:</strong> {session.matches.filter((match) => match.status === 'ongoing').length}</p>
            <p><strong>Session status:</strong> {session.isActive ? 'Active' : 'Closed'}</p>
        </div>
        <div style={{ maxWidth: '700px', margin: '0 auto' }}>
            {session.matches.map((match, index) => (
                <div key={index} style={{ background: '#252525', padding: '18px', borderRadius: '10px', marginBottom: '12px' }}>
                    <p style={{ fontWeight: '700' }}>Court {match.court}</p>
                    <p>
                        <strong>{match.player1 || 'Vacant'}</strong> & <strong>{match.player2 || 'Vacant'}</strong>
                        {match.player3 || match.player4 ? ` vs ${match.player3 || 'Vacant'} & ${match.player4 || 'Vacant'}` : ''}
                    </p>
                    <p>Status: {match.status.toUpperCase()}</p>
                    {match.status === 'finished' && <p>Winner: {match.winner}</p>}
                    <p>Score: {match.score?.team1} - {match.score?.team2}</p>
                </div>
            ))}
        </div>
        <button className="btn-primary" style={{ marginTop: '20px' }} onClick={onBack}>
            {selectedSession ? 'Back to Session History' : 'Back to Dashboard'}
        </button>
    </section>
);

export default SessionSummaryPage;
