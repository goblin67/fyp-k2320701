import type { SessionSummaryPageProps } from '../dashboard.types';

const getStatus = (session: SessionSummaryPageProps['session']) =>
    session.status ?? (session.isActive ? 'active' : 'completed');

const SessionSummaryPage = ({ session, selectedSession, username, onBack }: SessionSummaryPageProps) => {
    const player = session.players.find((item) => item.username.toLowerCase() === username.toLowerCase());
    const playingPlayers = new Set(
        session.matches
            .filter((match) => match.status !== 'finished')
            .flatMap((match) => [match.player1, match.player2, match.player3, match.player4])
            .filter((name): name is string => Boolean(name))
    );
    const waitingPlayers = session.players.filter((item) => !playingPlayers.has(item.username));
    const activeMatch = session.matches.find((match) =>
        match.status !== 'finished' &&
        [match.player1, match.player2, match.player3, match.player4].includes(username)
    );
    const status = getStatus(session);
    const playerStatus = !player
        ? 'Organiser'
        : activeMatch?.status === 'ongoing'
            ? `Playing on court ${activeMatch.court}`
            : activeMatch?.status === 'proposed'
                ? `Match proposed on court ${activeMatch.court}`
                : status === 'active'
                    ? 'Waiting in queue'
                    : status === 'scheduled'
                        ? 'Registered for this session'
                        : 'Session complete';

    return (
        <section>
            <h2 className="text-green">Session Details</h2>
            <p style={{ color: '#aaa' }}>Session: {session.title || 'CourtSync Session'}</p>
            <div style={{ background: '#1f1f1f', border: '1px solid #333', borderRadius: '12px', padding: '20px', maxWidth: '700px', margin: '20px auto' }}>
                <p><strong>Status:</strong> {status.toUpperCase()}</p>
                {session.scheduledAt && <p><strong>Scheduled:</strong> {new Date(session.scheduledAt).toLocaleString()}</p>}
                {session.venue && <p><strong>Venue:</strong> {session.venue}</p>}
                <p><strong>Your status:</strong> {playerStatus}</p>
                <p><strong>Total players:</strong> {session.players.length}</p>
                <p><strong>Total matches:</strong> {session.matches.length}</p>
                <p><strong>Completed matches:</strong> {session.matches.filter((match) => match.status === 'finished').length}</p>
                <p><strong>Ongoing matches:</strong> {session.matches.filter((match) => match.status === 'ongoing').length}</p>
            </div>
            {status === 'active' && waitingPlayers.length > 0 && (
                <div style={{ background: '#1f1f1f', border: '1px solid #333', borderRadius: '12px', padding: '20px', maxWidth: '700px', margin: '20px auto' }}>
                    <h3 style={{ marginTop: 0 }}>Waiting queue</h3>
                    <p style={{ color: '#ccc' }}>{waitingPlayers.map((item) => item.username).join(' · ')}</p>
                </div>
            )}
            <div style={{ maxWidth: '700px', margin: '0 auto' }}>
                <h3>Courts and matches</h3>
                {session.matches.length === 0 && <p style={{ color: '#aaa' }}>No matches have been created yet.</p>}
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
                {selectedSession ? 'Back to My Sessions' : 'Back to Dashboard'}
            </button>
        </section>
    );
};

export default SessionSummaryPage;
