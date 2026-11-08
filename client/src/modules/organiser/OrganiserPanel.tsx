import { useEffect, useState, type FormEvent } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import type { SessionData, SessionMatch, SessionPlayer } from '../../types/domain';
import './organiser.css';

type Format = 'singles' | 'doubles';
type PlayerKind = 'account' | 'guest';
type Screen = 'sessions' | 'details' | 'setup' | 'live' | 'summary' | 'player-stats' | 'clubs' | 'club-settings';
type MatchLineup = [string, string, string?, string?];

interface PlayerAccount {
    username: string;
    age?: number;
    level?: string;
    rating: number;
}

interface OrganiserClub {
    id: string;
    name: string;
    isDefault: boolean;
    hasInviteCode: boolean;
    allowedFormats: Format[];
    defaultFormat: Format;
    sessionCount: number;
    memberCount: number;
    inviteCode?: string;
}

interface SessionQr {
    sessionId: string;
    code: string;
}

interface ClubMember {
    userId: string;
    username: string;
    age?: number;
    level?: string;
    rating: number;
}

interface PlayerLifetimeMatch {
    sessionId: string;
    sessionTitle: string;
    matchId: string;
    date?: string | Date;
    court: number;
    isDoubles: boolean;
    side: string;
    teammates: string;
    opponents: string;
    pointsFor: number;
    pointsAgainst: number;
    won: boolean;
    eloBefore?: number;
    eloAfter?: number;
}

interface OrganiserPlayerStats {
    rank: number;
    username: string;
    rating: number;
    games: number;
    wins: number;
    losses: number;
    winRate: number;
    pointsFor: number;
    pointsAgainst: number;
    pointDifference: number;
    matches: PlayerLifetimeMatch[];
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

const formatElapsedDuration = (start: string | Date | number | undefined, now: number): string => {
    if (start === undefined || start === 0 || !now) return '00:00';
    const startTime = typeof start === 'number' ? start : new Date(start).getTime();
    if (!Number.isFinite(startTime)) return '00:00';

    const elapsedSeconds = Math.max(0, Math.floor((now - startTime) / 1000));
    const hours = Math.floor(elapsedSeconds / 3600);
    const minutes = Math.floor((elapsedSeconds % 3600) / 60);
    const seconds = elapsedSeconds % 60;
    return hours > 0
        ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
        : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const getSessionStartTime = (session: SessionData): number | undefined => {
    const matchStartTimes = session.matches
        .map((match) => match.startTime ? new Date(match.startTime).getTime() : Number.NaN)
        .filter(Number.isFinite);
    return matchStartTimes.length ? Math.min(...matchStartTimes) : undefined;
};

const getErrorMessage = (error: unknown): string =>
    error instanceof Error ? error.message : 'Something went wrong. Please try again.';

const getSessionJoinUrl = (sessionId: string, code: string): string => {
    const joinUrl = new URL('/', window.location.origin);
    joinUrl.searchParams.set('joinSession', sessionId);
    joinUrl.searchParams.set('code', code);
    return joinUrl.toString();
};

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

const compareSessionTotals = (a: PlayerSessionTotals, b: PlayerSessionTotals): number =>
    b.wins - a.wins ||
    (b.pointsFor - b.pointsAgainst) - (a.pointsFor - a.pointsAgainst) ||
    b.pointsFor - a.pointsFor ||
    a.username.localeCompare(b.username);

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
    return [...totals.values()].sort(compareSessionTotals);
};

const downloadSessionRankingsCsv = (session: SessionData) => {
    const totals = getSessionTotals(session);
    const rows: (string | number)[][] = [[
        'Session rank', 'Player', 'Games', 'Wins', 'Points for', 'Points against', 'Point difference'
    ]];
    let rank = 0;
    let previousPerformance = '';
    totals.forEach((player, index) => {
        const performance = `${player.wins}:${player.pointsFor - player.pointsAgainst}:${player.pointsFor}`;
        if (performance !== previousPerformance) rank = index + 1;
        rows.push([
            rank,
            player.username,
            player.games,
            player.wins,
            player.pointsFor,
            player.pointsAgainst,
            player.pointsFor - player.pointsAgainst
        ]);
        previousPerformance = performance;
    });
    downloadCsv(session, 'session-rankings', rows);
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

const downloadOrganiserCsv = (filename: string, rows: (string | number)[][]) => {
    const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\r\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
};

const downloadPlayerStatsCsv = (players: OrganiserPlayerStats[]) => {
    const rows: (string | number)[][] = [[
        'Rank', 'Player', 'ELO', 'Games', 'Wins', 'Losses', 'Win rate',
        'Points scored', 'Points conceded', 'Point difference'
    ]];
    players.forEach((player) => rows.push([
        player.rank,
        player.username,
        player.rating,
        player.games,
        player.wins,
        player.losses,
        `${player.winRate}%`,
        player.pointsFor,
        player.pointsAgainst,
        player.pointDifference
    ]));
    const date = new Date().toISOString().slice(0, 10);
    downloadOrganiserCsv(`organiser-player-stats-${date}.csv`, rows);
};

const downloadPlayerLifetimeCsv = (player: OrganiserPlayerStats) => {
    const rows: (string | number)[][] = [[
        'Player', 'Current ELO', 'Career games', 'Career wins', 'Career losses', 'Win rate',
        'Lifetime points scored', 'Lifetime points conceded', 'Point difference',
        'Session', 'Date', 'Match ID', 'Format', 'Court', 'Side', 'Teammates', 'Opponents',
        'Points scored', 'Points conceded', 'Result', 'ELO before match', 'ELO after match'
    ]];
    if (!player.matches.length) {
        rows.push([
            player.username, player.rating, player.games, player.wins, player.losses, `${player.winRate}%`,
            player.pointsFor, player.pointsAgainst, player.pointDifference,
            '', '', '', '', '', '', '', '', '', '', '', ''
        ]);
    } else {
        player.matches.forEach((match, index) => {
            const firstMatch = index === 0;
            rows.push([
                firstMatch ? player.username : '',
                firstMatch ? player.rating : '',
                firstMatch ? player.games : '',
                firstMatch ? player.wins : '',
                firstMatch ? player.losses : '',
                firstMatch ? `${player.winRate}%` : '',
                firstMatch ? player.pointsFor : '',
                firstMatch ? player.pointsAgainst : '',
                firstMatch ? player.pointDifference : '',
                match.sessionTitle,
                match.date ? new Date(match.date).toISOString() : '',
                match.matchId,
                match.isDoubles ? 'Doubles' : 'Singles',
                match.court,
                match.side,
                match.teammates,
                match.opponents,
                match.pointsFor,
                match.pointsAgainst,
                match.won ? 'Win' : 'Loss',
                match.eloBefore ?? '',
                match.eloAfter ?? ''
            ]);
        });
    }
    const safeUsername = player.username.replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '') || 'player';
    downloadOrganiserCsv(`${safeUsername}-lifetime-match-history.csv`, rows);
};

const downloadMatchSummariesCsv = (session: SessionData) => {
    const rankedPlayers = getSessionTotals(session);
    const playerRanks = new Map(rankedPlayers.map((player, index) => [player.username, index + 1]));
    const matchRows: { winnerRank: number; row: (string | number)[] }[] = [];
    session.matches.filter((match) => match.status === 'finished').forEach((match) => {
        const team1 = (match.isDoubles ? [match.player1, match.player2] : [match.player1])
            .filter((name): name is string => Boolean(name));
        const team2 = (match.isDoubles ? [match.player3, match.player4] : [match.player2])
            .filter((name): name is string => Boolean(name));
        const winnerNames = match.winnerTeam === 'team1' || team1.includes(match.winnerTeam ?? '')
            ? team1
            : team2;
        const winnerRank = Math.min(...winnerNames.map((username) => playerRanks.get(username) ?? Number.MAX_SAFE_INTEGER));
        matchRows.push({
            winnerRank,
            row: [
                match.matchId,
                match.startTime ? new Date(match.startTime).toISOString() : '',
                match.court,
                match.isDoubles ? 'Doubles' : 'Singles',
                team1.join(' & '),
                team2.join(' & '),
                match.score.team1,
                match.score.team2,
                match.winner ?? '',
                winnerRank === Number.MAX_SAFE_INTEGER ? '' : winnerRank
            ]
        });
    });
    matchRows.sort((a, b) => a.winnerRank - b.winnerRank);
    const rows: (string | number)[][] = [[
        'Match ID', 'Date', 'Court', 'Format', 'Side 1 players', 'Side 2 players',
        'Side 1 points', 'Side 2 points', 'Winner', 'Winner session rank'
    ], ...matchRows.map((entry) => entry.row)];
    downloadCsv(session, 'match-summaries', rows);
};

const downloadPlayerPerformancesCsv = (session: SessionData) => {
    const rankedPlayers = getSessionTotals(session);
    const playerRanks = new Map(rankedPlayers.map((player, index) => [player.username, index]));
    const performanceRows: { username: string; row: (string | number)[] }[] = [];
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
            const playerTotals = rankedPlayers.find((item) => item.username === username);
            performanceRows.push({
                username,
                row: [
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
                ]
            });
        }));
    });
    performanceRows.sort((a, b) =>
        (playerRanks.get(a.username) ?? Number.MAX_SAFE_INTEGER) -
        (playerRanks.get(b.username) ?? Number.MAX_SAFE_INTEGER) ||
        a.username.localeCompare(b.username)
    );
    const rows: (string | number)[][] = [[
        'Match ID', 'Date', 'Court', 'Format', 'Player', 'Side',
        'Points scored', 'Points conceded', 'Won match',
        'Session games', 'Session wins', 'Session points scored', 'Session points conceded'
    ]];
    rows.push(...performanceRows.map((entry) => entry.row));
    downloadCsv(session, 'player-performances', rows);
};

const OrganiserPanel = ({ onLogout, onBackToDashboard }: OrganiserPanelProps) => {
    const [screen, setScreen] = useState<Screen>('clubs');
    const [clubs, setClubs] = useState<OrganiserClub[]>([]);
    const [selectedClubId, setSelectedClubId] = useState('');
    const [pendingMembers, setPendingMembers] = useState<ClubMember[]>([]);
    const [approvedMembers, setApprovedMembers] = useState<ClubMember[]>([]);
    const [editingClubId, setEditingClubId] = useState('');
    const [newClubName, setNewClubName] = useState('');
    const [clubNameDraft, setClubNameDraft] = useState('');
    const [allowedFormatsDraft, setAllowedFormatsDraft] = useState<Format[]>(['singles', 'doubles']);
    const [defaultFormatDraft, setDefaultFormatDraft] = useState<Format>('singles');
    const [inviteCode, setInviteCode] = useState('');
    const [sessions, setSessions] = useState<SessionData[]>([]);
    const [selectedSession, setSelectedSession] = useState<SessionData | null>(null);
    const [sessionQr, setSessionQr] = useState<SessionQr | null>(null);
    const [playerAccounts, setPlayerAccounts] = useState<PlayerAccount[]>([]);
    const [playerStats, setPlayerStats] = useState<OrganiserPlayerStats[]>([]);
    const [playerStatsLoading, setPlayerStatsLoading] = useState(false);
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
    const [notice, setNotice] = useState('');
    const [lineupEdits, setLineupEdits] = useState<Record<string, MatchLineup>>({});
    const [scoreEdits, setScoreEdits] = useState<Record<string, { team1: string; team2: string }>>({});
    const [winnerEdits, setWinnerEdits] = useState<Record<string, 'team1' | 'team2'>>({});
    const [clockNow, setClockNow] = useState(0);
    const [liveSessionStartedAt, setLiveSessionStartedAt] = useState<Record<string, number>>({});
    const selectedSessionId = selectedSession?._id;
    const selectedClub = clubs.find((club) => club.id === selectedClubId);
    const fixedClubFormat = selectedClub?.allowedFormats.length === 1 ? selectedClub.allowedFormats[0] : undefined;

    useEffect(() => {
        let cancelled = false;
        const loadClubs = async () => {
            try {
                const clubData = await apiRequest<OrganiserClub[]>('/clubs');
                if (!cancelled) {
                    setClubs(clubData);
                    setSelectedClubId(clubData[0]?.id ?? '');
                    setClubNameDraft(clubData[0]?.name ?? '');
                    setAllowedFormatsDraft(clubData[0]?.allowedFormats ?? ['singles', 'doubles']);
                    setDefaultFormatDraft(clubData[0]?.defaultFormat ?? 'singles');
                    if (!clubData.length) setLoading(false);
                }
            } catch (requestError) {
                if (!cancelled) setError(getErrorMessage(requestError));
                if (!cancelled) setLoading(false);
            }
        };
        void loadClubs();
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (!selectedClubId) return;
        let cancelled = false;
        const loadClubData = async () => {
            setLoading(true);
            try {
                const query = `?clubId=${encodeURIComponent(selectedClubId)}`;
                const [sessionData, accountData, pendingData, approvedData] = await Promise.all([
                    apiRequest<SessionData[]>(`/sessions${query}`),
                    apiRequest<PlayerAccount[]>(`/players${query}`),
                    apiRequest<ClubMember[]>(`/clubs/${selectedClubId}/members?status=pending`),
                    apiRequest<ClubMember[]>(`/clubs/${selectedClubId}/members?status=approved`)
                ]);
                if (!cancelled) {
                    setSessions(sessionData);
                    setPlayerAccounts(accountData);
                    setPendingMembers(pendingData);
                    setApprovedMembers(approvedData);
                }
            } catch (requestError) {
                if (!cancelled) setError(getErrorMessage(requestError));
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        void loadClubData();
        return () => {
            cancelled = true;
        };
    }, [selectedClubId]);

    useEffect(() => {
        if (screen !== 'live') return;
        const interval = window.setInterval(() => setClockNow(Date.now()), 1000);
        return () => window.clearInterval(interval);
    }, [screen]);

    useEffect(() => {
        if (screen !== 'live' || !selectedClubId || !selectedSessionId) return;
        let cancelled = false;
        let refreshing = false;
        const refreshLiveSession = async () => {
            if (refreshing) return;
            refreshing = true;
            try {
                const latestSessions = await apiRequest<SessionData[]>(
                    `/sessions?clubId=${encodeURIComponent(selectedClubId)}`
                );
                const latestSession = latestSessions.find((session) => session._id === selectedSessionId);
                if (!latestSession) throw new Error('This live session is no longer available.');
                if (cancelled) return;
                setSelectedSession(latestSession);
                setSessions((current) => current.map((session) =>
                    session._id === latestSession._id ? latestSession : session
                ));
            } catch (requestError) {
                if (!cancelled) setError(getErrorMessage(requestError));
            } finally {
                refreshing = false;
            }
        };

        void refreshLiveSession();
        const interval = window.setInterval(() => void refreshLiveSession(), 5000);
        return () => {
            cancelled = true;
            window.clearInterval(interval);
        };
    }, [screen, selectedClubId, selectedSessionId]);

    const upsertSession = (updated: SessionData) => {
        setSelectedSession(updated);
        setSessions((current) => [updated, ...current.filter((session) => session._id !== updated._id)]);
    };

    const openPlayerStats = async () => {
        if (!selectedClubId) return;
        setScreen('player-stats');
        setPlayerStatsLoading(true);
        setError('');
        try {
            const stats = await apiRequest<OrganiserPlayerStats[]>(`/player-stats?clubId=${encodeURIComponent(selectedClubId)}`);
            setPlayerStats(stats);
        } catch (requestError) {
            setError(getErrorMessage(requestError));
        } finally {
            setPlayerStatsLoading(false);
        }
    };

    const changeActiveClub = (clubId: string) => {
        setSelectedClubId(clubId);
        const club = clubs.find((item) => item.id === clubId);
        setClubNameDraft(club?.name ?? '');
        setAllowedFormatsDraft(club?.allowedFormats ?? ['singles', 'doubles']);
        setDefaultFormatDraft(club?.defaultFormat ?? 'singles');
        setSelectedSession(null);
        setFormMode(null);
        setInviteCode('');
        setScreen('sessions');
    };

    const createClub = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setBusy(true);
        setError('');
        setNotice('');
        try {
            const club = await apiRequest<OrganiserClub>('/clubs', {
                method: 'POST',
                body: JSON.stringify({ name: newClubName.trim() })
            });
            const createdClub = { ...club, sessionCount: 0, memberCount: 0 };
            setClubs((current) => [...current, createdClub].sort((a, b) =>
                Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name)
            ));
            setNewClubName('');
            setInviteCode(createdClub.inviteCode ?? '');
            setSelectedClubId(createdClub.id);
            setClubNameDraft(createdClub.name);
            setAllowedFormatsDraft(createdClub.allowedFormats);
            setDefaultFormatDraft(createdClub.defaultFormat);
            setNotice('Club created. Copy and share this invite code; it will not be shown again.');
        } catch (requestError) {
            setError(getErrorMessage(requestError));
        } finally {
            setBusy(false);
        }
    };

    const generateSessionQr = async () => {
        if (!selectedSession) return;
        setBusy(true);
        setError('');
        setNotice('');
        try {
            const result = await apiRequest<{ code: string }>(`/sessions/${selectedSession._id}/join-qr`, {
                method: 'POST'
            });
            setSessionQr({ sessionId: selectedSession._id, code: result.code });
            setNotice('Session QR generated. Any previous QR for this session has been disabled.');
        } catch (requestError) {
            setError(getErrorMessage(requestError));
        } finally {
            setBusy(false);
        }
    };

    const copySessionJoinLink = async () => {
        if (!sessionQr) return;
        try {
            await navigator.clipboard.writeText(getSessionJoinUrl(sessionQr.sessionId, sessionQr.code));
            setNotice('Session join link copied.');
        } catch {
            setError('Could not copy the join link. You can scan the QR code directly instead.');
        }
    };

    const renameClub = async (event: FormEvent<HTMLFormElement>, clubId = selectedClubId) => {
        event.preventDefault();
        if (!clubId) return;
        setBusy(true);
        setError('');
        setNotice('');
        try {
            const club = await apiRequest<OrganiserClub>(`/clubs/${clubId}`, {
                method: 'PATCH',
                body: JSON.stringify({ name: clubNameDraft.trim() })
            });
            setClubs((current) => current.map((item) => item.id === club.id ? { ...item, name: club.name } : item));
            setClubNameDraft(club.name);
            setEditingClubId('');
            setNotice('Club name updated.');
        } catch (requestError) {
            setError(getErrorMessage(requestError));
        } finally {
            setBusy(false);
        }
    };

    const deleteClub = async (club: OrganiserClub) => {
        if (club.sessionCount || club.memberCount) {
            setError('Delete the club’s sessions and remove its members before deleting the club.');
            return;
        }
        if (clubs.length <= 1) {
            setError('Create another club before deleting your last club.');
            return;
        }
        if (!window.confirm(`Delete "${club.name}"? This cannot be undone.`)) return;
        setBusy(true);
        setError('');
        setNotice('');
        try {
            await apiRequest<{ message: string }>(`/clubs/${club.id}`, { method: 'DELETE' });
            const remainingClubs = clubs.filter((item) => item.id !== club.id);
            setClubs(remainingClubs);
            setEditingClubId((current) => current === club.id ? '' : current);
            if (selectedClubId === club.id) {
                const nextClub = remainingClubs[0];
                setSelectedClubId(nextClub.id);
                setClubNameDraft(nextClub.name);
                setAllowedFormatsDraft(nextClub.allowedFormats);
                setDefaultFormatDraft(nextClub.defaultFormat);
                setSelectedSession(null);
                setScreen('clubs');
            }
            setNotice(`"${club.name}" was deleted.`);
        } catch (requestError) {
            setError(getErrorMessage(requestError));
        } finally {
            setBusy(false);
        }
    };

    const saveClubFormatSettings = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!selectedClubId) return;
        setBusy(true);
        setError('');
        setNotice('');
        try {
            const settings = await apiRequest<{ allowedFormats: Format[]; defaultFormat: Format }>(
                `/clubs/${selectedClubId}/settings`,
                {
                    method: 'PATCH',
                    body: JSON.stringify({
                        allowedFormats: allowedFormatsDraft,
                        defaultFormat: defaultFormatDraft
                    })
                }
            );
            setClubs((current) => current.map((club) =>
                club.id === selectedClubId ? { ...club, ...settings } : club
            ));
            setAllowedFormatsDraft(settings.allowedFormats);
            setDefaultFormatDraft(settings.defaultFormat);
            setCourtFormats((current) => current.map((format) =>
                settings.allowedFormats.includes(format) ? format : settings.defaultFormat
            ));
            setNotice('Club session format settings saved.');
        } catch (requestError) {
            setError(getErrorMessage(requestError));
        } finally {
            setBusy(false);
        }
    };

    const rotateClubInviteCode = async () => {
        if (!selectedClubId) return;
        setBusy(true);
        setError('');
        setNotice('');
        try {
            const result = await apiRequest<{ inviteCode: string }>(`/clubs/${selectedClubId}/invite-code`, { method: 'POST' });
            setInviteCode(result.inviteCode);
            setClubs((current) => current.map((club) =>
                club.id === selectedClubId ? { ...club, hasInviteCode: true } : club
            ));
            setNotice('Invite code rotated. The previous code is no longer valid.');
        } catch (requestError) {
            setError(getErrorMessage(requestError));
        } finally {
            setBusy(false);
        }
    };

    const approveClubMember = async (member: ClubMember) => {
        if (!selectedClubId) return;
        setBusy(true);
        setError('');
        setNotice('');
        try {
            await apiRequest<{ message: string }>(`/clubs/${selectedClubId}/members/${member.userId}/approve`, { method: 'PATCH' });
            const [pendingData, accountData, approvedData] = await Promise.all([
                apiRequest<ClubMember[]>(`/clubs/${selectedClubId}/members?status=pending`),
                apiRequest<PlayerAccount[]>(`/players?clubId=${encodeURIComponent(selectedClubId)}`),
                apiRequest<ClubMember[]>(`/clubs/${selectedClubId}/members?status=approved`)
            ]);
            setPendingMembers(pendingData);
            setPlayerAccounts(accountData);
            setApprovedMembers(approvedData);
            setNotice(`${member.username} approved for ${clubs.find((club) => club.id === selectedClubId)?.name ?? 'the club'}.`);
        } catch (requestError) {
            setError(getErrorMessage(requestError));
        } finally {
            setBusy(false);
        }
    };

    const removeClubMember = async (member: ClubMember) => {
        if (!selectedClubId) return;
        setBusy(true);
        setError('');
        setNotice('');
        try {
            await apiRequest<{ message: string }>(`/clubs/${selectedClubId}/members/${member.userId}`, { method: 'DELETE' });
            const [pendingData, accountData, approvedData] = await Promise.all([
                apiRequest<ClubMember[]>(`/clubs/${selectedClubId}/members?status=pending`),
                apiRequest<PlayerAccount[]>(`/players?clubId=${encodeURIComponent(selectedClubId)}`),
                apiRequest<ClubMember[]>(`/clubs/${selectedClubId}/members?status=approved`)
            ]);
            setPendingMembers(pendingData);
            setPlayerAccounts(accountData);
            setApprovedMembers(approvedData);
            setClubs((current) => current.map((club) =>
                club.id === selectedClubId ? { ...club, memberCount: Math.max(0, club.memberCount - 1) } : club
            ));
            setNotice(`${member.username} was removed from the club.`);
        } catch (requestError) {
            setError(getErrorMessage(requestError));
        } finally {
            setBusy(false);
        }
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
                venue: sessionForm.venue.trim(),
                ...(formMode === 'create' ? { clubId: selectedClubId } : {})
            };
            const updated = formMode === 'edit' && selectedSession
                ? await apiRequest<SessionData>(`/sessions/${selectedSession._id}`, { method: 'PATCH', body: JSON.stringify(body) })
                : await apiRequest<SessionData>('/sessions', { method: 'POST', body: JSON.stringify(body) });
            if (formMode === 'create') {
                setClubs((current) => current.map((club) =>
                    club.id === selectedClubId ? { ...club, sessionCount: club.sessionCount + 1 } : club
                ));
            }
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
        const defaultFormat = selectedClub?.defaultFormat ?? 'singles';
        setSelectedPlayers([]);
        setCourtFormats([defaultFormat]);
        setNewPlayer((current) => ({ ...current, preferredFormat: defaultFormat }));
        setNewGuest((current) => ({ ...current, preferredFormat: defaultFormat }));
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
            preferredFormat: fixedClubFormat ?? newGuest.preferredFormat,
            age: newGuest.age ? Number(newGuest.age) : undefined,
            level: newGuest.level
        }]);
        setNewGuest({ username: '', age: '', level: 'Beginner', preferredFormat: selectedClub?.defaultFormat ?? 'singles' });
        setError('');
    };

    const registerAndAddAccount = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setBusy(true);
        setError('');
        try {
            if (!selectedClubId) throw new Error('Select a club before registering a player.');
            const registeredPlayer = await apiRequest<PlayerAccount>(`/clubs/${selectedClubId}/players`, {
                method: 'POST',
                body: JSON.stringify({
                    username: newPlayer.username.trim(),
                    password: newPlayer.password,
                    age: newPlayer.age,
                    level: newPlayer.level
                })
            });
            setClubs((current) => current.map((club) =>
                club.id === selectedClubId ? { ...club, memberCount: club.memberCount + 1 } : club
            ));

            const selection: PlayerSelection = {
                username: registeredPlayer.username,
                kind: 'account',
                preferredFormat: fixedClubFormat ?? newPlayer.preferredFormat,
                age: registeredPlayer.age,
                level: registeredPlayer.level
            };
            const accounts = await apiRequest<PlayerAccount[]>(`/players?clubId=${encodeURIComponent(selectedClubId)}`);
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
            setNewPlayer({ username: '', password: '', age: '', level: 'Beginner', preferredFormat: selectedClub?.defaultFormat ?? 'singles' });
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
            setLiveSessionStartedAt((current) => ({ ...current, [updated._id]: Date.now() }));
            upsertSession(updated);
            setScreen('live');
        } catch (requestError) {
            setError(getErrorMessage(requestError));
        } finally {
            setBusy(false);
        }
    };

    const updateLiveCourtFormats = async (nextFormats: Format[]) => {
        if (!selectedSession) return;
        setBusy(true);
        setError('');
        try {
            const updated = await apiRequest<SessionData>(`/sessions/${selectedSession._id}/courts`, {
                method: 'PATCH',
                body: JSON.stringify({ courtFormats: nextFormats })
            });
            upsertSession(updated);
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
                    preferredFormat: fixedClubFormat ?? newGuest.preferredFormat,
                    age: newGuest.age ? Number(newGuest.age) : undefined,
                    level: newGuest.level
                })
            });
            upsertSession(updated);
            setNewGuest({ username: '', age: '', level: 'Beginner', preferredFormat: selectedClub?.defaultFormat ?? 'singles' });
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
        const preferredFormat = fixedClubFormat ?? String(formData.get('format') ?? selectedClub?.defaultFormat ?? 'singles') as Format;
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

    const deleteSession = async () => {
        if (!selectedSession || !['scheduled', 'completed'].includes(statusOf(selectedSession))) return;
        const isCompleted = statusOf(selectedSession) === 'completed';
        const confirmed = window.confirm(isCompleted
            ? `Delete "${selectedSession.title}" from your session history? Player lifetime ratings and match records will be preserved.`
            : `Delete the planned session "${selectedSession.title}"? This cannot be undone.`
        );
        if (!confirmed) return;

        setBusy(true);
        setError('');
        setNotice('');
        try {
            await apiRequest<{ message: string }>(`/sessions/${selectedSession._id}`, { method: 'DELETE' });
            setSessions((current) => current.filter((session) => session._id !== selectedSession._id));
            setClubs((current) => current.map((club) =>
                club.id === selectedClubId ? { ...club, sessionCount: Math.max(0, club.sessionCount - 1) } : club
            ));
            setSelectedSession(null);
            setScreen('sessions');
            setNotice(isCompleted
                ? 'Completed session deleted. Player lifetime records were preserved.'
                : 'Planned session deleted.'
            );
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
            team1: '',
            team2: ''
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
    const sessionStartedAt = selectedSession
        ? liveSessionStartedAt[selectedSession._id] ?? getSessionStartTime(selectedSession) ?? 0
        : 0;
    const sessionDuration = formatElapsedDuration(sessionStartedAt, clockNow);
    const sessionTotals = selectedSession ? getSessionTotals(selectedSession) : [];
    const courts = selectedSession?.courtFormats?.length
        ? selectedSession.courtFormats
        : Array.from({ length: selectedSession?.numCourts ?? 0 }, () => selectedSession?.isDoubles ? 'doubles' : 'singles');
    const waitingForOtherMatch = Boolean(
        selectedSession?.matches.some((match) => match.status === 'ongoing') &&
        proposedMatches.length === 0 &&
        courts.some((_, index) => !courtMatches.some((match) => match.court === index + 1))
    );
    const sessionJoinQrCard = selectedSession &&
        ['scheduled', 'active'].includes(statusOf(selectedSession)) && (
            <section className="organiser-subcard organiser-session-qr">
                <div className="organiser-section-heading">
                    <div>
                        <h3>Session QR code</h3>
                        <p>Players scan this to create an account or sign in, then they’re added to this session and its club.</p>
                    </div>
                    <button className="organiser-button secondary" type="button" disabled={busy} onClick={() => void generateSessionQr()}>
                        {busy ? 'Generating…' : 'Generate / replace QR'}
                    </button>
                </div>
                {sessionQr?.sessionId === selectedSession._id && (
                    <div className="organiser-session-qr-content">
                        <QRCodeSVG value={(() => {
                            return getSessionJoinUrl(sessionQr.sessionId, sessionQr.code);
                        })()} size={220} level="M" includeMargin />
                        <button className="organiser-button secondary" type="button" onClick={() => void copySessionJoinLink()}>
                            Copy session link
                        </button>
                        <p className="organiser-muted">Generating a replacement disables the previous QR. This QR works until the session is completed.</p>
                    </div>
                )}
            </section>
        );

    if (loading) {
        return <main className="organiser-shell"><p className="organiser-muted">Loading organiser workspace…</p></main>;
    }

    return (
        <main className="organiser-shell">
            <header className="organiser-topbar">
                <div>
                    <span className="organiser-eyebrow">COURT SYNC · ORGANISER</span>
                    <h1>{screen === 'clubs' ? 'Your clubs' : selectedClub ? `${selectedClub.name} sessions` : 'Session control'}</h1>
                    <p>{screen === 'clubs'
                        ? 'Create a club or choose one to manage.'
                        : screen === 'club-settings'
                            ? 'Manage this club’s members, invite code, and session settings.'
                            : 'Plan sessions, prepare courts, and manage players for this club.'}</p>
                </div>
                <div className="organiser-actions">
                    {onBackToDashboard && (
                        <button className="organiser-button secondary" type="button" onClick={onBackToDashboard}>Player dashboard</button>
                    )}
                    <button className="organiser-button secondary" type="button" onClick={onLogout}>Log out</button>
                </div>
            </header>

            {error && <div className="organiser-error" role="alert">{error}</div>}
            {notice && <div className="organiser-success" role="status">{notice}</div>}

            <nav className="organiser-workspace-nav" aria-label="Organiser sections" role="tablist">
                <button
                    id="organiser-matches-tab"
                    className={screen !== 'player-stats' && screen !== 'clubs' && screen !== 'club-settings' ? 'active' : ''}
                    type="button"
                    role="tab"
                    aria-selected={screen !== 'player-stats' && screen !== 'clubs' && screen !== 'club-settings'}
                    aria-controls="organiser-matches-panel"
                    onClick={() => setScreen('sessions')}
                >
                    Club sessions
                </button>
                <button
                    id="organiser-player-stats-tab"
                    className={screen === 'player-stats' ? 'active' : ''}
                    type="button"
                    role="tab"
                    aria-selected={screen === 'player-stats'}
                    aria-controls="organiser-player-stats-panel"
                    onClick={() => void openPlayerStats()}
                >
                    Player Stats
                </button>
                <button
                    id="organiser-clubs-tab"
                    className={screen === 'clubs' || screen === 'club-settings' ? 'active' : ''}
                    type="button"
                    role="tab"
                    aria-selected={screen === 'clubs' || screen === 'club-settings'}
                    aria-controls="organiser-clubs-panel"
                    onClick={() => setScreen('clubs')}
                >
                    Manage clubs
                </button>
            </nav>

            {screen === 'clubs' && (
                <section className="organiser-card" id="organiser-clubs-panel" role="tabpanel" aria-labelledby="organiser-clubs-tab">
                    <div className="organiser-section-heading">
                        <div>
                            <span className="organiser-eyebrow">YOUR ORGANISATION</span>
                            <h2>Clubs</h2>
                            <p>Choose a club to manage its sessions, or create a new club.</p>
                        </div>
                    </div>
                    <form className="organiser-form compact organiser-create-club" onSubmit={(event) => void createClub(event)}>
                        <label>New club name
                            <input
                                required
                                maxLength={80}
                                value={newClubName}
                                onChange={(event) => setNewClubName(event.target.value)}
                                placeholder="For example, Kingston Rec"
                            />
                        </label>
                        <button className="organiser-button" type="submit" disabled={busy}>
                            {busy ? 'Creating…' : 'Create club'}
                        </button>
                    </form>
                    {inviteCode && (
                        <div className="organiser-club-new-code" role="status">
                            <strong>New club invite code — copy and share it now:</strong>
                            <span>{inviteCode}</span>
                        </div>
                    )}
                    <div className="organiser-club-list">
                        {clubs.map((club) => (
                            <article className="organiser-club-card" key={club.id}>
                                {editingClubId === club.id ? (
                                    <form className="organiser-form compact organiser-club-card-rename" onSubmit={(event) => void renameClub(event, club.id)}>
                                        <label>Club name
                                            <input
                                                required
                                                maxLength={80}
                                                value={clubNameDraft}
                                                onChange={(event) => setClubNameDraft(event.target.value)}
                                            />
                                        </label>
                                        <div className="organiser-actions">
                                            <button className="organiser-button secondary" type="button" onClick={() => setEditingClubId('')}>Cancel</button>
                                            <button className="organiser-button" type="submit" disabled={busy || !clubNameDraft.trim()}>
                                                {busy ? 'Saving…' : 'Save name'}
                                            </button>
                                        </div>
                                    </form>
                                ) : (
                                    <>
                                        <div>
                                            <span className="organiser-eyebrow">{club.isDefault ? 'DEFAULT CLUB' : 'CLUB'}</span>
                                            <h3>{club.name}</h3>
                                            <p>{club.sessionCount} sessions · {club.memberCount} members</p>
                                            {(club.sessionCount > 0 || club.memberCount > 0) && (
                                                <small className="organiser-club-delete-help">
                                                    Delete its sessions and remove its members before deleting this club.
                                                </small>
                                            )}
                                        </div>
                                        <div className="organiser-club-card-actions">
                                            <button className="organiser-button" type="button" onClick={() => changeActiveClub(club.id)}>
                                                Enter club
                                            </button>
                                            <button className="organiser-button secondary" type="button" onClick={() => {
                                                setSelectedClubId(club.id);
                                                setClubNameDraft(club.name);
                                                setEditingClubId(club.id);
                                                setError('');
                                            }}>
                                                Rename
                                            </button>
                                            <button className="organiser-button secondary" type="button" onClick={() => {
                                                changeActiveClub(club.id);
                                                setScreen('club-settings');
                                            }}>
                                                Members & settings
                                            </button>
                                            <button
                                                className="organiser-button danger"
                                                type="button"
                                                disabled={busy || clubs.length <= 1 || club.sessionCount > 0 || club.memberCount > 0}
                                                title={clubs.length <= 1
                                                    ? 'Keep at least one club'
                                                    : club.sessionCount || club.memberCount
                                                        ? 'Remove this club’s sessions and members before deleting it'
                                                        : undefined}
                                                onClick={() => void deleteClub(club)}
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    </>
                                )}
                            </article>
                        ))}
                        {!clubs.length && <p className="organiser-muted">No clubs yet. Create one to start organising sessions.</p>}
                    </div>
                </section>
            )}

            {clubs.length > 0 && screen !== 'clubs' && (
                <div className="organiser-card organiser-club-context">
                    <label>Active club
                        <select
                            value={selectedClubId}
                            onChange={(event) => changeActiveClub(event.target.value)}
                        >
                            {clubs.map((club) => <option key={club.id} value={club.id}>{club.name}</option>)}
                        </select>
                    </label>
                </div>
            )}

            {screen === 'player-stats' && (
                <section className="organiser-card" id="organiser-player-stats-panel" role="tabpanel" aria-labelledby="organiser-player-stats-tab">
                    <div className="organiser-section-heading">
                        <div>
                            <span className="organiser-eyebrow">YOUR ORGANISER SESSIONS</span>
                            <h2>Player Stats</h2>
                            <p>Registered players ranked by current ELO, with results from your sessions.</p>
                        </div>
                        <button
                            className="organiser-button"
                            type="button"
                            disabled={!playerStats.length}
                            onClick={() => downloadPlayerStatsCsv(playerStats)}
                        >
                            Download leaderboard CSV
                        </button>
                    </div>
                    {playerStatsLoading ? (
                        <p className="organiser-muted">Loading player stats…</p>
                    ) : playerStats.length ? (
                        <div className="organiser-summary-table-wrap">
                            <table className="organiser-summary-table">
                                <thead>
                                    <tr>
                                        <th>Rank</th>
                                        <th>Player</th>
                                        <th>ELO</th>
                                        <th>Games</th>
                                        <th>Wins</th>
                                        <th>Losses</th>
                                        <th>Win rate</th>
                                        <th>Points for</th>
                                        <th>Points against</th>
                                        <th>Point diff.</th>
                                        <th>Lifetime record</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {playerStats.map((player) => (
                                        <tr key={player.username}>
                                            <td>{player.rank}</td>
                                            <td><strong>{player.username}</strong></td>
                                            <td>{player.rating}</td>
                                            <td>{player.games}</td>
                                            <td>{player.wins}</td>
                                            <td>{player.losses}</td>
                                            <td>{player.winRate}%</td>
                                            <td>{player.pointsFor}</td>
                                            <td>{player.pointsAgainst}</td>
                                            <td>{player.pointDifference}</td>
                                            <td>
                                                <button
                                                    className="organiser-button secondary"
                                                    type="button"
                                                    onClick={() => downloadPlayerLifetimeCsv(player)}
                                                >
                                                    Download CSV
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <p className="organiser-muted">No registered players have played in your sessions yet.</p>
                    )}
                </section>
            )}

            {screen === 'club-settings' && (
                <section className="organiser-card">
                    <button className="organiser-back" type="button" onClick={() => setScreen('clubs')}>← All clubs</button>
                    <div className="organiser-section-heading">
                        <div>
                            <span className="organiser-eyebrow">MEMBERSHIP AND ACCESS</span>
                            <h2>Club management</h2>
                            <p>Each session uses one club roster. Members need organiser approval before they appear in session setup.</p>
                        </div>
                    </div>
                    <div className="organiser-form-grid organiser-club-manager">
                        <label>Selected club
                            <select value={selectedClubId} onChange={(event) => {
                                setSelectedClubId(event.target.value);
                                const club = clubs.find((item) => item.id === event.target.value);
                                setClubNameDraft(club?.name ?? '');
                                setAllowedFormatsDraft(club?.allowedFormats ?? ['singles', 'doubles']);
                                setDefaultFormatDraft(club?.defaultFormat ?? 'singles');
                                setInviteCode('');
                            }}>
                                {clubs.map((club) => <option key={club.id} value={club.id}>{club.name}</option>)}
                            </select>
                        </label>
                    </div>

                    {selectedClubId && (
                        <>
                            <section className="organiser-subcard">
                                <div className="organiser-section-heading">
                                    <div>
                                        <h3>Session formats</h3>
                                        <p>Choose which formats this club uses and the default for new sessions.</p>
                                    </div>
                                </div>
                                <form className="organiser-form compact" onSubmit={(event) => void saveClubFormatSettings(event)}>
                                    <div className="organiser-club-format-options">
                                        {(['singles', 'doubles'] as const).map((format) => (
                                            <label key={format}>
                                                <input
                                                    type="checkbox"
                                                    checked={allowedFormatsDraft.includes(format)}
                                                    disabled={allowedFormatsDraft.length === 1 && allowedFormatsDraft.includes(format)}
                                                    onChange={(event) => {
                                                        const nextFormats = event.target.checked
                                                            ? [...allowedFormatsDraft, format]
                                                            : allowedFormatsDraft.filter((item) => item !== format);
                                                        setAllowedFormatsDraft(nextFormats);
                                                        if (!nextFormats.includes(defaultFormatDraft)) setDefaultFormatDraft(nextFormats[0]);
                                                    }}
                                                />
                                                {format === 'singles' ? 'Singles' : 'Doubles'}
                                            </label>
                                        ))}
                                    </div>
                                    <label>Default format
                                        <select value={defaultFormatDraft} onChange={(event) => setDefaultFormatDraft(event.target.value as Format)}>
                                            {allowedFormatsDraft.map((format) => (
                                                <option key={format} value={format}>{format === 'singles' ? 'Singles' : 'Doubles'}</option>
                                            ))}
                                        </select>
                                    </label>
                                    <button className="organiser-button secondary" type="submit" disabled={busy}>
                                        {busy ? 'Saving…' : 'Save format settings'}
                                    </button>
                                    {allowedFormatsDraft.length === 1 && (
                                        <p className="organiser-muted">This club will be {allowedFormatsDraft[0]}-only. Player preference choices will be hidden.</p>
                                    )}
                                </form>
                            </section>
                            <section className="organiser-subcard">
                                <div className="organiser-section-heading">
                                    <div>
                                        <h3>Invite code</h3>
                                        <p>Only a hashed version is stored. Rotating it invalidates the previous code.</p>
                                    </div>
                                    <button
                                        className="organiser-button secondary"
                                        type="button"
                                        disabled={busy}
                                        onClick={() => void rotateClubInviteCode()}
                                    >
                                        {clubs.find((club) => club.id === selectedClubId)?.hasInviteCode ? 'Rotate code' : 'Generate code'}
                                    </button>
                                </div>
                                {inviteCode ? (
                                    <p className="organiser-club-code" role="status">{inviteCode}</p>
                                ) : (
                                    <p className="organiser-muted">
                                        {clubs.find((club) => club.id === selectedClubId)?.hasInviteCode
                                            ? 'The current code is hidden. Rotate it to generate a new shareable code.'
                                            : 'Generate a code to let players request membership.'}
                                    </p>
                                )}
                            </section>
                            <section className="organiser-subcard">
                                <div className="organiser-section-heading">
                                    <div>
                                        <h3>Pending requests ({pendingMembers.length})</h3>
                                        <p>Approve a player to add them to this club’s session roster.</p>
                                    </div>
                                </div>
                                {pendingMembers.length ? (
                                    <div className="organiser-roster">
                                        {pendingMembers.map((member) => (
                                            <div className="organiser-roster-row" key={member.userId}>
                                                <span>
                                                    <strong>{member.username}</strong>
                                                    <small>{member.level ?? 'Player'} · ELO {member.rating}</small>
                                                </span>
                                                <button
                                                    className="organiser-button secondary"
                                                    type="button"
                                                    disabled={busy}
                                                    onClick={() => void approveClubMember(member)}
                                                >
                                                    Approve
                                                </button>
                                                <button
                                                    className="organiser-button danger"
                                                    type="button"
                                                    disabled={busy}
                                                    onClick={() => void removeClubMember(member)}
                                                >
                                                    Reject
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                ) : <p className="organiser-muted">There are no pending membership requests.</p>}
                            </section>
                            <section className="organiser-subcard">
                                <div className="organiser-section-heading">
                                    <div>
                                        <h3>Club members ({approvedMembers.length})</h3>
                                        <p>Remove members here before deleting the club.</p>
                                    </div>
                                </div>
                                {approvedMembers.length ? (
                                    <div className="organiser-roster">
                                        {approvedMembers.map((member) => (
                                            <div className="organiser-roster-row" key={member.userId}>
                                                <span>
                                                    <strong>{member.username}</strong>
                                                    <small>{member.level ?? 'Player'} · ELO {member.rating}</small>
                                                </span>
                                                <button
                                                    className="organiser-button danger"
                                                    type="button"
                                                    disabled={busy}
                                                    onClick={() => {
                                                        if (window.confirm(`Remove ${member.username} from this club?`)) {
                                                            void removeClubMember(member);
                                                        }
                                                    }}
                                                >
                                                    Remove
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                ) : <p className="organiser-muted">There are no approved members yet.</p>}
                            </section>
                        </>
                    )}
                </section>
            )}

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
                <section className="organiser-card" id="organiser-matches-panel" role="tabpanel" aria-labelledby="organiser-matches-tab">
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
                                    const sessionStatus = statusOf(session);
                                    if (sessionStatus === 'active') {
                                        setLiveSessionStartedAt((current) => current[session._id]
                                            ? current
                                            : { ...current, [session._id]: getSessionStartTime(session) ?? Date.now() });
                                    }
                                    setScreen(sessionStatus === 'active' ? 'live' : sessionStatus === 'completed' ? 'summary' : 'details');
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
                            <button className="organiser-button secondary" type="button" disabled={busy} onClick={() => void generateSessionQr()}>
                                Generate session QR
                            </button>
                            <button className="organiser-button secondary" type="button" onClick={openEditForm}>Edit session</button>
                            <button className="organiser-button" type="button" onClick={beginSessionSetup}>Start session</button>
                            <button className="organiser-button danger" type="button" disabled={busy} onClick={() => void deleteSession()}>
                                {busy ? 'Deleting…' : 'Delete planned session'}
                            </button>
                        </div>
                    )}
                    {statusOf(selectedSession) === 'completed' && (
                        <div className="organiser-actions">
                            <button className="organiser-button" type="button" onClick={() => setScreen('summary')}>View session summary</button>
                            <button className="organiser-button danger" type="button" disabled={busy} onClick={() => void deleteSession()}>
                                {busy ? 'Deleting…' : 'Delete completed session'}
                            </button>
                        </div>
                    )}
                </section>
            )}

            {!formMode && screen === 'details' && sessionJoinQrCard}

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
                                            <input type="checkbox" checked={Boolean(selection)} onChange={() => toggleAccount(account, selectedClub?.defaultFormat ?? 'singles')} />
                                            <span><strong>{account.username}</strong><small>Rating {account.rating}{account.level ? ` · ${account.level}` : ''}</small></span>
                                        </label>
                                        {selection && !fixedClubFormat && (
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
                                {!fixedClubFormat && <label>Preference<select value={newGuest.preferredFormat} onChange={(event) => setNewGuest({ ...newGuest, preferredFormat: event.target.value as Format })}>{selectedClub?.allowedFormats.map((format) => <option key={format} value={format}>{format === 'singles' ? 'Singles' : 'Doubles'}</option>)}</select></label>}
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
                                {!fixedClubFormat && <label>Preference<select value={newPlayer.preferredFormat} onChange={(event) => setNewPlayer({ ...newPlayer, preferredFormat: event.target.value as Format })}>{selectedClub?.allowedFormats.map((format) => <option key={format} value={format}>{format === 'singles' ? 'Singles' : 'Doubles'}</option>)}</select></label>}
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
                            <div><h3>Courts and formats</h3><p>{fixedClubFormat ? `All courts use ${fixedClubFormat}.` : 'Select between 1 and 6 courts and choose a format for each.'}</p></div>
                            <select className="organiser-court-count" aria-label="Number of courts" value={courtFormats.length} onChange={(event) => {
                                const count = Number(event.target.value);
                                setCourtFormats((current) => Array.from({ length: count }, (_, index) => current[index] ?? selectedClub?.defaultFormat ?? 'singles'));
                            }}>
                                {[1, 2, 3, 4, 5, 6].map((count) => <option key={count} value={count}>{count} {count === 1 ? 'court' : 'courts'}</option>)}
                            </select>
                        </div>
                        <div className="organiser-court-grid">
                            {courtFormats.map((format, index) => (
                                <div key={index} className="organiser-court-setup">
                                    <CourtDiagram number={index + 1} format={format} />
                                    {!fixedClubFormat && <label>Court {index + 1} format
                                        <select value={format} onChange={(event) => setCourtFormats((current) => current.map((value, courtIndex) => courtIndex === index ? event.target.value as Format : value))}>
                                            {selectedClub?.allowedFormats.map((allowedFormat) => (
                                                <option key={allowedFormat} value={allowedFormat}>{allowedFormat === 'singles' ? 'Singles' : 'Doubles'}</option>
                                            ))}
                                        </select>
                                    </label>}
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
                        <div>
                            <div className="organiser-live-indicator" role="status" aria-label={`Live session, elapsed ${sessionDuration}`}>
                                <span className="organiser-live-dot" aria-hidden="true" />
                                <span className="organiser-eyebrow">LIVE SESSION</span>
                                <time className="organiser-elapsed-time">{sessionDuration}</time>
                            </div>
                            <h2>{selectedSession.title}</h2>
                            <p>{formatSessionSchedule(selectedSession.scheduledAt, selectedSession.endsAt)}</p>
                        </div>
                        <div className="organiser-actions">
                            <button className="organiser-button secondary" type="button" disabled={busy} onClick={() => void generateSessionQr()}>
                                Generate / replace QR
                            </button>
                            <button className="organiser-button danger" type="button" disabled={busy} onClick={() => void endSession()}>End session</button>
                        </div>
                    </div>
                    {sessionJoinQrCard}
                    <section className="organiser-subcard">
                        <div className="organiser-section-heading">
                            <div><h3>Courts</h3>{fixedClubFormat && <p>All courts use {fixedClubFormat}.</p>}</div>
                            <label>Number of courts
                                <select className="organiser-court-count" aria-label="Number of live courts" value={courts.length} disabled={busy} onChange={(event) => {
                                    const count = Number(event.target.value);
                                    const nextFormats = Array.from({ length: count }, (_, index) => (courts[index] ?? 'singles') as Format);
                                    void updateLiveCourtFormats(nextFormats);
                                }}>
                                    {[1, 2, 3, 4, 5, 6].map((count) => <option key={count} value={count}>{count} {count === 1 ? 'court' : 'courts'}</option>)}
                                </select>
                            </label>
                        </div>
                        <div className="organiser-court-grid">
                            {!fixedClubFormat && courts.map((format, index) => (
                                <label className="organiser-court-setup" key={index}>Court {index + 1} format
                                    <select value={format} disabled={busy} onChange={(event) => {
                                        const nextFormats = courts.map((currentFormat, courtIndex) =>
                                            courtIndex === index ? event.target.value as Format : currentFormat as Format
                                        );
                                        void updateLiveCourtFormats(nextFormats);
                                    }}>
                                        {selectedClub?.allowedFormats.map((allowedFormat) => (
                                            <option key={allowedFormat} value={allowedFormat}>{allowedFormat === 'singles' ? 'Singles' : 'Doubles'}</option>
                                        ))}
                                    </select>
                                </label>
                            ))}
                        </div>
                    </section>
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
                                team1: '',
                                team2: ''
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
                                                    ? 'This lineup repeats a recent group of players. It will wait for one other match, then propose the best available mix without waiting again.'
                                                    : 'Review or edit the lineup, then approve to start.'}</span>
                                            </div>
                                        ) : (
                                            <>
                                                <div className="organiser-match-elapsed">
                                                    <span className="organiser-match-live-dot" aria-hidden="true" />
                                                    <span>Match live</span>
                                                    <time>{formatElapsedDuration(match.startTime ?? sessionStartedAt, clockNow)}</time>
                                                </div>
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
                                            </>
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
                    {waitingForOtherMatch && (
                        <div className="organiser-waiting-for-match" role="status">
                            <span className="organiser-waiting-indicator" aria-hidden="true" />
                            <div>
                                <strong>Waiting for the other match to finish</strong>
                                <p>We’ll build the next lineup from all available players once the live matches are done.</p>
                            </div>
                        </div>
                    )}
                    {proposedMatches.length > 0 && <p className="organiser-help">Approve each proposed match when its players and court are ready.</p>}
                    {!courtMatches.length && !waitingForOtherMatch && <p className="organiser-muted">No match is currently proposed. Add waiting players who match a court preference to generate the next proposal.</p>}
                    <section className="organiser-subcard">
                        <h3>Waiting queue · {waitingPlayers.length}</h3>
                        {waitingPlayers.length ? (
                            <div className="organiser-roster">
                                {waitingPlayers.map((player) => (
                                    <div className="organiser-roster-row" key={player.username}>
                                        <span><strong>{player.username}</strong><small>Waiting for a court matching {player.preferredFormat ?? 'their preference'}</small></span>
                                        <time className="organiser-queue-timer">{formatElapsedDuration(player.joinedAt ?? sessionStartedAt, clockNow)}</time>
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
                                {!fixedClubFormat && <label>Preference<select name="format" defaultValue={selectedClub?.defaultFormat ?? 'singles'}>
                                    {selectedClub?.allowedFormats.map((format) => (
                                        <option key={format} value={format}>{format === 'singles' ? 'Singles' : 'Doubles'}</option>
                                    ))}
                                </select></label>}
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
                                {!fixedClubFormat && <label>Preference<select value={newGuest.preferredFormat} onChange={(event) => setNewGuest({ ...newGuest, preferredFormat: event.target.value as Format })}>{selectedClub?.allowedFormats.map((format) => <option key={format} value={format}>{format === 'singles' ? 'Singles' : 'Doubles'}</option>)}</select></label>}
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
                                {!fixedClubFormat && <label>Preference<select value={newPlayer.preferredFormat} onChange={(event) => setNewPlayer({ ...newPlayer, preferredFormat: event.target.value as Format })}>{selectedClub?.allowedFormats.map((format) => <option key={format} value={format}>{format === 'singles' ? 'Singles' : 'Doubles'}</option>)}</select></label>}
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
                            <button className="organiser-button secondary" type="button" onClick={() => downloadSessionRankingsCsv(selectedSession)}>Download session rankings CSV</button>
                            {statusOf(selectedSession) === 'completed' && (
                                <button className="organiser-button danger" type="button" disabled={busy} onClick={() => void deleteSession()}>
                                    {busy ? 'Deleting…' : 'Delete completed session'}
                                </button>
                            )}
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
