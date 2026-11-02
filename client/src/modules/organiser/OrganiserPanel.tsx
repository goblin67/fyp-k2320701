import { useEffect, useState, type FormEvent } from 'react';
import type { SessionData, SessionMatch, SessionPlayer } from '../../types/domain';
import './organiser.css';

type Format = 'singles' | 'doubles';
type PlayerKind = 'account' | 'guest';
type Screen = 'sessions' | 'details' | 'setup' | 'live';

interface PlayerAccount {
    username: string;
    age?: number;
    level?: string;
    rating: number;
}

interface PlayerSelection {
    username: string;
    kind: PlayerKind;
    preferredFormat: Format;
    age?: number;
    level?: string;
}

interface OrganiserPanelProps {
    onLogout: () => void;
}

interface ApiError {
    error?: string;
}

interface SessionActionResponse extends ApiError {
    session: SessionData;
}

interface SessionForm {
    title: string;
    scheduledAt: string;
    endsAt: string;
    venue: string;
}

interface NewPlayerForm {
    username: string;
    password: string;
    age: string;
    level: string;
    preferredFormat: Format;
}

const API_URL = import.meta.env.VITE_BACKEND_URL;
const levels = [
    'Beginner',
    'Weekly casual',
    'Tier 1/2/3 BE',
    'Bi-weekly casual',
    'Occasional tournament player',
    'ISO medal holder',
    'Badminton England rated'
];

const toLocalDateTime = (date?: string | Date): string => {
    if (!date) return '';
    const value = new Date(date);
    if (Number.isNaN(value.getTime())) return '';
    return new Date(value.getTime() - value.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

const toIsoDateTime = (value: string): string => new Date(value).toISOString();

const getErrorMessage = (error: unknown): string =>
    error instanceof Error ? error.message : 'Something went wrong. Please try again.';

interface ApiRequestOptions {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
}

const apiRequest = async <T,>(path: string, init: ApiRequestOptions = {}): Promise<T> => {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_URL}/api/organiser${path}`, {
        ...init,
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...init.headers
        }
    });
    const body = await response.json() as T & ApiError;
    if (!response.ok) throw new Error(body.error ?? 'Request failed');
    return body;
};

const CourtDiagram = ({ number, format, match }: { number: number; format: Format; match?: SessionMatch }) => {
    const players = match
        ? [match.player1, match.player2, ...(format === 'doubles' ? [match.player3, match.player4] : [])].filter(Boolean)
        : [];

    return (
        <article className="organiser-court">
            <header>
                <div>
                    <span className="organiser-eyebrow">COURT {number}</span>
                    <h3>{format === 'doubles' ? 'Doubles' : 'Singles'}</h3>
                </div>
                <span className={`organiser-court-status${match ? ' is-playing' : ''}`}>
                    {match ? 'Playing' : 'Waiting'}
                </span>
            </header>
            <svg className="organiser-court-image" viewBox="0 0 160 250" role="img" aria-label={`Badminton court ${number}`}>
                <rect x="7" y="7" width="146" height="236" rx="3" />
                <line x1="7" y1="125" x2="153" y2="125" />
                <line x1="18" y1="7" x2="18" y2="243" />
                <line x1="142" y1="7" x2="142" y2="243" />
                <line x1="7" y1="42" x2="153" y2="42" />
                <line x1="7" y1="208" x2="153" y2="208" />
                <line x1="31" y1="42" x2="31" y2="208" />
                <line x1="129" y1="42" x2="129" y2="208" />
                <line className="organiser-court-net" x1="7" y1="125" x2="153" y2="125" />
            </svg>
            <div className="organiser-court-players">
                {players.length
                    ? players.map((player) => <span key={player}>{player}</span>)
                    : <span className="organiser-muted">Waiting for preferred players</span>}
            </div>
        </article>
    );
};

const OrganiserPanel = ({ onLogout }: OrganiserPanelProps) => {
    const [screen, setScreen] = useState<Screen>('sessions');
    const [sessions, setSessions] = useState<SessionData[]>([]);
    const [selectedSession, setSelectedSession] = useState<SessionData | null>(null);
    const [playerAccounts, setPlayerAccounts] = useState<PlayerAccount[]>([]);
    const [selectedPlayers, setSelectedPlayers] = useState<PlayerSelection[]>([]);
    const [courtFormats, setCourtFormats] = useState<Format[]>(['singles']);
    const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null);
    const [sessionForm, setSessionForm] = useState<SessionForm>({ title: '', scheduledAt: '', endsAt: '', venue: '' });
    const [newPlayer, setNewPlayer] = useState<NewPlayerForm>({
        username: '',
        password: '',
        age: '',
        level: 'Beginner',
        preferredFormat: 'singles'
    });
    const [newGuest, setNewGuest] = useState({ username: '', age: '', level: 'Beginner', preferredFormat: 'singles' as Format });
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        let cancelled = false;
        const loadData = async () => {
            try {
                const [sessionData, accountData] = await Promise.all([
                    apiRequest<SessionData[]>('/sessions'),
                    apiRequest<PlayerAccount[]>('/players')
                ]);
                if (!cancelled) {
                    setSessions(sessionData);
                    setPlayerAccounts(accountData);
                }
            } catch (requestError) {
                if (!cancelled) setError(getErrorMessage(requestError));
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        void loadData();
        return () => {
            cancelled = true;
        };
    }, []);

    const upsertSession = (updated: SessionData) => {
        setSelectedSession(updated);
        setSessions((current) => [updated, ...current.filter((session) => session._id !== updated._id)]);
    };

    const openCreateForm = () => {
        setSessionForm({ title: '', scheduledAt: '', endsAt: '', venue: '' });
        setFormMode('create');
        setError('');
    };

    const openEditForm = () => {
        if (!selectedSession) return;
        setSessionForm({
            title: selectedSession.title,
            scheduledAt: toLocalDateTime(selectedSession.scheduledAt),
            endsAt: toLocalDateTime(selectedSession.endsAt),
            venue: selectedSession.venue ?? ''
        });
        setFormMode('edit');
        setError('');
    };

    const saveSession = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setBusy(true);
        setError('');
        try {
            const body = {
                title: sessionForm.title.trim(),
                scheduledAt: toIsoDateTime(sessionForm.scheduledAt),
                endsAt: sessionForm.endsAt ? toIsoDateTime(sessionForm.endsAt) : '',
                venue: sessionForm.venue.trim()
            };
            const updated = formMode === 'edit' && selectedSession
                ? await apiRequest<SessionData>(`/sessions/${selectedSession._id}`, { method: 'PATCH', body: JSON.stringify(body) })
                : await apiRequest<SessionData>('/sessions', { method: 'POST', body: JSON.stringify(body) });
            upsertSession(updated);
            setFormMode(null);
            setScreen('details');
        } catch (requestError) {
            setError(getErrorMessage(requestError));
        } finally {
            setBusy(false);
        }
    };

    const beginSessionSetup = () => {
        if (!selectedSession) return;
        setSelectedPlayers([]);
        setCourtFormats(['singles']);
        setScreen('setup');
        setError('');
    };

    const toggleAccount = (account: PlayerAccount, preferredFormat: Format) => {
        setSelectedPlayers((current) => current.some((player) => player.username === account.username)
            ? current.filter((player) => player.username !== account.username)
            : [...current, { username: account.username, kind: 'account', preferredFormat, age: account.age, level: account.level }]);
    };

    const updatePlayerPreference = (username: string, preferredFormat: Format) => {
        setSelectedPlayers((current) => current.map((player) =>
            player.username === username ? { ...player, preferredFormat } : player
        ));
    };

    const addGuestToSetup = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const username = newGuest.username.trim();
        if (!username || selectedPlayers.some((player) => player.username.toLowerCase() === username.toLowerCase())) {
            setError('Enter a unique guest name.');
            return;
        }
        setSelectedPlayers((current) => [...current, {
            username,
            kind: 'guest',
            preferredFormat: newGuest.preferredFormat,
            age: newGuest.age ? Number(newGuest.age) : undefined,
            level: newGuest.level
        }]);
        setNewGuest({ username: '', age: '', level: 'Beginner', preferredFormat: 'singles' });
        setError('');
    };

    const registerAndAddAccount = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setBusy(true);
        setError('');
        try {
            const response = await fetch(`${API_URL}/api/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: newPlayer.username.trim(),
                    password: newPlayer.password,
                    age: newPlayer.age,
                    level: newPlayer.level
                })
            });
            const body = await response.json() as ApiError;
            if (!response.ok) throw new Error(body.error ?? 'Could not register player');

            const selection: PlayerSelection = {
                username: newPlayer.username.trim(),
                kind: 'account',
                preferredFormat: newPlayer.preferredFormat,
                age: newPlayer.age ? Number(newPlayer.age) : undefined,
                level: newPlayer.level
            };
            const accounts = await apiRequest<PlayerAccount[]>('/players');
            setPlayerAccounts(accounts);
            if (screen === 'setup') {
                setSelectedPlayers((current) => [...current, selection]);
            } else if (screen === 'live' && selectedSession) {
                const updated = await apiRequest<SessionData>(`/sessions/${selectedSession._id}/players`, {
                    method: 'POST',
                    body: JSON.stringify(selection)
                });
                upsertSession(updated);
            }
            setNewPlayer({ username: '', password: '', age: '', level: 'Beginner', preferredFormat: 'singles' });
        } catch (requestError) {
            setError(getErrorMessage(requestError));
        } finally {
            setBusy(false);
        }
    };

    const startSession = async () => {
        if (!selectedSession) return;
        setBusy(true);
        setError('');
        try {
            const updated = await apiRequest<SessionData>(`/sessions/${selectedSession._id}/start`, {
                method: 'POST',
                body: JSON.stringify({ players: selectedPlayers, courtFormats })
            });
            upsertSession(updated);
            setScreen('live');
        } catch (requestError) {
            setError(getErrorMessage(requestError));
        } finally {
            setBusy(false);
        }
    };

    const addGuestToLiveSession = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!selectedSession) return;
        setBusy(true);
        setError('');
        try {
            const updated = await apiRequest<SessionData>(`/sessions/${selectedSession._id}/players`, {
                method: 'POST',
                body: JSON.stringify({
                    username: newGuest.username.trim(),
                    kind: 'guest',
                    preferredFormat: newGuest.preferredFormat,
                    age: newGuest.age ? Number(newGuest.age) : undefined,
                    level: newGuest.level
                })
            });
            upsertSession(updated);
            setNewGuest({ username: '', age: '', level: 'Beginner', preferredFormat: 'singles' });
        } catch (requestError) {
            setError(getErrorMessage(requestError));
        } finally {
            setBusy(false);
        }
    };

    const addExistingPlayerToLive = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!selectedSession) return;
        const formData = new FormData(event.currentTarget);
        const username = String(formData.get('account') ?? '');
        const preferredFormat = String(formData.get('format') ?? 'singles') as Format;
        const form = event.currentTarget;
        if (!username) {
            setError('Select a player account to add.');
            return;
        }
        setBusy(true);
        setError('');
        try {
            const updated = await apiRequest<SessionData>(`/sessions/${selectedSession._id}/players`, {
                method: 'POST',
                body: JSON.stringify({ username, kind: 'account', preferredFormat })
            });
            upsertSession(updated);
            form.reset();
        } catch (requestError) {
            setError(getErrorMessage(requestError));
        } finally {
            setBusy(false);
        }
    };

    const endSession = async () => {
        if (!selectedSession || !window.confirm('End this session now?')) return;
        setBusy(true);
        setError('');
        try {
            const response = await fetch(`${API_URL}/api/session/close`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${localStorage.getItem('token') ?? ''}`
                },
                body: JSON.stringify({ sessionId: selectedSession._id })
            });
            const body = await response.json() as SessionActionResponse;
            if (!response.ok) throw new Error(body.error ?? 'Could not end session');
            upsertSession(body.session);
            setScreen('details');
        } catch (requestError) {
            setError(getErrorMessage(requestError));
        } finally {
            setBusy(false);
        }
    };

    const statusOf = (session: SessionData): string =>
        session.status ?? (session.isActive ? 'active' : 'completed');
    const activeMatches = selectedSession?.matches.filter((match) => match.status === 'ongoing') ?? [];
    const playingNames = new Set(activeMatches.flatMap((match) =>
        [match.player1, match.player2, match.player3, match.player4].filter((name): name is string => Boolean(name))
    ));
    const waitingPlayers = selectedSession?.players.filter((player) => !playingNames.has(player.username)) ?? [];
    const courts = selectedSession?.courtFormats?.length
        ? selectedSession.courtFormats
        : Array.from({ length: selectedSession?.numCourts ?? 0 }, () => selectedSession?.isDoubles ? 'doubles' : 'singles');

    if (loading) {
        return <main className="organiser-shell"><p className="organiser-muted">Loading organiser workspace…</p></main>;
    }

    return (
        <main className="organiser-shell">
            <header className="organiser-topbar">
                <div>
                    <span className="organiser-eyebrow">COURT SYNC · ORGANISER</span>
                    <h1>Session control</h1>
                    <p>Plan your sessions, prepare courts, and manage the player roster.</p>
                </div>
                <button className="organiser-button secondary" type="button" onClick={onLogout}>Log out</button>
            </header>

            {error && <div className="organiser-error" role="alert">{error}</div>}

            {formMode && (
                <section className="organiser-card organiser-form-card">
                    <div className="organiser-section-heading">
                        <div>
                            <span className="organiser-eyebrow">{formMode === 'edit' ? 'UPDATE DETAILS' : 'NEW PLAN'}</span>
                            <h2>{formMode === 'edit' ? 'Edit session' : 'Create a session'}</h2>
                        </div>
                    </div>
                    <form className="organiser-form" onSubmit={saveSession}>
                        <label>Session name
                            <input required maxLength={100} value={sessionForm.title} onChange={(event) => setSessionForm({ ...sessionForm, title: event.target.value })} />
                        </label>
                        <div className="organiser-form-grid">
                            <label>Start date and time
                                <input required type="datetime-local" value={sessionForm.scheduledAt} onChange={(event) => setSessionForm({ ...sessionForm, scheduledAt: event.target.value })} />
                            </label>
                            <label>End date and time <span className="organiser-muted">(optional)</span>
                                <input type="datetime-local" value={sessionForm.endsAt} onChange={(event) => setSessionForm({ ...sessionForm, endsAt: event.target.value })} />
                            </label>
                        </div>
                        <label>Venue <span className="organiser-muted">(optional)</span>
                            <input maxLength={160} value={sessionForm.venue} onChange={(event) => setSessionForm({ ...sessionForm, venue: event.target.value })} />
                        </label>
                        <div className="organiser-actions">
                            <button className="organiser-button secondary" type="button" onClick={() => setFormMode(null)}>Cancel</button>
                            <button className="organiser-button" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save session'}</button>
                        </div>
                    </form>
                </section>
            )}

            {!formMode && screen === 'sessions' && (
                <section className="organiser-card">
                    <div className="organiser-section-heading">
                        <div>
                            <span className="organiser-eyebrow">YOUR SESSIONS</span>
                            <h2>Session schedule</h2>
                        </div>
                        <button className="organiser-button" type="button" onClick={openCreateForm}>＋ New session</button>
                    </div>
                    {sessions.length === 0 ? (
                        <div className="organiser-empty">
                            <h3>No sessions planned yet</h3>
                            <p>Create a session to set its date, time, and venue. You can edit the plan until it starts.</p>
                            <button className="organiser-button" type="button" onClick={openCreateForm}>Create your first session</button>
                        </div>
                    ) : (
                        <div className="organiser-session-list">
                            {sessions.map((session) => (
                                <button className="organiser-session-row" key={session._id} type="button" onClick={() => {
                                    setSelectedSession(session);
                                    setScreen(statusOf(session) === 'active' ? 'live' : 'details');
                                }}>
                                    <span>
                                        <strong>{session.title}</strong>
                                        <small>{session.scheduledAt ? new Date(session.scheduledAt).toLocaleString() : 'Date not set'}{session.venue ? ` · ${session.venue}` : ''}</small>
                                    </span>
                                    <span className={`organiser-status status-${statusOf(session)}`}>{statusOf(session)}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </section>
            )}

            {!formMode && screen === 'details' && selectedSession && (
                <section className="organiser-card">
                    <button className="organiser-back" type="button" onClick={() => setScreen('sessions')}>← All sessions</button>
                    <div className="organiser-section-heading">
                        <div>
                            <span className="organiser-eyebrow">{statusOf(selectedSession).toUpperCase()} SESSION</span>
                            <h2>{selectedSession.title}</h2>
                            <p>{selectedSession.scheduledAt ? new Date(selectedSession.scheduledAt).toLocaleString() : 'Date not set'}{selectedSession.venue ? ` · ${selectedSession.venue}` : ''}</p>
                        </div>
                        <span className={`organiser-status status-${statusOf(selectedSession)}`}>{statusOf(selectedSession)}</span>
                    </div>
                    {selectedSession.endsAt && <p className="organiser-detail-line"><strong>Ends:</strong> {new Date(selectedSession.endsAt).toLocaleString()}</p>}
                    <p className="organiser-detail-line"><strong>Players:</strong> {selectedSession.players.length} · <strong>Matches:</strong> {selectedSession.matches.length}</p>
                    {statusOf(selectedSession) === 'scheduled' && (
                        <div className="organiser-actions">
                            <button className="organiser-button secondary" type="button" onClick={openEditForm}>Edit session</button>
                            <button className="organiser-button" type="button" onClick={beginSessionSetup}>Start session</button>
                        </div>
                    )}
                </section>
            )}

            {!formMode && screen === 'setup' && selectedSession && (
                <section className="organiser-card">
                    <button className="organiser-back" type="button" onClick={() => setScreen('details')}>← Session details</button>
                    <div className="organiser-section-heading">
                        <div><span className="organiser-eyebrow">START SESSION</span><h2>Prepare players and courts</h2></div>
                    </div>

                    <div className="organiser-setup-grid">
                        <section className="organiser-subcard">
                            <h3>Existing player accounts</h3>
                            {playerAccounts.map((account) => {
                                const selection = selectedPlayers.find((player) => player.username === account.username);
                                return (
                                    <div className="organiser-player-option" key={account.username}>
                                        <label>
                                            <input type="checkbox" checked={Boolean(selection)} onChange={() => toggleAccount(account, 'singles')} />
                                            <span><strong>{account.username}</strong><small>Rating {account.rating}{account.level ? ` · ${account.level}` : ''}</small></span>
                                        </label>
                                        {selection && (
                                            <select aria-label={`${account.username} preference`} value={selection.preferredFormat} onChange={(event) => updatePlayerPreference(account.username, event.target.value as Format)}>
                                                <option value="singles">Prefers singles</option>
                                                <option value="doubles">Prefers doubles</option>
                                            </select>
                                        )}
                                    </div>
                                );
                            })}
                            {!playerAccounts.length && <p className="organiser-muted">No player accounts are registered yet.</p>}
                        </section>

                        <section className="organiser-subcard">
                            <h3>Add a guest player</h3>
                            <form className="organiser-form compact" onSubmit={addGuestToSetup}>
                                <label>Name<input required value={newGuest.username} onChange={(event) => setNewGuest({ ...newGuest, username: event.target.value })} /></label>
                                <div className="organiser-form-grid">
                                    <label>Age<input type="number" min="1" max="120" value={newGuest.age} onChange={(event) => setNewGuest({ ...newGuest, age: event.target.value })} /></label>
                                    <label>Playing level<select value={newGuest.level} onChange={(event) => setNewGuest({ ...newGuest, level: event.target.value })}>{levels.map((level) => <option key={level}>{level}</option>)}</select></label>
                                </div>
                                <label>Preference<select value={newGuest.preferredFormat} onChange={(event) => setNewGuest({ ...newGuest, preferredFormat: event.target.value as Format })}><option value="singles">Singles</option><option value="doubles">Doubles</option></select></label>
                                <button className="organiser-button secondary" type="submit">Add guest to roster</button>
                            </form>
                        </section>
                    </div>

                    <section className="organiser-subcard organiser-register-card">
                        <h3>Register a player account</h3>
                        <form className="organiser-form compact" onSubmit={registerAndAddAccount}>
                            <div className="organiser-form-grid">
                                <label>Username<input required value={newPlayer.username} onChange={(event) => setNewPlayer({ ...newPlayer, username: event.target.value })} /></label>
                                <label>Account password<input required type="password" minLength={8} value={newPlayer.password} onChange={(event) => setNewPlayer({ ...newPlayer, password: event.target.value })} /></label>
                                <label>Age<input type="number" min="1" max="120" value={newPlayer.age} onChange={(event) => setNewPlayer({ ...newPlayer, age: event.target.value })} /></label>
                                <label>Playing level<select value={newPlayer.level} onChange={(event) => setNewPlayer({ ...newPlayer, level: event.target.value })}>{levels.map((level) => <option key={level}>{level}</option>)}</select></label>
                                <label>Preference<select value={newPlayer.preferredFormat} onChange={(event) => setNewPlayer({ ...newPlayer, preferredFormat: event.target.value as Format })}><option value="singles">Singles</option><option value="doubles">Doubles</option></select></label>
                            </div>
                            <button className="organiser-button secondary" type="submit" disabled={busy}>{busy ? 'Registering…' : 'Register account and add player'}</button>
                        </form>
                    </section>

                    <section className="organiser-subcard">
                        <div className="organiser-section-heading">
                            <div><h3>Session roster ({selectedPlayers.length})</h3><p>Each player is assigned only to courts matching their preference.</p></div>
                        </div>
                        {selectedPlayers.length ? (
                            <div className="organiser-roster">
                                {selectedPlayers.map((player) => (
                                    <div className="organiser-roster-row" key={player.username}>
                                        <span><strong>{player.username}</strong><small>{player.kind === 'guest' ? 'Guest' : 'Account'} · {player.preferredFormat}</small></span>
                                        <button className="organiser-text-button" type="button" onClick={() => setSelectedPlayers((current) => current.filter((item) => item.username !== player.username))}>Remove</button>
                                    </div>
                                ))}
                            </div>
                        ) : <p className="organiser-muted">Select accounts or add guests before continuing.</p>}
                    </section>

                    <section className="organiser-subcard">
                        <div className="organiser-section-heading">
                            <div><h3>Courts and formats</h3><p>Select between 1 and 6 courts; each court can be singles or doubles.</p></div>
                            <select className="organiser-court-count" aria-label="Number of courts" value={courtFormats.length} onChange={(event) => {
                                const count = Number(event.target.value);
                                setCourtFormats((current) => Array.from({ length: count }, (_, index) => current[index] ?? 'singles'));
                            }}>
                                {[1, 2, 3, 4, 5, 6].map((count) => <option key={count} value={count}>{count} {count === 1 ? 'court' : 'courts'}</option>)}
                            </select>
                        </div>
                        <div className="organiser-court-grid">
                            {courtFormats.map((format, index) => (
                                <div key={index} className="organiser-court-setup">
                                    <CourtDiagram number={index + 1} format={format} />
                                    <label>Court {index + 1} format
                                        <select value={format} onChange={(event) => setCourtFormats((current) => current.map((value, courtIndex) => courtIndex === index ? event.target.value as Format : value))}>
                                            <option value="singles">Singles</option>
                                            <option value="doubles">Doubles</option>
                                        </select>
                                    </label>
                                </div>
                            ))}
                        </div>
                    </section>
                    <div className="organiser-actions">
                        <button className="organiser-button secondary" type="button" onClick={() => setScreen('details')}>Cancel</button>
                        <button className="organiser-button" type="button" disabled={busy || selectedPlayers.length === 0} onClick={() => void startSession()}>{busy ? 'Starting…' : 'Start session'}</button>
                    </div>
                </section>
            )}

            {!formMode && screen === 'live' && selectedSession && (
                <section className="organiser-card">
                    <button className="organiser-back" type="button" onClick={() => setScreen('sessions')}>← All sessions</button>
                    <div className="organiser-section-heading">
                        <div><span className="organiser-eyebrow">LIVE SESSION</span><h2>{selectedSession.title}</h2><p>{selectedSession.scheduledAt ? new Date(selectedSession.scheduledAt).toLocaleString() : ''}</p></div>
                        <button className="organiser-button danger" type="button" disabled={busy} onClick={() => void endSession()}>End session</button>
                    </div>
                    <div className="organiser-court-grid live">
                        {courts.map((format, index) => (
                            <CourtDiagram
                                key={index}
                                number={index + 1}
                                format={format as Format}
                                match={activeMatches.find((match) => match.court === index + 1)}
                            />
                        ))}
                    </div>
                    <section className="organiser-subcard">
                        <h3>Waiting queue · {waitingPlayers.length}</h3>
                        {waitingPlayers.length ? (
                            <div className="organiser-roster">
                                {waitingPlayers.map((player) => (
                                    <div className="organiser-roster-row" key={player.username}>
                                        <span><strong>{player.username}</strong><small>Waiting for a court matching {player.preferredFormat ?? 'their preference'}</small></span>
                                    </div>
                                ))}
                            </div>
                        ) : <p className="organiser-muted">No players are waiting right now.</p>}
                    </section>
                    <section className="organiser-subcard">
                        <h3>Player roster · {selectedSession.players.length}</h3>
                        <div className="organiser-roster">
                            {selectedSession.players.map((player: SessionPlayer) => (
                                <div className="organiser-roster-row" key={player.username}>
                                    <span><strong>{player.username}</strong><small>{player.isGuest ? 'Guest' : 'Account'} · prefers {player.preferredFormat ?? 'either format'}</small></span>
                                </div>
                            ))}
                        </div>
                    </section>
                    <div className="organiser-setup-grid live-add">
                        <section className="organiser-subcard">
                            <h3>Add a registered player</h3>
                            <form className="organiser-form compact" onSubmit={addExistingPlayerToLive}>
                                <label>Player account
                                    <select name="account" required defaultValue="">
                                        <option value="" disabled>Select player</option>
                                        {playerAccounts.filter((account) => !selectedSession.players.some((player) => player.username === account.username)).map((account) => <option value={account.username} key={account.username}>{account.username}</option>)}
                                    </select>
                                </label>
                                <label>Preference<select name="format" defaultValue="singles"><option value="singles">Singles</option><option value="doubles">Doubles</option></select></label>
                                <button className="organiser-button secondary" type="submit" disabled={busy}>Add player</button>
                            </form>
                        </section>
                        <section className="organiser-subcard">
                            <h3>Add a guest while playing</h3>
                            <form className="organiser-form compact" onSubmit={addGuestToLiveSession}>
                                <label>Name<input required value={newGuest.username} onChange={(event) => setNewGuest({ ...newGuest, username: event.target.value })} /></label>
                                <div className="organiser-form-grid">
                                    <label>Age<input type="number" min="1" max="120" value={newGuest.age} onChange={(event) => setNewGuest({ ...newGuest, age: event.target.value })} /></label>
                                    <label>Level<select value={newGuest.level} onChange={(event) => setNewGuest({ ...newGuest, level: event.target.value })}>{levels.map((level) => <option key={level}>{level}</option>)}</select></label>
                                </div>
                                <label>Preference<select value={newGuest.preferredFormat} onChange={(event) => setNewGuest({ ...newGuest, preferredFormat: event.target.value as Format })}><option value="singles">Singles</option><option value="doubles">Doubles</option></select></label>
                                <button className="organiser-button secondary" type="submit" disabled={busy}>Add guest</button>
                            </form>
                        </section>
                    </div>
                    <section className="organiser-subcard organiser-register-card">
                        <h3>Register a new account during the session</h3>
                        <form className="organiser-form compact" onSubmit={registerAndAddAccount}>
                            <div className="organiser-form-grid">
                                <label>Username<input required value={newPlayer.username} onChange={(event) => setNewPlayer({ ...newPlayer, username: event.target.value })} /></label>
                                <label>Account password<input required type="password" minLength={8} value={newPlayer.password} onChange={(event) => setNewPlayer({ ...newPlayer, password: event.target.value })} /></label>
                                <label>Age<input type="number" min="1" max="120" value={newPlayer.age} onChange={(event) => setNewPlayer({ ...newPlayer, age: event.target.value })} /></label>
                                <label>Playing level<select value={newPlayer.level} onChange={(event) => setNewPlayer({ ...newPlayer, level: event.target.value })}>{levels.map((level) => <option key={level}>{level}</option>)}</select></label>
                                <label>Preference<select value={newPlayer.preferredFormat} onChange={(event) => setNewPlayer({ ...newPlayer, preferredFormat: event.target.value as Format })}><option value="singles">Singles</option><option value="doubles">Doubles</option></select></label>
                            </div>
                            <button className="organiser-button secondary" type="submit" disabled={busy}>{busy ? 'Registering…' : 'Register account and add player'}</button>
                        </form>
                    </section>
                </section>
            )}
        </main>
    );
};

export default OrganiserPanel;
