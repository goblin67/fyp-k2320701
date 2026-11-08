import type { SessionSummaryPageProps } from '../dashboard.types';

const getStatus = (session: SessionSummaryPageProps['session']) =>
    session.status ?? (session.isActive ? 'active' : 'completed');

const SessionSummaryPage = ({ session, selectedSession, username, onBack }: SessionSummaryPageProps) => {
    const player = session.players.find((item) => item.username.toLowerCase() === username.toLowerCase());
    const activeMatches = session.matches
        .map((match, index) => ({ match, index }))
        .filter(({ match }) => match.status === 'ongoing' || match.status === 'proposed')
        .sort((a, b) => {
            const aTime = new Date(a.match.createdAt ?? a.match.startTime ?? 0).getTime();
            const bTime = new Date(b.match.createdAt ?? b.match.startTime ?? 0).getTime();
            return bTime - aTime || b.index - a.index;
        });
    const currentMatch = activeMatches[0]?.match;
    const playingPlayers = new Set(
        session.matches
            .filter((match) => match.status !== 'finished')
            .flatMap((match) => [match.player1, match.player2, match.player3, match.player4])
            .filter((name): name is string => Boolean(name))
    );
    const waitingPlayers = session.players.filter((item) => !playingPlayers.has(item.username));
    const playerMatch = session.matches.find((match) =>
        match.status !== 'finished' &&
        [match.player1, match.player2, match.player3, match.player4]
            .some((name) => name?.toLowerCase() === username.toLowerCase())
    );
    const status = getStatus(session);
    const playerStatus = !player
        ? 'Organiser'
        : playerMatch?.status === 'ongoing'
            ? `Playing on court ${playerMatch.court}`
            : playerMatch?.status === 'proposed'
                ? `Match proposed on court ${playerMatch.court}`
                : status === 'active'
                    ? 'Waiting in queue'
                    : status === 'scheduled'
                        ? 'Registered for this session'
                        : 'Session complete';

    return (
        <section>
            <header className="player-session-header">
                <div>
                    <span className="player-session-kicker">SESSION DETAILS</span>
                    <h2 className="text-green">{session.title || 'CourtSync Session'}</h2>
                    <p>{session.scheduledAt ? new Date(session.scheduledAt).toLocaleString() : 'Session date unavailable'}{session.venue ? ` · ${session.venue}` : ''}</p>
                </div>
                {status === 'active'
                    ? <span className="player-live-badge"><span className="player-live-dot" aria-hidden="true" />LIVE NOW</span>
                    : <span className={`player-session-status status-${status}`}>{status.toUpperCase()}</span>}
            </header>
            <div className="player-session-overview">
                <div className="player-session-stat"><span>Your status</span><strong>{playerStatus}</strong></div>
                <div className="player-session-stat"><span>Players</span><strong>{session.players.length}</strong></div>
                <div className="player-session-stat"><span>Matches</span><strong>{session.matches.length}</strong></div>
                <div className="player-session-stat"><span>Completed</span><strong>{session.matches.filter((match) => match.status === 'finished').length}</strong></div>
            </div>
            {status === 'active' && waitingPlayers.length > 0 && (
                <div className="player-session-panel">
                    <div className="player-session-panel-heading"><h3>Waiting queue</h3><span>{waitingPlayers.length} waiting</span></div>
                    <div className="player-session-queue">
                        {waitingPlayers.map((item) => (
                            <span className={`player-session-queue-item${item.username.toLowerCase() === username.toLowerCase() ? ' is-you' : ''}`} key={item.username}>
                                {item.username}{item.username.toLowerCase() === username.toLowerCase() ? ' · You' : ''}
                            </span>
                        ))}
                    </div>
                </div>
            )}
            <div className="player-session-panel">
                <div className="player-session-panel-heading">
                    <h3>{status === 'active' ? 'Courts and matches' : 'Session matches'}</h3>
                    {status === 'active' && <span>Current update</span>}
                </div>
                {status === 'active' ? (
                    currentMatch ? (
                        <article className="player-current-match">
                            <header>
                                <span className="player-current-match-court">COURT {currentMatch.court}</span>
                                {currentMatch.status === 'ongoing'
                                    ? <span className="player-live-badge compact"><span className="player-live-dot" aria-hidden="true" />LIVE MATCH</span>
                                    : <span className="player-session-status status-proposed">UP NEXT</span>}
                            </header>
                            <div className="player-current-match-lineup">
                                <span className={currentMatch.player1?.toLowerCase() === username.toLowerCase() ? 'is-you' : ''}>{currentMatch.player1 || 'Vacant'}</span>
                                <span className="player-current-match-separator">&</span>
                                <span className={currentMatch.player2?.toLowerCase() === username.toLowerCase() ? 'is-you' : ''}>{currentMatch.player2 || 'Vacant'}</span>
                                {(currentMatch.player3 || currentMatch.player4) && (
                                    <>
                                        <span className="player-current-match-versus">VS</span>
                                        <span className={currentMatch.player3?.toLowerCase() === username.toLowerCase() ? 'is-you' : ''}>{currentMatch.player3 || 'Vacant'}</span>
                                        <span className="player-current-match-separator">&</span>
                                        <span className={currentMatch.player4?.toLowerCase() === username.toLowerCase() ? 'is-you' : ''}>{currentMatch.player4 || 'Vacant'}</span>
                                    </>
                                )}
                            </div>
                            <p>{currentMatch.status === 'ongoing' ? 'This match is in progress.' : 'This is the latest proposed match.'}</p>
                        </article>
                    ) : <p className="player-session-empty">No match is currently in progress or proposed.</p>
                ) : session.matches.length > 0 ? (
                    session.matches.map((match) => (
                        <article className="player-history-match" key={match.matchId}>
                            <div className="player-session-panel-heading">
                                <h4>Court {match.court}</h4>
                                <span>{match.status.toUpperCase()}</span>
                            </div>
                            <p>
                                <strong className={match.player1?.toLowerCase() === username.toLowerCase() ? 'is-you' : ''}>{match.player1 || 'Vacant'}</strong>
                                {' & '}
                                <strong className={match.player2?.toLowerCase() === username.toLowerCase() ? 'is-you' : ''}>{match.player2 || 'Vacant'}</strong>
                                {match.player3 || match.player4 ? (
                                    <> vs <strong className={match.player3?.toLowerCase() === username.toLowerCase() ? 'is-you' : ''}>{match.player3 || 'Vacant'}</strong>
                                        {' & '}
                                        <strong className={match.player4?.toLowerCase() === username.toLowerCase() ? 'is-you' : ''}>{match.player4 || 'Vacant'}</strong>
                                    </>
                                ) : null}
                            </p>
                            <p className="player-history-match-score">Score: {match.score?.team1} - {match.score?.team2}{match.winner ? ` · Winner: ${match.winner}` : ''}</p>
                        </article>
                    ))
                ) : <p className="player-session-empty">No matches have been created yet.</p>}
            </div>
            <button className="btn-primary player-session-back" onClick={onBack}>
                {selectedSession ? 'Back to My Sessions' : 'Back to Dashboard'}
            </button>
        </section>
    );
};

export default SessionSummaryPage;
