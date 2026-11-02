import { useEffect, useState, type FormEvent } from 'react';
import type { SessionData, SessionMatch, SessionPlayer } from '../../types/domain';
import './organiser.css';

type Format = 'singles' | 'doubles';
type PlayerKind = 'account' | 'guest';
type Screen = 'sessions' | 'details' | 'setup' | 'live' | 'summary';
type MatchLineup = [string, string, string?, string?];

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
    onBackToDashboard?: () => void;
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

const formatSessionSchedule = (scheduledAt?: string | Date, endsAt?: string | Date): string => {
    if (!scheduledAt) return 'Date not set';
    const start = new Date(scheduledAt);
    if (Number.isNaN(start.getTime())) return 'Date not set';

    const date = start.toLocaleDateString();
    const formatTime = (value: Date) => value.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23'
    });
    if (!endsAt) return `${date} · ${formatTime(start)}`;

    const end = new Date(endsAt);
    if (Number.isNaN(end.getTime())) return `${date} · ${formatTime(start)}`;
    return `${date} · ${formatTime(start)}-${formatTime(end)}`;
};

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

const getLineup = (match: SessionMatch): MatchLineup => match.isDoubles
    ? [match.player1 ?? '', match.player2 ?? '', match.player3 ?? '', match.player4 ?? '']
    : [match.player1 ?? '', match.player2 ?? ''];

const CourtDiagram = ({ number, format, match }: { number: number; format: Format; match?: SessionMatch }) => {
    const isDoubles = match?.isDoubles ?? format === 'doubles';
    const sideOne = (isDoubles ? [match?.player1, match?.player2] : [match?.player1]).filter(Boolean);
    const sideTwo = isDoubles
        ? [match?.player3, match?.player4].filter(Boolean)
        : [match?.player2].filter(Boolean);
    const matchStatus = match?.status === 'proposed' ? 'Proposed' : match ? 'Playing' : 'Waiting';

    return (
        <article className="organiser-court">
            <header>
                <div>
                    <span className="organiser-eyebrow">COURT {number}</span>
                    <h3>{isDoubles ? 'Doubles' : 'Singles'}</h3>
                </div>
                <span className={`organiser-court-status${match?.status === 'ongoing' ? ' is-playing' : ''}${match?.status === 'proposed' ? ' is-proposed' : ''}`}>
                    {matchStatus}
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
                {sideOne.map((player, index) => (
                    <text className="organiser-court-player" key={`one-${player}`} x="80" y={isDoubles ? 77 + index * 30 : 83}>
                        {player}
                    </text>
                ))}
                {sideTwo.map((player, index) => (
                    <text className="organiser-court-player team-two" key={`two-${player}`} x="80" y={isDoubles ? 163 + index * 30 : 184}>
                        {player}
                    </text>
                ))}
            </svg>
            <div className="organiser-proposed-players">
                <div>
                    <strong>Side 1</strong>
                    <span>{sideOne.length ? sideOne.join(' & ') : 'Waiting for player'}</span>
                </div>
                <div>
                    <strong>Side 2</strong>
                    <span>{sideTwo.length ? sideTwo.join(' & ') : 'Waiting for player'}</span>
                </div>
            </div>
        </article>
    );
};

interface PlayerSessionTotals {
    username: string;
    games: number;
    wins: number;
    pointsFor: number;
    pointsAgainst: number;
}

const getSessionTotals = (session: SessionData): PlayerSessionTotals[] => {
    const totals = new Map(session.players.map((player) => [player.username, {
        username: player.username,
        games: 0,
        wins: 0,
        pointsFor: 0,
        pointsAgainst: 0
    }]));
    session.matches.filter((match) => match.status === 'finished').forEach((match) => {
        const team1 = (match.isDoubles ? [match.player1, match.player2] : [match.player1])
            .filter((name): name is string => Boolean(name));
        const team2 = (match.isDoubles ? [match.player3, match.player4] : [match.player2])
            .filter((name): name is string => Boolean(name));
        const isTeam2Winner = match.winnerTeam === 'team2';
        [...team1, ...team2].forEach((username) => {
            const playerTotals = totals.get(username);
            if (!playerTotals) return;
            const onTeam1 = team1.includes(username);
            playerTotals.games += 1;
            if ((onTeam1 && !isTeam2Winner) || (!onTeam1 && isTeam2Winner)) playerTotals.wins += 1;
            playerTotals.pointsFor += onTeam1 ? match.score.team1 : match.score.team2;
            playerTotals.pointsAgainst += onTeam1 ? match.score.team2 : match.score.team1;
        });
    });
    return [...totals.values()].sort((a, b) => b.pointsFor - a.pointsFor || b.wins - a.wins || a.username.localeCompare(b.username));
};

const downloadCsv = (session: SessionData, name: string, rows: (string | number)[][]) => {
    const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\r\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const sessionDate = new Date(session.scheduledAt ?? session.createdAt ?? '');
    const dateSuffix = Number.isNaN(sessionDate.getTime()) ? 'undated' : sessionDate.toISOString().slice(0, 10);
    const sessionName = session.title.replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '') || 'session';
    link.href = url;
    link.download = `${sessionName}-${dateSuffix}-${session._id}-${name}.csv`;
    link.click();
    URL.revokeObjectURL(url);
};

const downloadMatchSummariesCsv = (session: SessionData) => {
    const rows: (string | number)[][] = [[
        'Match ID', 'Date', 'Court', 'Format', 'Side 1 players', 'Side 2 players',
        'Side 1 points', 'Side 2 points', 'Winner'
    ]];
    session.matches.filter((match) => match.status === 'finished').forEach((match) => {
        const team1 = (match.isDoubles ? [match.player1, match.player2] : [match.player1])
            .filter((name): name is string => Boolean(name));
        const team2 = (match.isDoubles ? [match.player3, match.player4] : [match.player2])
            .filter((name): name is string => Boolean(name));
        rows.push([
            match.matchId,
            match.startTime ? new Date(match.startTime).toISOString() : '',
            match.court,
            match.isDoubles ? 'Doubles' : 'Singles',
            team1.join(' & '),
            team2.join(' & '),
            match.score.team1,
            match.score.team2,
            match.winner ?? ''
        ]);
    });
    downloadCsv(session, 'match-summaries', rows);
};

const downloadPlayerPerformancesCsv = (session: SessionData) => {
    const totals = new Map(getSessionTotals(session).map((player) => [player.username, player]));
    const rows: (string | number)[][] = [[
        'Match ID', 'Date', 'Court', 'Format', 'Player', 'Side',
        'Points scored', 'Points conceded', 'Won match',
        'Session games', 'Session wins', 'Session points scored', 'Session points conceded'
    ]];
    session.matches.filter((match) => match.status === 'finished').forEach((match) => {
        const teams = [
            {
                side: 'Side 1',
                players: (match.isDoubles ? [match.player1, match.player2] : [match.player1])
                    .filter((name): name is string => Boolean(name)),
                pointsFor: match.score.team1,
                pointsAgainst: match.score.team2,
                won: match.winnerTeam === 'team1'
            },
            {
                side: 'Side 2',
                players: (match.isDoubles ? [match.player3, match.player4] : [match.player2])
                    .filter((name): name is string => Boolean(name)),
                pointsFor: match.score.team2,
                pointsAgainst: match.score.team1,
                won: match.winnerTeam === 'team2'
            }
        ];
        teams.forEach((team) => team.players.forEach((username) => {
            const playerTotals = totals.get(username);
            rows.push([
                match.matchId,
                match.startTime ? new Date(match.startTime).toISOString() : '',
                match.court,
                match.isDoubles ? 'Doubles' : 'Singles',
                username,
                team.side,
                team.pointsFor,
                team.pointsAgainst,
                team.won ? 'Yes' : 'No',
                playerTotals?.games ?? 0,
                playerTotals?.wins ?? 0,
                playerTotals?.pointsFor ?? 0,
                playerTotals?.pointsAgainst ?? 0
            ]);
        }));
    });
    downloadCsv(session, 'player-performances', rows);
};

const OrganiserPanel = ({ onLogout, onBackToDashboard }: OrganiserPanelProps) => {
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
    const [lineupEdits, setLineupEdits] = useState<Record<string, MatchLineup>>({});
    const [scoreEdits, setScoreEdits] = useState<Record<string, { team1: string; team2: string }>>({});
    const [winnerEdits, setWinnerEdits] = useState<Record<string, 'team1' | 'team2'>>({});

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
            setScreen('summary');
        } catch (requestError) {
            setError(getErrorMessage(requestError));
        } finally {
            setBusy(false);
        }
    };

    const saveLineup = async (match: SessionMatch): Promise<SessionData | null> => {
        if (!selectedSession) return null;
        const lineup = lineupEdits[match.matchId] ?? getLineup(match);
        const otherPlayingPlayers = selectedSession.matches.some((other) =>
            other.matchId !== match.matchId && other.status === 'ongoing' &&
            [other.player1, other.player2, other.player3, other.player4].some((username) => Boolean(username && lineup.includes(username)))
        );
        if (otherPlayingPlayers && !window.confirm('This lineup moves a player out of another live match, leaving that match with a vacant spot. Continue?')) {
            return null;
        }

        const updated = await apiRequest<SessionData>(`/sessions/${selectedSession._id}/matches/${match.matchId}/players`, {
            method: 'PATCH',
            body: JSON.stringify({ lineup })
        });
        upsertSession(updated);
        setLineupEdits((current) => {
            const next = { ...current };
            delete next[match.matchId];
            return next;
        });
        return updated;
    };

    const startProposedMatch = async (match: SessionMatch) => {
        if (!selectedSession) return;
        setBusy(true);
        setError('');
        try {
            if (lineupEdits[match.matchId]) {
                const updatedLineup = await saveLineup(match);
                if (!updatedLineup) return;
            }
            const updated = await apiRequest<SessionData>(`/sessions/${selectedSession._id}/matches/${match.matchId}/start`, {
                method: 'POST'
            });
            upsertSession(updated);
        } catch (requestError) {
            setError(getErrorMessage(requestError));
        } finally {
            setBusy(false);
        }
    };

    const finishLiveMatch = async (match: SessionMatch) => {
        if (!selectedSession) return;
        const score = scoreEdits[match.matchId] ?? {
            team1: String(match.score.team1),
            team2: String(match.score.team2)
        };
        const winnerTeam = winnerEdits[match.matchId] ?? match.winnerTeam;
        if (!winnerTeam) {
            setError('Choose the winning side before ending the match.');
            return;
        }
        setBusy(true);
        setError('');
        try {
            const updated = await apiRequest<SessionData>(`/sessions/${selectedSession._id}/matches/${match.matchId}/finish`, {
                method: 'POST',
                body: JSON.stringify({ team1: Number(score.team1), team2: Number(score.team2), winnerTeam })
            });
            upsertSession(updated);
            setScoreEdits((current) => {
                const next = { ...current };
                delete next[match.matchId];
                return next;
            });
            setWinnerEdits((current) => {
                const next = { ...current };
                delete next[match.matchId];
                return next;
            });
            setLineupEdits((current) => {
                const next = { ...current };
                delete next[match.matchId];
                return next;
            });
        } catch (requestError) {
            setError(getErrorMessage(requestError));
        } finally {
            setBusy(false);
        }
    };

    const statusOf = (session: SessionData): string =>
        session.status ?? (session.isActive ? 'active' : 'completed');
    const proposedMatches = selectedSession?.matches.filter((match) => match.status === 'proposed') ?? [];
    const courtMatches = selectedSession?.matches.filter((match) => match.status !== 'finished') ?? [];
    const playingNames = new Set(courtMatches.flatMap((match) =>
        [match.player1, match.player2, match.player3, match.player4].filter((name): name is string => Boolean(name))
    ));
    const waitingPlayers = selectedSession?.players.filter((player) => !playingNames.has(player.username)) ?? [];
    const sessionTotals = selectedSession ? getSessionTotals(selectedSession) : [];
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
                <div className="organiser-actions">
                    {onBackToDashboard && (
                        <button className="organiser-button secondary" type="button" onClick={onBackToDashboard}>Player dashboard</button>
                    )}
                    <button className="organiser-button secondary" type="button" onClick={onLogout}>Log out</button>
                </div>
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
                                    setScreen(statusOf(session) === 'active' ? 'live' : statusOf(session) === 'completed' ? 'summary' : 'details');
                                }}>
                                    <span>
                                        <strong>{session.title}</strong>
                                        <small>{formatSessionSchedule(session.scheduledAt, session.endsAt)}{session.venue ? ` · ${session.venue}` : ''}</small>
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
                            <p>{formatSessionSchedule(selectedSession.scheduledAt, selectedSession.endsAt)}{selectedSession.venue ? ` · ${selectedSession.venue}` : ''}</p>
                        </div>
                        <span className={`organiser-status status-${statusOf(selectedSession)}`}>{statusOf(selectedSession)}</span>
                    </div>
                    <p className="organiser-detail-line"><strong>Players:</strong> {selectedSession.players.length} · <strong>Matches:</strong> {selectedSession.matches.length}</p>
                    {statusOf(selectedSession) === 'scheduled' && (
                        <div className="organiser-actions">
                            <button className="organiser-button secondary" type="button" onClick={openEditForm}>Edit session</button>
                            <button className="organiser-button" type="button" onClick={beginSessionSetup}>Start session</button>
                        </div>
                    )}
                    {statusOf(selectedSession) === 'completed' && (
                        <div className="organiser-actions">
                            <button className="organiser-button" type="button" onClick={() => setScreen('summary')}>View session summary</button>
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
                        <div><span className="organiser-eyebrow">LIVE SESSION</span><h2>{selectedSession.title}</h2><p>{formatSessionSchedule(selectedSession.scheduledAt, selectedSession.endsAt)}</p></div>
                        <button className="organiser-button danger" type="button" disabled={busy} onClick={() => void endSession()}>End session</button>
                    </div>
                    <div className="organiser-court-grid live">
                        {courts.map((format, index) => {
                            const match = courtMatches.find((item) => item.court === index + 1);
                            if (!match) {
                                return <CourtDiagram key={index} number={index + 1} format={format as Format} />;
                            }
                            const fields = match.isDoubles
                                ? ['player1', 'player2', 'player3', 'player4'] as const
                                : ['player1', 'player2'] as const;
                            const lineup = lineupEdits[match.matchId] ?? getLineup(match);
                            const score = scoreEdits[match.matchId] ?? {
                                team1: String(match.score.team1),
                                team2: String(match.score.team2)
                            };
                            const winnerTeam = winnerEdits[match.matchId] ?? match.winnerTeam ?? '';
                            const team1 = (match.isDoubles ? [lineup[0], lineup[1]] : [lineup[0]])
                                .filter(Boolean).join(' & ') || 'Team 1';
                            const team2 = (match.isDoubles ? [lineup[2], lineup[3]] : [lineup[1]])
                                .filter(Boolean).join(' & ') || 'Team 2';
                            return (
                                <div className="organiser-live-court" key={index}>
                                    <CourtDiagram number={index + 1} format={format as Format} match={match} />
                                    <div className="organiser-match-controls">
                                        {match.status === 'proposed' ? (
                                            <div className="organiser-proposal-note">
                                                <strong>Proposed next match</strong>
                                                <span>{match.awaitingNextFinish && !match.manualOverride
                                                    ? 'This lineup repeats a recent pairing. It will unlock after another match finishes, or you can edit the players to approve it manually.'
                                                    : 'Review or edit the lineup, then approve to start.'}</span>
                                            </div>
                                        ) : (
                                            <div className="organiser-score-entry">
                                                <label>{team1} points
                                                    <input type="number" min="0" step="1" value={score.team1} onChange={(event) => setScoreEdits((current) => ({ ...current, [match.matchId]: { ...score, team1: event.target.value } }))} />
                                                </label>
                                                <label>{team2} points
                                                    <input type="number" min="0" step="1" value={score.team2} onChange={(event) => setScoreEdits((current) => ({ ...current, [match.matchId]: { ...score, team2: event.target.value } }))} />
                                                </label>
                                                <label className="organiser-winner-select">Winning side
                                                    <select value={winnerTeam} onChange={(event) => setWinnerEdits((current) => ({ ...current, [match.matchId]: event.target.value as 'team1' | 'team2' }))}>
                                                        <option value="">Select winner</option>
                                                        <option value="team1">{team1}</option>
                                                        <option value="team2">{team2}</option>
                                                    </select>
                                                </label>
                                            </div>
                                        )}
                                        <details className="organiser-lineup-editor">
                                            <summary>{match.status === 'proposed' ? 'Edit proposed players' : 'Edit or remove players'}</summary>
                                            <div className="organiser-form compact">
                                                {fields.map((field, playerIndex) => (
                                                    <label key={field}>Player {playerIndex + 1}
                                                        <select value={lineup[playerIndex] ?? ''} onChange={(event) => {
                                                            const next = [...lineup] as MatchLineup;
                                                            next[playerIndex] = event.target.value;
                                                            setLineupEdits((current) => ({ ...current, [match.matchId]: next }));
                                                        }}>
                                                            <option value="">Vacant</option>
                                                            {selectedSession.players
                                                                .filter((player) => !player.preferredFormat || player.preferredFormat === (match.isDoubles ? 'doubles' : 'singles'))
                                                                .map((player) => (
                                                                <option key={player.username} value={player.username}>{player.username}{player.preferredFormat ? ` · ${player.preferredFormat}` : ''}</option>
                                                            ))}
                                                        </select>
                                                    </label>
                                                ))}
                                                <button className="organiser-button secondary" type="button" disabled={busy} onClick={async () => {
                                                    setBusy(true);
                                                    setError('');
                                                    try {
                                                        await saveLineup(match);
                                                    } catch (requestError) {
                                                        setError(getErrorMessage(requestError));
                                                    } finally {
                                                        setBusy(false);
                                                    }
                                                }}>Save lineup</button>
                                            </div>
                                        </details>
                                        {match.status === 'proposed' ? (
                                            <button className="organiser-button" type="button" disabled={
                                                busy ||
                                                lineup.slice(0, fields.length).some((name) => !name) ||
                                                (Boolean(match.awaitingNextFinish) && !match.manualOverride && !lineupEdits[match.matchId])
                                            } onClick={() => void startProposedMatch(match)}>
                                                {busy ? 'Starting…' : 'Approve & start match'}
                                            </button>
                                        ) : (
                                            <button className="organiser-button" type="button" disabled={busy || !winnerTeam || score.team1 === '' || score.team2 === ''} onClick={() => void finishLiveMatch(match)}>
                                                {busy ? 'Saving…' : 'Save score & end match'}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    {proposedMatches.length > 0 && <p className="organiser-help">Approve each proposed match when its players and court are ready.</p>}
                    {!courtMatches.length && <p className="organiser-muted">No match is currently proposed. Add waiting players who match a court preference to generate the next proposal.</p>}
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
                    <section className="organiser-subcard">
                        <h3>Completed matches · {selectedSession.matches.filter((match) => match.status === 'finished').length}</h3>
                        {selectedSession.matches.filter((match) => match.status === 'finished').map((match) => (
                            <div className="organiser-roster-row" key={match.matchId}>
                                <span>
                                    <strong>Court {match.court} · {match.isDoubles ? 'Doubles' : 'Singles'} · {match.score.team1}–{match.score.team2}</strong>
                                    <small>{[match.player1, match.player2, match.player3, match.player4].filter(Boolean).join(' · ')} · Winner: {match.winner}</small>
                                </span>
                            </div>
                        ))}
                        {!selectedSession.matches.some((match) => match.status === 'finished') && <p className="organiser-muted">No completed matches yet.</p>}
                    </section>
                </section>
            )}

            {!formMode && screen === 'summary' && selectedSession && (
                <section className="organiser-card">
                    <button className="organiser-back" type="button" onClick={() => setScreen('sessions')}>← All sessions</button>
                    <div className="organiser-section-heading">
                        <div><span className="organiser-eyebrow">SESSION SUMMARY</span><h2>{selectedSession.title}</h2><p>{formatSessionSchedule(selectedSession.scheduledAt, selectedSession.endsAt)} · {selectedSession.matches.filter((match) => match.status === 'finished').length} completed matches</p></div>
                        <div className="organiser-actions">
                            <button className="organiser-button secondary" type="button" onClick={() => downloadMatchSummariesCsv(selectedSession)}>Download match summaries CSV</button>
                            <button className="organiser-button" type="button" onClick={() => downloadPlayerPerformancesCsv(selectedSession)}>Download player performances CSV</button>
                        </div>
                    </div>
                    <section className="organiser-subcard">
                        <h3>Player totals</h3>
                        <div className="organiser-summary-table-wrap">
                            <table className="organiser-summary-table">
                                <thead><tr><th>Player</th><th>Games</th><th>Wins</th><th>Points for</th><th>Points against</th></tr></thead>
                                <tbody>
                                    {sessionTotals.map((player) => (
                                        <tr key={player.username}>
                                            <td>{player.username}</td><td>{player.games}</td><td>{player.wins}</td><td>{player.pointsFor}</td><td>{player.pointsAgainst}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>
                    <section className="organiser-subcard">
                        <h3>Match-by-match results</h3>
                        <div className="organiser-summary-matches">
                            {selectedSession.matches.filter((match) => match.status === 'finished').map((match) => (
                                <article className="organiser-summary-match" key={match.matchId}>
                                    <strong>Court {match.court} · {match.isDoubles ? 'Doubles' : 'Singles'} · {match.score.team1}–{match.score.team2}</strong>
                                    <span>
                                        {(match.isDoubles ? [match.player1, match.player2] : [match.player1]).filter(Boolean).join(' & ')}
                                        {' vs '}
                                        {(match.isDoubles ? [match.player3, match.player4] : [match.player2]).filter(Boolean).join(' & ')}
                                    </span>
                                    <small>Winner: {match.winner}{match.startTime ? ` · ${new Date(match.startTime).toLocaleString()}` : ''}</small>
                                </article>
                            ))}
                        </div>
                        {!selectedSession.matches.some((match) => match.status === 'finished') && <p className="organiser-muted">No completed matches to summarize.</p>}
                    </section>
                </section>
            )}
        </main>
    );
};

export default OrganiserPanel;
