import type { SessionHistoryPageProps } from '../dashboard.types';

const SessionHistoryPage = ({ sessions, onSelect }: SessionHistoryPageProps) => (
    <section>
        <h3>Past Sessions</h3>
        {sessions.length > 0 ? (
            <div style={{ display: 'grid', gap: '14px' }}>
                {sessions.map((session) => (
                    <div key={session._id} style={{ background: '#181818', padding: '18px', borderRadius: '12px', border: '1px solid #333' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: '16px', flexWrap: 'wrap' }}>
                            <div>
                                <h4 style={{ margin: 0 }}>{session.title || 'Untitled session'}</h4>
                                <p style={{ margin: '6px 0 0', color: '#aaa' }}>{session.createdAt ? new Date(session.createdAt).toLocaleString() : 'Date unavailable'}</p>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <p style={{ margin: 0, color: '#888' }}>{session.isActive ? 'Active' : 'Closed'}</p>
                                <p style={{ margin: '4px 0 0', color: '#aaa' }}>{session.players.length} players</p>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '12px' }}>
                            <span style={{ color: '#ccc' }}>Matches: {session.matches.length}</span>
                            <span style={{ color: '#ccc' }}>Finished: {session.matches.filter((match) => match.status === 'finished').length}</span>
                            <span style={{ color: '#ccc' }}>Ongoing: {session.matches.filter((match) => match.status === 'ongoing').length}</span>
                        </div>
                        <button className="btn-primary" style={{ marginTop: '14px' }} onClick={() => onSelect(session._id)}>
                            View Summary
                        </button>
                    </div>
                ))}
            </div>
        ) : (
            <p style={{ color: '#666' }}>No past sessions found yet.</p>
        )}
    </section>
);

export default SessionHistoryPage;
