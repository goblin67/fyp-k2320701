import type { SessionHistoryPageProps } from '../dashboard.types';

const getSessionStatus = (session: SessionHistoryPageProps['sessions'][number]) =>
    session.status ?? (session.isActive ? 'active' : 'completed');

const getPlayerStatus = (session: SessionHistoryPageProps['sessions'][number], username: string) => {
    const player = session.players.find((item) => item.username.toLowerCase() === username.toLowerCase());
    if (!player) return 'Organiser';
    const activeMatch = session.matches.find((match) =>
        match.status !== 'finished' &&
        [match.player1, match.player2, match.player3, match.player4].includes(username)
    );
    if (activeMatch?.status === 'ongoing') return `Playing · Court ${activeMatch.court}`;
    if (activeMatch?.status === 'proposed') return `Match proposed · Court ${activeMatch.court}`;
    if (getSessionStatus(session) === 'active') return 'Waiting in queue';
    if (getSessionStatus(session) === 'scheduled') return 'Registered';
    return 'Session complete';
};

const SessionHistoryPage = ({ sessions, username, onSelect }: SessionHistoryPageProps) => (
    <section>
        <h3>My Sessions</h3>
        <p style={{ color: '#aaa', marginTop: 0 }}>Sessions you’ve joined, including live sessions and upcoming bookings.</p>
        {sessions.length > 0 ? (
            <div style={{ display: 'grid', gap: '14px' }}>
                {sessions.map((session) => {
                    const status = getSessionStatus(session);
                    return (
                        <div className={`player-session-card${status === 'active' ? ' is-live' : ''}`} key={session._id}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: '16px', flexWrap: 'wrap' }}>
                                <div>
                                    <h4 style={{ margin: 0 }}>{session.title || 'Untitled session'}</h4>
                                    <p style={{ margin: '6px 0 0', color: '#aaa' }}>
                                        {session.scheduledAt
                                            ? new Date(session.scheduledAt).toLocaleString()
                                            : session.createdAt ? new Date(session.createdAt).toLocaleString() : 'Date unavailable'}
                                        {session.venue ? ` · ${session.venue}` : ''}
                                    </p>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    {status === 'active'
                                        ? <span className="player-live-badge"><span className="player-live-dot" aria-hidden="true" />LIVE NOW</span>
                                        : <span className={`player-session-status status-${status}`}>{status.toUpperCase()}</span>}
                                    <p style={{ margin: '4px 0 0', color: '#aaa' }}>{session.players.length} players</p>
                                </div>
                            </div>
                            <p style={{ color: '#d2e8a4', margin: '12px 0 0' }}>{getPlayerStatus(session, username)}</p>
                            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '12px' }}>
                                <span style={{ color: '#ccc' }}>Matches: {session.matches.length}</span>
                                <span style={{ color: '#ccc' }}>Finished: {session.matches.filter((match) => match.status === 'finished').length}</span>
                                <span style={{ color: '#ccc' }}>Ongoing: {session.matches.filter((match) => match.status === 'ongoing').length}</span>
                            </div>
                            <button className="btn-primary" style={{ marginTop: '14px' }} onClick={() => onSelect(session._id)}>
                                View Session Details
                            </button>
                        </div>
                    );
                })}
            </div>
        ) : (
            <p style={{ color: '#666' }}>You haven’t joined any sessions yet.</p>
        )}
    </section>
);

export default SessionHistoryPage;
