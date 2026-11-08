import type { ActiveMatchPageProps, PlayerField } from '../dashboard.types';

const ActiveMatchPage = ({
    session,
    username,
    endingMatchId,
    matchActionError,
    matchTimer,
    newPlayerName,
    setNewPlayerName,
    onEndSession,
    onAddPlayer,
    waitingQueue,
    queueWaitTime,
    onRemoveQueuePlayer,
    isMatchComplete,
    selectedWinner,
    setSelectedWinner,
    replacementSelection,
    setReplacementSelection,
    onReplacePlayer,
    matchScores,
    onScoreChange,
    onEndMatch
}: ActiveMatchPageProps) => (
    <section style={{ textAlign: 'center', padding: '40px 0' }}>
        <h2 className="text-green"><span className="player-live-dot" aria-hidden="true" style={{ display: 'inline-block', marginRight: 10, verticalAlign: 'middle' }} />Match in Progress</h2>
        <p style={{ color: '#aaa', marginBottom: '10px' }}>Session: {session.title || 'CourtSync Session'}</p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', marginBottom: '16px' }}>
            <button className="btn-primary" style={{ minWidth: '140px' }} onClick={onEndSession} disabled={endingMatchId === 'session'}>
                {endingMatchId === 'session' ? 'Ending Session…' : 'End Session'}
            </button>
        </div>
        {matchActionError && <div className="error-banner" style={{ margin: '0 auto 20px', maxWidth: '700px' }}>{matchActionError}</div>}
        <div style={{ fontSize: '1.1rem', marginBottom: '20px' }}>
            <p>Live timer: <strong>{matchTimer}</strong></p>
        </div>
        <div style={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: '10px', padding: '16px', margin: '0 auto 20px', maxWidth: '700px' }}>
            <h4 style={{ margin: '0 0 10px', color: '#bbb' }}>Add Player to Queue</h4>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <input
                    type="text"
                    placeholder="Player name"
                    value={newPlayerName}
                    onChange={(event) => setNewPlayerName(event.target.value)}
                    style={{ flex: 1, minWidth: '180px', padding: '10px', borderRadius: '8px', border: '1px solid #444', background: '#121212', color: '#fff' }}
                />
                <button className="btn-primary" onClick={onAddPlayer}>Add Player</button>
            </div>
        </div>
        <div style={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: '10px', padding: '16px', margin: '0 auto 20px', maxWidth: '700px' }}>
            <h4 style={{ margin: '0 0 10px', color: '#bbb' }}>Waiting Queue</h4>
            {waitingQueue.length > 0 ? (
                waitingQueue.map((player) => (
                    <div key={player.username} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #222' }}>
                        <div>
                            <div>{player.username}</div>
                            <div style={{ color: '#888', fontSize: '0.85rem' }}>Waiting {queueWaitTime(player.joinedAt)}</div>
                        </div>
                        <button className="btn-primary" style={{ background: '#c62828', borderColor: '#a82424' }} onClick={() => onRemoveQueuePlayer(player.username)}>
                            Remove
                        </button>
                    </div>
                ))
            ) : <p style={{ color: '#666' }}>No waiting players at the moment.</p>}
        </div>
        {session.matches.filter((match) => match.status === 'ongoing').length > 0 ? (
            session.matches.filter((match) => match.status === 'ongoing').map((match, index) => (
                <div key={index} className="player-current-match" style={{ marginBottom: '20px', textAlign: 'left' }}>
                    <p><span className="player-live-dot" aria-hidden="true" style={{ display: 'inline-block', marginRight: 8, verticalAlign: 'middle' }} /><strong>Court {match.court} · LIVE</strong></p>
                    <p style={{ margin: '6px 0' }}>
                        <strong className={match.player1?.toLowerCase() === username.toLowerCase() ? 'is-you' : ''}>{match.player1 || 'Vacant'}</strong> <span style={{ color: '#666' }}>vs</span> <strong className={match.player2?.toLowerCase() === username.toLowerCase() ? 'is-you' : ''}>{match.player2 || 'Vacant'}</strong>
                    </p>
                    {match.player3 || match.player4 ? (
                        <p style={{ margin: '6px 0' }}>
                            <strong className={match.player3?.toLowerCase() === username.toLowerCase() ? 'is-you' : ''}>{match.player3 || 'Vacant'}</strong> <span style={{ color: '#666' }}>vs</span> <strong className={match.player4?.toLowerCase() === username.toLowerCase() ? 'is-you' : ''}>{match.player4 || 'Vacant'}</strong>
                        </p>
                    ) : null}
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '16px' }}>
                        {isMatchComplete(match) ? (
                            match.player3 && match.player4 ? (
                                <>
                                    <label style={{ color: '#ddd' }}>
                                        <input type="radio" name={`winner-${match.matchId}`} value="team1" checked={selectedWinner[match.matchId] === 'team1'} onChange={(event) => setSelectedWinner({ ...selectedWinner, [match.matchId]: event.target.value })} />
                                        Team 1: {match.player1} & {match.player2}
                                    </label>
                                    <label style={{ color: '#ddd' }}>
                                        <input type="radio" name={`winner-${match.matchId}`} value="team2" checked={selectedWinner[match.matchId] === 'team2'} onChange={(event) => setSelectedWinner({ ...selectedWinner, [match.matchId]: event.target.value })} />
                                        Team 2: {match.player3} & {match.player4}
                                    </label>
                                </>
                            ) : (
                                <>
                                    <label style={{ color: '#ddd' }}>
                                        <input type="radio" name={`winner-${match.matchId}`} value={match.player1} checked={selectedWinner[match.matchId] === match.player1} onChange={(event) => setSelectedWinner({ ...selectedWinner, [match.matchId]: event.target.value })} />
                                        {match.player1} wins
                                    </label>
                                    <label style={{ color: '#ddd' }}>
                                        <input type="radio" name={`winner-${match.matchId}`} value={match.player2} checked={selectedWinner[match.matchId] === match.player2} onChange={(event) => setSelectedWinner({ ...selectedWinner, [match.matchId]: event.target.value })} />
                                        {match.player2} wins
                                    </label>
                                </>
                            )
                        ) : (
                            <div style={{ color: '#f0a500', fontSize: '0.95rem' }}>
                                Match line-up is incomplete. Fill all required player spots before finishing this match.
                            </div>
                        )}
                    </div>
                    <div style={{ display: 'grid', gap: '12px', marginTop: '16px' }}>
                        {waitingQueue.length > 0 && (
                            <div style={{ display: 'grid', gap: '8px' }}>
                                <label style={{ color: '#aaa' }}>Replace a player from this match</label>
                                {(session.isDoubles ? ['player1', 'player2', 'player3', 'player4'] as PlayerField[] : ['player1', 'player2'] as PlayerField[]).map((field) => {
                                    const currentName = match[field] || 'Vacant spot';
                                    const key = `${match.matchId}-${field}`;
                                    return (
                                        <div key={key} style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                                            <span style={{ color: '#ddd', minWidth: '90px' }}>{currentName}</span>
                                            <select value={replacementSelection[key] || ''} onChange={(event) => setReplacementSelection({ ...replacementSelection, [key]: event.target.value })} style={{ flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid #444', background: '#1a1a1a', color: '#fff' }}>
                                                <option value="">Choose replacement</option>
                                                {waitingQueue.map((player) => <option key={player.username} value={player.username}>{player.username}</option>)}
                                            </select>
                                            <button className="btn-primary" style={{ padding: '10px 16px' }} onClick={() => onReplacePlayer(match, field)}>Replace</button>
                                            {match[field] && (
                                                <button className="btn-primary" style={{ padding: '10px 16px', background: '#c62828', borderColor: '#a82424' }} onClick={() => {
                                                    const playerName = match[field];
                                                    if (playerName) onRemoveQueuePlayer(playerName);
                                                }}>
                                                    Remove
                                                </button>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                    <div style={{ display: 'flex', gap: '10px', marginTop: '16px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                        <div style={{ display: 'grid', gap: '8px' }}>
                            <label style={{ color: '#aaa' }}>Team 1 Score</label>
                            <input type="number" min="0" value={matchScores[match.matchId]?.team1 || 0} onChange={(event) => onScoreChange(match.matchId, 'team1', event.target.value)} style={{ width: '80px', padding: '8px', borderRadius: '6px', border: '1px solid #444', background: '#1a1a1a', color: '#fff' }} />
                        </div>
                        <div style={{ display: 'grid', gap: '8px' }}>
                            <label style={{ color: '#aaa' }}>Team 2 Score</label>
                            <input type="number" min="0" value={matchScores[match.matchId]?.team2 || 0} onChange={(event) => onScoreChange(match.matchId, 'team2', event.target.value)} style={{ width: '80px', padding: '8px', borderRadius: '6px', border: '1px solid #444', background: '#1a1a1a', color: '#fff' }} />
                        </div>
                    </div>
                    <button className="btn-primary" style={{ marginTop: '18px' }} onClick={() => onEndMatch(match)} disabled={endingMatchId === match.matchId || !isMatchComplete(match)}>
                        {endingMatchId === match.matchId ? 'Ending…' : 'Finish Match'}
                    </button>
                </div>
            ))
        ) : <p>All matches finished. Generating next round...</p>}
    </section>
);

export default ActiveMatchPage;
