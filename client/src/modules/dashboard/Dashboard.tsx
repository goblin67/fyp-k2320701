import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { LeaderboardRow, MatchHistoryEntry, MatchScore, PlayerField, SessionData, SessionMatch, UserStats, WinnerTeam } from '../../types/domain';
import OrganiserPanel from '../organiser/OrganiserPanel';

type DashboardView = 'overview' | 'active-match' | 'session-summary' | 'leaderboard' | 'settings' | 'match-history' | 'session-history' | 'achievements';

interface UserProfileResponse {
    username: string;
    matchHistory?: MatchHistoryEntry[];
    completedMatches?: number;
    pointsFor?: number;
    pointsAgainst?: number;
}

interface SessionResponse {
    session: SessionData;
    message?: string;
    error?: string;
}

interface ErrorResponse {
    error?: string;
    msg?: string;
}

interface DashboardProps {
    onLogout: () => void;
    hasOrganiserAccess: boolean;
}

const getErrorMessage = (error: unknown): string => error instanceof Error ? error.message : 'An unexpected error occurred';

const readJson = async <T,>(response: Response): Promise<T> => response.json() as Promise<T>;

const Dashboard = ({ onLogout, hasOrganiserAccess }: DashboardProps) => {
    const [view, setView] = useState<DashboardView>('overview');
    const [showOrganiserPanel, setShowOrganiserPanel] = useState(false);
    const [showBetaAccess, setShowBetaAccess] = useState(false);
    const [userStats, setUserStats] = useState<UserStats>({ username: '', matchHistory: [], completedMatches: 0, pointsFor: 0, pointsAgainst: 0 });
    const [loading, setLoading] = useState(true);
    const [leaderboardRows, setLeaderboardRows] = useState<LeaderboardRow[]>([]);
    const [leaderboardLoading, setLeaderboardLoading] = useState(false);
    const [leaderboardError, setLeaderboardError] = useState('');
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmNewPassword, setConfirmNewPassword] = useState('');
    const [deletePassword, setDeletePassword] = useState('');
    const [deleteConfirmation, setDeleteConfirmation] = useState('');
    const [accountActionError, setAccountActionError] = useState('');
    const [accountActionMessage, setAccountActionMessage] = useState('');
    const [accountActionBusy, setAccountActionBusy] = useState(false);
    const [activeSession, setActiveSession] = useState<SessionData | null>(null);
    const [selectedSession, setSelectedSession] = useState<SessionData | null>(null);
    const [sessionHistory, setSessionHistory] = useState<SessionData[]>([]);
    const [errorMessage, setErrorMessage] = useState('');
    const [matchTimer, setMatchTimer] = useState(0);
    const [selectedWinner, setSelectedWinner] = useState<Record<string, string>>({});
    const [matchScores, setMatchScores] = useState<Record<string, Partial<MatchScore>>>({});
    const [newPlayerName, setNewPlayerName] = useState('');
    const [replacementSelection, setReplacementSelection] = useState<Record<string, string>>({});
    const [endingMatchId, setEndingMatchId] = useState<string | null>(null);
    const [matchActionError, setMatchActionError] = useState('');

    const navigate = useNavigate();

    const API_URL = import.meta.env.VITE_BACKEND_URL;

    const waitingQueue = activeSession?.players
        .filter((player) => !activeSession.matches.some((m) => m.status === 'ongoing' && [m.player1, m.player2, m.player3, m.player4].includes(player.username)))
        .sort((a, b) => {
            const aTime = new Date(a.joinedAt || activeSession?.createdAt || Date.now()).getTime();
            const bTime = new Date(b.joinedAt || activeSession?.createdAt || Date.now()).getTime();
            return aTime - bTime;
        }) || [];

    const queueWaitTime = (joinedAt?: string | Date) => {
        const start = new Date(joinedAt || activeSession?.createdAt || Date.now()).getTime();
        return formatTimer(Math.floor((Date.now() - start) / 1000));
    };

    const totalGames = userStats.matchHistory.length;
    const totalWins = userStats.matchHistory.filter((match) => match.isWin).length;
    const winRate = totalGames > 0 ? Math.round((totalWins / totalGames) * 100) : 0;
    const currentStreak = (() => {
        let streak = 0;
        for (let i = userStats.matchHistory.length - 1; i >= 0; i -= 1) {
            if (userStats.matchHistory[i].isWin) {
                streak += 1;
            } else if (streak > 0) {
                break;
            } else {
                streak -= 1;
                break;
            }
        }
        return streak;
    })();
    const streakLabel = currentStreak >= 0 ? `${currentStreak} Wins` : `${-currentStreak} Loss`;
    const achievements = [
        { id: 'first-login', title: 'First Login', tagline: 'You made it to the court. Now make it count.', requirement: 'Sign in to your account', progress: 1, target: 1 },
        { id: 'first-match', title: 'First Match', tagline: 'No warm-up like the real thing.', requirement: 'Complete your first match', progress: userStats.completedMatches, target: 1 },
        { id: 'first-win', title: 'First Win', tagline: 'The scoreboard knows your name.', requirement: 'Win your first match', progress: totalWins, target: 1 },
        { id: 'matches-50', title: 'Another One Bites the Dust', tagline: 'Fifty matches. Still standing.', requirement: 'Complete 50 matches', progress: userStats.completedMatches, target: 50 },
        { id: 'points-1000-for', title: 'Point Collector', tagline: 'The other side has seen enough.', requirement: 'Score 1,000 points', progress: userStats.pointsFor, target: 1000 },
        { id: 'points-1000-against', title: 'Ouch!', tagline: 'A thousand points conceded. Call it a learning curve.', requirement: 'Concede 1,000 points', progress: userStats.pointsAgainst, target: 1000 }
    ].map((achievement) => ({
        ...achievement,
        unlocked: achievement.progress >= achievement.target,
        displayProgress: Math.min(achievement.progress, achievement.target)
    }));

    const isMatchComplete = (match: SessionMatch) => {
        if (!activeSession) return false;
        if (activeSession.isDoubles) {
            return Boolean(match.player1 && match.player2 && match.player3 && match.player4);
        }
        return Boolean(match.player1 && match.player2);
    };

    const fetchLeaderboard = async () => {
        setLeaderboardLoading(true);
        setLeaderboardError('');
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API_URL}/api/session/leaderboard`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!res.ok) {
                const errorData = await readJson<ErrorResponse>(res).catch((): ErrorResponse => ({}));
                throw new Error(errorData.error ?? 'Failed to load leaderboard');
            }

            const data = await readJson<LeaderboardRow[]>(res);
            setLeaderboardRows(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error('Leaderboard fetch error:', err);
            setLeaderboardError('Could not load leaderboard.');
            setLeaderboardRows([]);
        } finally {
            setLeaderboardLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    useEffect(() => {
        const ongoingMatch = activeSession?.matches?.find((m) => m.status === 'ongoing');
        if (!ongoingMatch) {
            setMatchTimer(0);
            return;
        }

        const start = ongoingMatch.startTime ? new Date(ongoingMatch.startTime).getTime() : Date.now();
        const updateTimer = () => setMatchTimer(Math.floor((Date.now() - start) / 1000));

        updateTimer();
        const interval = setInterval(updateTimer, 1000);
        return () => clearInterval(interval);
    }, [activeSession]);

    const formatTimer = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const fetchData = async () => {
        setErrorMessage('');
        try {
            const token = localStorage.getItem('token');
            if (!token) {
                navigate('/auth');
                return;
            }

            const userRes = await fetch(`${API_URL}/api/users/me`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (userRes.ok) {
                const userData = await readJson<UserProfileResponse>(userRes);
                setUserStats({
                    username: userData.username || 'User',
                    matchHistory: userData.matchHistory || [],
                    completedMatches: userData.completedMatches ?? userData.matchHistory?.length ?? 0,
                    pointsFor: userData.pointsFor ?? 0,
                    pointsAgainst: userData.pointsAgainst ?? 0
                });
            } else {
                setErrorMessage('Failed to load profile. Backend might be down.');
            }

            const sessionRes = await fetch(`${API_URL}/api/session/active`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (sessionRes.ok) {
                const sessionData = await readJson<SessionData | null>(sessionRes);
                if (sessionData) {
                    setActiveSession(sessionData);
                    setView(sessionData.isActive ? 'active-match' : 'session-summary');
                } else {
                    setActiveSession(null);
                    setView('overview');
                }
            }

            await fetchSessionHistory();
            await fetchLeaderboard();
        } catch (err) {
            console.error("Dashboard Fetch Error:", err);
            setErrorMessage('Connection lost. Please refresh or check backend logs.');
        } finally {
            setLoading(false);
        }
    };

    const handlePasswordChange = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setAccountActionError('');
        setAccountActionMessage('');
        if (newPassword !== confirmNewPassword) {
            setAccountActionError('The new passwords do not match.');
            return;
        }

        setAccountActionBusy(true);
        try {
            const token = localStorage.getItem('token');
            if (!token) throw new Error('Your session has expired. Please log in again.');
            const response = await fetch(`${API_URL}/api/users/me/password`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ currentPassword, newPassword })
            });
            const result = await readJson<ErrorResponse & { message?: string }>(response);
            if (!response.ok) throw new Error(result.error ?? 'Could not update password.');
            setCurrentPassword('');
            setNewPassword('');
            setConfirmNewPassword('');
            setAccountActionMessage(result.message ?? 'Password updated.');
        } catch (error) {
            setAccountActionError(getErrorMessage(error));
        } finally {
            setAccountActionBusy(false);
        }
    };

    const handleAccountExport = async () => {
        setAccountActionError('');
        setAccountActionMessage('');
        setAccountActionBusy(true);
        try {
            const token = localStorage.getItem('token');
            if (!token) throw new Error('Your session has expired. Please log in again.');
            const response = await fetch(`${API_URL}/api/users/me/export`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) {
                const result = await readJson<ErrorResponse>(response);
                throw new Error(result.error ?? result.msg ?? 'Could not export account data.');
            }
            const downloadUrl = URL.createObjectURL(await response.blob());
            const link = document.createElement('a');
            link.href = downloadUrl;
            link.download = 'courtsync-account-data.json';
            document.body.append(link);
            link.click();
            link.remove();
            window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
            setAccountActionMessage('Your account data export has been downloaded.');
        } catch (error) {
            setAccountActionError(getErrorMessage(error));
        } finally {
            setAccountActionBusy(false);
        }
    };

    const handleAccountDeletion = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setAccountActionError('');
        setAccountActionMessage('');
        if (deleteConfirmation !== userStats.username) {
            setAccountActionError('Type your username exactly to confirm account deletion.');
            return;
        }
        if (!window.confirm('Delete your account? Past sessions and match results will remain under your username. This cannot be undone.')) return;

        setAccountActionBusy(true);
        try {
            const token = localStorage.getItem('token');
            if (!token) throw new Error('Your session has expired. Please log in again.');
            const response = await fetch(`${API_URL}/api/users/me`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ password: deletePassword, confirmation: deleteConfirmation })
            });
            const result = await readJson<ErrorResponse & { message?: string }>(response);
            if (!response.ok) throw new Error(result.error ?? 'Could not delete account.');
            onLogout();
            navigate('/auth');
        } catch (error) {
            setAccountActionError(getErrorMessage(error));
        } finally {
            setAccountActionBusy(false);
        }
    };

    const fetchSessionHistory = async () => {
        try {
            const res = await fetch(`${API_URL}/api/session/history`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });
            if (res.ok) {
                const data = await readJson<SessionData[]>(res);
                setSessionHistory(data || []);
            }
        } catch (err) {
            console.error('Session history fetch error:', err);
        }
    };

    const handleSessionSelect = async (sessionId: string) => {
        try {
            const res = await fetch(`${API_URL}/api/session/${sessionId}`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });
            if (res.ok) {
                const data = await readJson<SessionData>(res);
                setSelectedSession(data);
                setView('session-summary');
            }
        } catch (err) {
            console.error('Failed to load session details:', err);
        }
    };

    const handleEndMatch = async (match: SessionMatch) => {
        if (!activeSession) return;
        setMatchActionError('');
        const winner = selectedWinner[match.matchId];

        if (!winner) {
            setMatchActionError('Select a winner before finishing the match.');
            return;
        }

        setEndingMatchId(match.matchId);
        try {
            const currentScore = matchScores[match.matchId] ?? {};
            const payload: {
                sessionId: string;
                matchId: string;
                score: Partial<MatchScore>;
                winnerTeam?: WinnerTeam;
                winnerName?: string;
            } = {
                sessionId: activeSession._id,
                matchId: match.matchId,
                score: currentScore
            };

            if (match.player3 && match.player4) {
                if (winner !== 'team1' && winner !== 'team2') {
                    setMatchActionError('Select a valid winning team.');
                    return;
                }
                payload.winnerTeam = winner;
            } else {
                payload.winnerName = winner;
            }

            const res = await fetch(`${API_URL}/api/session/end`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify(payload)
            });

            const data = await readJson<SessionResponse & ErrorResponse>(res);
            if (!res.ok) throw new Error(data.error ?? 'Failed to end match');
            setActiveSession(data.session);
            setView(data.session.isActive ? 'active-match' : 'session-summary');
        } catch (err) {
            setMatchActionError(getErrorMessage(err));
        } finally {
            setEndingMatchId(null);
        }
    };

    const handleEndSession = async () => {
        if (!activeSession) return;
        setMatchActionError('');
        setEndingMatchId('session');
        try {
            const res = await fetch(`${API_URL}/api/session/close`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({ sessionId: activeSession._id })
            });
            const data = await readJson<SessionResponse & ErrorResponse>(res);
            if (!res.ok) throw new Error(data.error ?? 'Failed to end session');
            setActiveSession(data.session);
            setView('session-summary');
        } catch (err) {
            setMatchActionError(getErrorMessage(err));
        } finally {
            setEndingMatchId(null);
        }
    };

    const handleAddPlayer = async () => {
        if (!activeSession) return;
        if (!newPlayerName.trim()) {
            setMatchActionError('Enter a name to add a player.');
            return;
        }

        setMatchActionError('');
        try {
            const res = await fetch(`${API_URL}/api/session/player/add`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({ sessionId: activeSession._id, username: newPlayerName.trim() })
            });
            const data = await readJson<SessionResponse & ErrorResponse>(res);
            if (!res.ok) throw new Error(data.error ?? 'Failed to add player');
            setActiveSession(data.session);
            setNewPlayerName('');
        } catch (err) {
            setMatchActionError(getErrorMessage(err));
        }
    };

    const handleRemoveQueuePlayer = async (username: string) => {
        if (!activeSession) return;
        setMatchActionError('');
        try {
            const res = await fetch(`${API_URL}/api/session/player/remove`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({ sessionId: activeSession._id, username })
            });
            const data = await readJson<SessionResponse & ErrorResponse>(res);
            if (!res.ok) throw new Error(data.error ?? 'Failed to remove player');
            setActiveSession(data.session);
        } catch (err) {
            setMatchActionError(getErrorMessage(err));
        }
    };

    const handleReplacePlayer = async (match: SessionMatch, field: PlayerField) => {
        if (!activeSession) return;
        const key = `${match.matchId}-${field}`;
        const replacementUsername = replacementSelection[key];

        if (!replacementUsername) {
            setMatchActionError('Select a replacement from the queue first.');
            return;
        }

        setMatchActionError('');
        try {
            const res = await fetch(`${API_URL}/api/session/player/replace`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({
                    sessionId: activeSession._id,
                    matchId: match.matchId,
                    field,
                    replacementUsername
                })
            });
            const data = await readJson<SessionResponse & ErrorResponse>(res);
            if (!res.ok) throw new Error(data.error ?? 'Failed to replace player');
            setActiveSession(data.session);
            setReplacementSelection((prev) => ({ ...prev, [key]: '' }));
        } catch (err) {
            setMatchActionError(getErrorMessage(err));
        }
    };

    const handleScoreChange = (matchId: string, field: keyof MatchScore, value: string) => {
        setMatchScores((prev) => ({
            ...prev,
            [matchId]: {
                ...prev[matchId],
                [field]: Number(value)
            }
        }));
    };

    const handleLogout = () => {
        localStorage.removeItem('token');
        onLogout();
        navigate('/auth');
    };

    const sessionToShow = selectedSession || activeSession;

    if (showOrganiserPanel) {
        return (
            <OrganiserPanel
                onLogout={onLogout}
                onBackToDashboard={() => setShowOrganiserPanel(false)}
            />
        );
    }

    if (loading) return <div style={{ color: 'white', textAlign: 'center', marginTop: '50px' }}>Connecting to CourtSync...</div>;

    return (
        <div className="dashboard-container">
            <style>
                {`
                .dashboard-container { position: relative; isolation: isolate; overflow: hidden; background: radial-gradient(ellipse at 82% 0%, rgba(98,215,223,.09), transparent 34rem), linear-gradient(90deg, transparent calc(50% - .5px), rgba(174,209,211,.035) 50%, transparent calc(50% + .5px)), #080d11; color: #e8edf2; min-height: 100vh; padding: 34px 20px; font-family: Inter, 'Segoe UI', sans-serif; }
                .dashboard-container::before { content: ''; position: absolute; z-index: -1; inset: 0; pointer-events: none; opacity: .14; background: linear-gradient(90deg, transparent 24.9%, rgba(174,209,211,.26) 25%, transparent 25.1%, transparent 74.9%, rgba(174,209,211,.26) 75%, transparent 75.1%), linear-gradient(0deg, transparent 49.9%, rgba(174,209,211,.24) 50%, transparent 50.1%); }
                .dash-card { background: rgba(11,17,21,.92); border: 1px solid rgba(190,215,222,.14); border-radius: 12px; padding: 25px; max-width: 1200px; margin: 0 auto; box-shadow: 0 24px 80px rgba(0,0,0,.32); backdrop-filter: blur(12px); }
                .dash-card > header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 26px; }
                .dash-card > nav { display: flex; gap: 8px; margin-bottom: 25px; border-bottom: 1px solid rgba(190,215,222,.14); padding-bottom: 14px; }
                .dash-card > nav button { background: #111a20; color: #a4b3b8; border: 1px solid rgba(190,215,222,.1); padding: 10px 16px; cursor: pointer; font-weight: 700; transition: 0.2s; }
                .dash-card > nav button:hover { color: #edf4f5; background: #19262c; }
                .dash-card > nav button.active { color: #111910; background: #c8f169; border-color: #c8f169; }
                .topbar { display: flex; justify-content: space-between; align-items: center; gap: 20px; background: linear-gradient(112deg, #c8f169, #62d7df); padding: 24px 28px; border-radius: 10px; margin-bottom: 20px; color: #101914; }
                .brand { font-size: 1.75rem; letter-spacing: 0.08em; text-transform: uppercase; }
                .brand strong { font-weight: 800; }
                .subtext { margin: 6px 0 0; color: rgba(16,25,20,0.72); font-size: 0.95rem; font-weight: 600; }
                .user-slot { display: flex; gap: 18px; align-items: center; }
                .user-slot .small-label { margin: 0 0 4px; color: rgba(16,25,20,0.65); font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.14em; }
                .top-tabs { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 20px; }
                .top-tabs button { background: #111a20; color: #aab9bd; border: 1px solid rgba(190,215,222,.12); border-radius: 9px; padding: 11px 15px; transition: all 0.2s ease; }
                .top-tabs button.active { background: #c8f169; color: #101914; border-color: #c8f169; }
                .top-tabs .beta-unlock { display: inline-flex; align-items: center; background: #111a20; color: #c8f169; border: 1px solid rgba(200,241,105,.4); border-radius: 9px; padding: 11px 15px; font-weight: 700; text-decoration: none; transition: all 0.2s ease; }
                .top-tabs .beta-unlock:hover { background: #202d25; color: #e5ffad; }
                .beta-access-note { margin: -8px 0 20px; color: #b5b8c7; font-size: 0.9rem; }
                .beta-access-note a { color: #8db7ff; }
                .beta-request-card { display: flex; justify-content: space-between; align-items: center; gap: 20px; flex-wrap: wrap; margin: 0 0 24px; padding: 22px 24px; background: #111a20; border: 1px solid rgba(98,215,223,.25); border-radius: 10px; }
                .beta-request-card h3 { margin: 0 0 8px; }
                .beta-request-card p { margin: 0; color: #aab9bd; line-height: 1.6; }
                .beta-request-card a { color: #62d7df; }
                .beta-request-card .beta-unlock { flex: 0 0 auto; padding: 12px 20px; border-radius: 9px; background: #c8f169; color: #101914; font-weight: 800; text-decoration: none; }
                .hero-card { display: flex; justify-content: space-between; align-items: center; gap: 20px; background: linear-gradient(112deg, #18262b, #142126); border: 1px solid rgba(98,215,223,.22); padding: 26px 30px; border-radius: 10px; margin-bottom: 20px; box-shadow: inset 3px 0 #c8f169; }
                .hero-card h2 { margin: 0; color: #f0f6f5; font-size: clamp(1.35rem, 3vw, 2rem); letter-spacing: -0.02em; }
                .hero-card p { margin: 10px 0 0; color: #aab9bd; }
                .summary-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; margin-bottom: 30px; }
                .summary-card { background: #111a20; border: 1px solid rgba(190,215,222,.12); border-radius: 9px; padding: 21px; }
                .summary-card span { display: block; color: #9aabb2; font-size: 0.78rem; letter-spacing: 0.12em; text-transform: uppercase; margin-bottom: 12px; }
                .summary-card strong { display: block; color: #c8f169; font-size: 2rem; }
                .settings-card { background: #1f232d; border: 1px solid #333; border-radius: 12px; padding: 28px; margin: 0 auto 24px; max-width: 900px; }
                .settings-card h4 { margin: 0 0 14px; color: #fff; font-size: 1.05rem; letter-spacing: 0.04em; }
                .settings-card p { margin: 0; color: #c2d1ff; }
                .match-card { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 18px 20px; display: grid; gap: 12px; }
                .match-card-header { display: flex; justify-content: space-between; align-items: center; gap: 12px; font-size: 0.95rem; color: #d0d7ff; }
                .match-card-body { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }
                .match-title { margin: 0; font-weight: 700; font-size: 1rem; color: #fff; }
                .match-score { margin: 0; color: #bbb; }
                .match-win { color: #4CAF50; font-weight: 700; }
                .match-loss { color: #f44336; font-weight: 700; }
                .leaderboard-table { width: 100%; border-collapse: collapse; min-width: 760px; margin-top: 18px; }
                .leaderboard-table th { background: #19272c; color: #c8f169; text-transform: uppercase; font-size: 0.78rem; letter-spacing: 0.12em; padding: 18px 16px; text-align: left; }
                .leaderboard-table td { padding: 18px 16px; border-bottom: 1px solid rgba(255,255,255,0.06); color: #e6ecff; vertical-align: middle; }
                .leaderboard-row:nth-child(odd) { background: rgba(255,255,255,0.03); }
                .player-name { font-weight: 700; color: #fff; }
                .overview-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; margin-top: 18px; }
                .profile-card { background: #181a20; border: 1px solid #333; border-radius: 9px; padding: 24px; }
                .profile-card h4 { margin: 0 0 14px; color: #fff; }
                .profile-line { display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid rgba(255,255,255,0.06); color: #c5d1ff; }
                .profile-line:last-child { border-bottom: none; }
                .recent-match { display: flex; justify-content: space-between; align-items: center; padding: 14px 16px; border-radius: 8px; background: #141820; margin-bottom: 12px; }
                .recent-match:last-child { margin-bottom: 0; }
                .recent-match strong { color: #fff; }
                .leaderboard-summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin-top: 22px; }
                .summary-pill { background: #11171f; border: 1px solid rgba(255,255,255,0.08); border-radius: 9px; padding: 18px; text-align: center; }
                .summary-pill span { display: block; color: #a7b6ff; font-size: 0.78rem; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.12em; }
                .summary-pill strong { font-size: 1.9rem; color: #fff; }
                table { width: 100%; border-collapse: collapse; margin-top: 15px; }
                th { text-align: left; color: #666; font-size: 0.8rem; text-transform: uppercase; padding: 12px; border-bottom: 1px solid #333; }
                td { padding: 15px 12px; border-bottom: 1px solid #2a2a2a; }
                .text-green { color: #4CAF50; font-weight: bold; }
                .text-red { color: #f44336; font-weight: bold; }
                .error-banner { background: #f4433622; color: #f44336; padding: 10px; border-radius: 6px; margin-bottom: 20px; text-align: center; border: 1px solid #f44336; }
                .btn-primary { background: #4CAF50; color: white; border: none; padding: 12px; border-radius: 6px; cursor: pointer; font-weight: bold; }
                .logout-btn { background: #333; color: #ff5252; border: 1px solid #444; padding: 8px 15px; border-radius: 6px; cursor: pointer; }
                @media (max-width: 960px) {
                    .summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
                }
                @media (max-width: 700px) {
                    .dashboard-container { padding: 18px 10px; }
                    .dash-card { width: 100%; padding: 16px; }
                    .topbar, .hero-card { flex-direction: column; align-items: flex-start; gap: 14px; padding: 18px; }
                    .user-slot { width: 100%; justify-content: space-between; }
                    .top-tabs { justify-content: flex-start; gap: 8px; }
                    .top-tabs button, .top-tabs .beta-unlock { flex: 1 1 135px; justify-content: center; min-width: 0; padding: 10px 12px; text-align: center; white-space: normal; }
                    .summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
                    .summary-card { padding: 16px; }
                    .summary-card span { font-size: 0.72rem; letter-spacing: 0.08em; }
                    .summary-card strong { font-size: 1.65rem; }
                    .overview-grid { grid-template-columns: 1fr; gap: 12px; }
                    .profile-card { padding: 18px; }
                    .leaderboard-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
                    .summary-pill { padding: 14px 10px; }
                    .beta-request-card { align-items: stretch; flex-direction: column; padding: 18px; }
                    .beta-request-card .beta-unlock { justify-content: center; text-align: center; }
                    .settings-card { padding: 18px; }
                    .dashboard-container table { display: block; max-width: 100%; overflow-x: auto; }
                    .dashboard-container th, .dashboard-container td { padding: 11px 9px; }
                    .dashboard-container section { min-width: 0; }
                }
                @media (max-width: 420px) {
                    .dashboard-container { padding: 10px 6px; }
                    .dash-card { padding: 12px; }
                    .topbar, .hero-card { padding: 15px; }
                    .brand { font-size: 1.5rem; }
                    .top-tabs button, .top-tabs .beta-unlock { flex-basis: 120px; font-size: 0.88rem; }
                    .summary-card { padding: 13px 10px; }
                    .summary-card strong { font-size: 1.45rem; }
                }
                .dashboard-container h3 { color: #eef4f3; letter-spacing: -0.02em; }
                .summary-card, .profile-card, .settings-card, .match-card, .recent-match, .summary-pill { border-color: rgba(190,215,222,.12); background-color: #111a20; }
                .profile-card h4, .settings-card h4, .recent-match strong, .summary-pill strong { color: #eef4f3; }
                .profile-line { color: #aab9bd; border-color: rgba(190,215,222,.1); }
                .profile-line strong, .match-title, .player-name { color: #c8f169; }
                .summary-pill span, .summary-card span { color: #9aabb2; }
                .leaderboard-table th { background: #19272c; color: #c8f169; border-bottom: 1px solid rgba(200,241,105,.35); }
                .leaderboard-table td { border-color: rgba(190,215,222,.1); }
                .leaderboard-row:nth-child(odd) { background: rgba(190,215,222,.035); }
                .btn-primary { background: #c8f169; color: #101914; }
                .logout-btn { background: #111a20; color: #ff8c86; border-color: rgba(255,109,105,.3); }
                .error-banner { background: rgba(255,109,105,.09); border-color: rgba(255,109,105,.34); color: #ffaaa7; }
                .settings-card, .profile-card, .summary-card, .summary-pill, .recent-match { border-radius: 9px; }
                .account-settings { display: grid; gap: 20px; }
                .settings-intro { padding-bottom: 16px; border-bottom: 1px solid rgba(190,215,222,.12); }
                .settings-intro h4, .account-form h5, .account-export h5 { margin: 6px 0; color: #eef4f3; font-size: 1rem; }
                .settings-intro p, .account-form > p, .account-export p { margin: 0; color: #9aabb2; line-height: 1.55; }
                .section-kicker { color: #62d7df; font-size: .72rem; font-weight: 800; letter-spacing: .14em; }
                .account-form { display: grid; gap: 14px; padding: 18px; border: 1px solid rgba(190,215,222,.12); background: #0d1519; border-radius: 8px; }
                .account-form label { display: grid; gap: 7px; color: #aab9bd; font-size: .88rem; font-weight: 650; }
                .account-form input { width: 100%; min-height: 42px; padding: 10px 12px; color: #eef4f3; background: #080f12; border: 1px solid rgba(190,215,222,.18); border-radius: 6px; }
                .account-form input:focus { outline: 2px solid rgba(98,215,223,.65); outline-offset: 1px; border-color: #62d7df; }
                .account-form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
                .account-export { display: flex; justify-content: space-between; align-items: center; gap: 18px; padding: 18px; border: 1px solid rgba(190,215,222,.12); border-radius: 8px; background: #0d1519; }
                .account-export .btn-primary { flex: 0 0 auto; }
                .btn-primary.secondary { color: #eaf3f3; background: #172229; border: 1px solid rgba(190,215,222,.22); }
                .danger-zone { border-color: rgba(255,109,105,.26); }
                .btn-danger { justify-self: start; padding: 11px 16px; color: #fff; background: #913b3b; border: 1px solid rgba(255,109,105,.55); border-radius: 7px; font-weight: 750; }
                .btn-danger:hover:not(:disabled) { background: #aa4545; }
                .account-success { margin-bottom: 18px; padding: 12px 14px; color: #d7f6a0; border: 1px solid rgba(200,241,105,.3); background: rgba(200,241,105,.07); border-radius: 7px; }
                .section-heading { margin: 4px 0 22px; }
                .section-heading h3 { margin: 6px 0; }
                .section-heading p { margin: 0; color: #9aabb2; }
                .achievement-sections { display: grid; gap: 24px; }
                .achievement-group { padding: 18px; border: 1px solid rgba(190,215,222,.12); border-radius: 10px; background: #0e171b; }
                .achievement-group-heading { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid rgba(190,215,222,.12); }
                .achievement-group-heading h4 { margin: 0; color: #edf4f3; font-size: 1rem; }
                .achievement-group-heading span { min-width: 26px; padding: 2px 7px; color: #c8f169; background: rgba(200,241,105,.1); border-radius: 4px; text-align: center; font-size: .8rem; font-weight: 800; }
                .achievement-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(225px, 1fr)); gap: 12px; }
                .achievement-card { min-width: 0; padding: 16px; border: 1px solid rgba(190,215,222,.12); border-left: 3px solid #35444a; border-radius: 7px; background: #111b20; }
                .achievement-card.is-unlocked { border-left-color: #c8f169; }
                .achievement-state { color: #90a2a8; font-size: .67rem; font-weight: 800; letter-spacing: .12em; }
                .is-unlocked .achievement-state { color: #c8f169; }
                .achievement-card h5 { margin: 8px 0 5px; color: #edf4f3; font-size: 1rem; }
                .achievement-card p { margin: 6px 0; color: #9aabb2; font-size: .88rem; }
                .achievement-card .achievement-tagline { color: #62d7df; font-weight: 650; }
                .achievement-card small { color: #9aabb2; }
                .achievement-progress { height: 5px; margin: 13px 0 6px; overflow: hidden; background: #263237; border-radius: 3px; }
                .achievement-progress span { display: block; height: 100%; background: #62d7df; }
                .achievement-empty { margin: 0; color: #9aabb2; }
                @media (max-width: 600px) {
                    .account-form-grid { grid-template-columns: 1fr; }
                    .account-export { align-items: stretch; flex-direction: column; }
                    .account-export .btn-primary { width: 100%; }
                    .achievement-group { padding: 14px; }
                }
                `}
            </style>

            <div className="dash-card">
                {errorMessage && <div className="error-banner">{errorMessage}</div>}
                
                <header className="topbar">
                    <div>
                        <div className="brand">
                            <span>COURT</span><strong>SYNC</strong>
                        </div>
                        <p className="subtext">Player Portal</p>
                    </div>
                    <div className="user-slot">
                        <div>
                            <p className="small-label">Logged in as</p>
                            <strong>{userStats.username}</strong>
                        </div>
                        <button className="logout-btn" onClick={handleLogout}>Logout</button>
                    </div>
                </header>

                <nav className="top-tabs">
                    <button className={view === 'overview' ? 'active' : ''} onClick={() => {
                        setSelectedSession(null);
                        setView('overview');
                    }}>My Stats</button>
                    <button className={view === 'leaderboard' ? 'active' : ''} onClick={() => {
                        setSelectedSession(null);
                        setView('leaderboard');
                        fetchLeaderboard();
                    }}>Leaderboard</button>
                    <button className={view === 'match-history' ? 'active' : ''} onClick={() => {
                        setSelectedSession(null);
                        setView('match-history');
                    }}>Match History</button>
                    <button className={view === 'achievements' ? 'active' : ''} onClick={() => {
                        setSelectedSession(null);
                        setView('achievements');
                    }}>Achievements</button>
                    <button className={view === 'session-history' ? 'active' : ''} onClick={() => {
                        setSelectedSession(null);
                        fetchSessionHistory();
                        setView('session-history');
                    }}>Session History</button>
                    {hasOrganiserAccess ? (
                        <button className="beta-unlock" type="button" onClick={() => setShowOrganiserPanel(true)}>Organiser panel</button>
                    ) : (
                        <button className={`beta-unlock${showBetaAccess ? ' active' : ''}`} type="button" onClick={() => setShowBetaAccess((visible) => !visible)}>Create/Organise Sessions</button>
                    )}
                    <button className={view === 'settings' ? 'active' : ''} onClick={() => {
                        setSelectedSession(null);
                        setView('settings');
                    }}>Settings</button>
                    {activeSession?.isActive && (
                        <button className={view === 'active-match' ? 'active' : ''} onClick={() => {
                            setSelectedSession(null);
                            setView('active-match');
                        }}>
                            Current Match
                        </button>
                    )}
                </nav>
                {!hasOrganiserAccess && showBetaAccess && (
                    <section className="beta-request-card" aria-label="Session creation beta access">
                        <div>
                            <h3>Session creation is in beta</h3>
                            <p>To request access, email <a href="mailto:miscellaneousaffairs21@gmail.com?subject=Session%20Creation%20Beta%20Access%20Request">miscellaneousaffairs21@gmail.com</a> with the subject <strong>Session Creation Beta Access Request</strong>.</p>
                        </div>
                        <a className="beta-unlock" href="mailto:miscellaneousaffairs21@gmail.com?subject=Session%20Creation%20Beta%20Access%20Request">Unlock beta</a>
                    </section>
                )}

                <section className="hero-card">
                    <div>
                        <h2>WELCOME BACK, {userStats.username.toUpperCase()}</h2>
                    </div>
                </section>

                <section className="summary-grid">
                    <div className="summary-card">
                        <span>Games Played</span>
                        <strong>{totalGames}</strong>
                    </div>
                    <div className="summary-card">
                        <span>Wins</span>
                        <strong>{totalWins}</strong>
                    </div>
                    <div className="summary-card">
                        <span>Win Rate</span>
                        <strong>{winRate}%</strong>
                    </div>
                    <div className="summary-card">
                        <span>Current Streak</span>
                        <strong>{streakLabel}</strong>
                    </div>
                </section>

                {view === 'overview' && (
                    <section>
                        <h3>Performance Overview</h3>
                        <p style={{ color: '#aaa', marginBottom: '18px' }}>Track your match results, recent form, and progress without losing sight of your play style.</p>
                        <div className="overview-grid">
                            <div className="profile-card">
                                <h4>Your Profile</h4>
                                <div className="profile-line"><span>Games Played</span><strong>{totalGames}</strong></div>
                                <div className="profile-line"><span>Wins</span><strong>{totalWins}</strong></div>
                                <div className="profile-line"><span>Win Rate</span><strong>{winRate}%</strong></div>
                                <div className="profile-line"><span>Current Streak</span><strong>{streakLabel}</strong></div>
                            </div>
                            <div className="profile-card">
                                <h4>Recent Form</h4>
                                {userStats.matchHistory.length > 0 ? (
                                    // Recent form: because who cares about old losses?
                                    userStats.matchHistory.slice().reverse().slice(0, 4).map((m, idx) => {
                                        return (
                                            <div key={idx} className="recent-match">
                                                <div>
                                                    <strong>{new Date(m.matchDate).toLocaleDateString()}</strong>
                                                    <p style={{ margin: '4px 0 0', color: '#9bb4ff' }}>{m.opponent}</p>
                                                </div>
                                                <div style={{ textAlign: 'right' }}>
                                                    <span className={m.isWin ? 'text-green' : 'text-red'}>{m.isWin ? 'WIN' : 'LOSS'}</span>
                                                </div>
                                            </div>
                                        );
                                    })
                                ) : (
                                    <p style={{ color: '#666' }}>No recent results yet. Start a match to build your form history.</p>
                                )}
                            </div>
                        </div>
                    </section>
                )}

                {view === 'leaderboard' && (
                    <section>
                        <h3>Leaderboard</h3>
                        {leaderboardLoading ? (
                            <p style={{ color: '#aaa' }}>Loading leaderboard...</p>
                        ) : leaderboardError ? (
                            <p style={{ color: '#f44336' }}>{leaderboardError}</p>
                        ) : (
                            <>
                                <div style={{ overflowX: 'auto' }}>
                                    <table className="leaderboard-table">
                                        <thead>
                                            <tr>
                                                <th>Rank</th>
                                                <th>Player</th>
                                                <th>Games</th>
                                                <th>Wins</th>
                                                <th>Win Rate</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {leaderboardRows.map((row) => (
                                                <tr key={`${row.player}-${row.rank}`} className="leaderboard-row">
                                                    <td>{row.rank}</td>
                                                    <td className="player-name">{row.player}</td>
                                                    <td>{row.games}</td>
                                                    <td>{row.wins}</td>
                                                    <td className={row.winRate >= 65 ? 'text-green' : 'text-red'}>{row.winRate}%</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                {leaderboardRows.length === 0 && (
                                    <p style={{ color: '#666', marginTop: '18px' }}>No shared session users found. Your leaderboard is limited to your account.</p>
                                )}
                                <div className="leaderboard-summary">
                                    <div className="summary-pill">
                                        <span>Total Matches</span>
                                        <strong>{totalGames}</strong>
                                    </div>
                                    <div className="summary-pill">
                                        <span>Avg Win Rate</span>
                                        <strong>{winRate}%</strong>
                                    </div>
                                    <div className="summary-pill">
                                        <span>Active Players</span>
                                        <strong>{activeSession?.players?.length || 8}</strong>
                                    </div>
                                </div>
                            </>
                        )}
                    </section>
                )}

                {view === 'match-history' && (
                    <section>
                        <h3>Match History</h3>
                        {userStats.matchHistory.length > 0 ? (
                            <table>
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Opponent</th>
                                        <th>Result</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {userStats.matchHistory.slice().reverse().map((m, i) => {
                                        return (
                                            <tr key={i}>
                                                <td>{new Date(m.matchDate).toLocaleDateString()}</td>
                                                <td>{m.opponent}</td>
                                                <td className={m.isWin ? 'text-green' : 'text-red'}>{m.isWin ? 'WIN' : 'LOSS'}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        ) : (
                            <p style={{ color: '#666' }}>No matches recorded yet. Start a session to play!</p>
                        )}
                    </section>
                )}

                {view === 'session-history' && (
                    <section>
                        <h3>Past Sessions</h3>
                        {sessionHistory.length > 0 ? (
                            <div style={{ display: 'grid', gap: '14px' }}>
                                {sessionHistory.map((session) => (
                                    <div key={session._id} style={{ background: '#181818', padding: '18px', borderRadius: '12px', border: '1px solid #333' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: '16px', flexWrap: 'wrap' }}>
                                            <div>
                                                <h4 style={{ margin: 0 }}>{session.title || 'Untitled session'}</h4>
                                                <p style={{ margin: '6px 0 0', color: '#aaa' }}>{new Date(session.createdAt ?? Date.now()).toLocaleString()}</p>
                                            </div>
                                            <div style={{ textAlign: 'right' }}>
                                                <p style={{ margin: 0, color: '#888' }}>{session.isActive ? 'Active' : 'Closed'}</p>
                                                <p style={{ margin: '4px 0 0', color: '#aaa' }}>{session.players.length} players</p>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '12px' }}>
                                            <span style={{ color: '#ccc' }}>Matches: {session.matches.length}</span>
                                            <span style={{ color: '#ccc' }}>Finished: {session.matches.filter((m) => m.status === 'finished').length}</span>
                                            <span style={{ color: '#ccc' }}>Ongoing: {session.matches.filter((m) => m.status === 'ongoing').length}</span>
                                        </div>
                                        <button
                                            className="btn-primary"
                                            style={{ marginTop: '14px' }}
                                            onClick={() => handleSessionSelect(session._id)}
                                        >
                                            View Summary
                                        </button>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p style={{ color: '#666' }}>No past sessions found yet.</p>
                        )}
                    </section>
                )}

                {view === 'achievements' && (
                    <section className="achievements-view">
                        <div className="section-heading">
                            <span className="section-kicker">CAREER MILESTONES</span>
                            <h3>Achievements</h3>
                            <p>Earned through completed matches and recorded match scores.</p>
                        </div>
                        <div className="achievement-sections">
                            {[
                                { title: 'Unlocked', items: achievements.filter((item) => item.unlocked) },
                                { title: 'Locked', items: achievements.filter((item) => !item.unlocked) }
                            ].map((group) => (
                                <section className="achievement-group" key={group.title}>
                                    <div className="achievement-group-heading">
                                        <h4>{group.title}</h4>
                                        <span>{group.items.length}</span>
                                    </div>
                                    {group.items.length ? (
                                        <div className="achievement-grid">
                                            {group.items.map((item) => (
                                                <article className={`achievement-card${item.unlocked ? ' is-unlocked' : ''}`} key={item.id}>
                                                    <span className="achievement-state">{item.unlocked ? 'UNLOCKED' : 'IN PROGRESS'}</span>
                                                    <h5>{item.title}</h5>
                                                    <p className="achievement-tagline">{item.tagline}</p>
                                                    <p>{item.requirement}</p>
                                                    {!item.unlocked && (
                                                        <>
                                                            <div className="achievement-progress" role="progressbar" aria-valuenow={item.displayProgress} aria-valuemin={0} aria-valuemax={item.target}>
                                                                <span style={{ width: `${(item.displayProgress / item.target) * 100}%` }} />
                                                            </div>
                                                            <small>{item.displayProgress.toLocaleString()} / {item.target.toLocaleString()}</small>
                                                        </>
                                                    )}
                                                </article>
                                            ))}
                                        </div>
                                    ) : <p className="achievement-empty">{group.title === 'Unlocked' ? 'Your first milestone is waiting.' : 'All current milestones unlocked. Keep playing.'}</p>}
                                </section>
                            ))}
                        </div>
                    </section>
                )}

                {view === 'settings' && (
                    <section>
                        <h3>Settings</h3>
                        {accountActionError && <div className="error-banner" role="alert">{accountActionError}</div>}
                        {accountActionMessage && <div className="account-success" role="status">{accountActionMessage}</div>}
                        <div className="settings-card account-settings">
                            <div className="settings-intro">
                                <span className="section-kicker">ACCOUNT SECURITY</span>
                                <h4>Protect your account</h4>
                                <p>Update your credentials, keep a copy of your data, or remove your account.</p>
                            </div>
                            <form className="account-form" onSubmit={handlePasswordChange}>
                                <h5>Change password</h5>
                                <label>Current password
                                    <input type="password" autoComplete="current-password" required value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
                                </label>
                                <div className="account-form-grid">
                                    <label>New password
                                        <input type="password" autoComplete="new-password" minLength={8} required value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
                                    </label>
                                    <label>Confirm new password
                                        <input type="password" autoComplete="new-password" minLength={8} required value={confirmNewPassword} onChange={(event) => setConfirmNewPassword(event.target.value)} />
                                    </label>
                                </div>
                                <button className="btn-primary" type="submit" disabled={accountActionBusy}>Update password</button>
                            </form>
                            <section className="account-export">
                                <div>
                                    <h5>Export account data</h5>
                                    <p>Download your profile details, match history, and recorded lifetime points.</p>
                                </div>
                                <button className="btn-primary secondary" type="button" disabled={accountActionBusy} onClick={() => void handleAccountExport()}>
                                    {accountActionBusy ? 'Please wait…' : 'Download my data'}
                                </button>
                            </section>
                            <form className="account-form danger-zone" onSubmit={handleAccountDeletion}>
                                <h5>Delete account</h5>
                                <p>Past sessions and match results will be preserved under your username, which cannot be reused.</p>
                                <label>Current password
                                    <input type="password" autoComplete="current-password" required value={deletePassword} onChange={(event) => setDeletePassword(event.target.value)} />
                                </label>
                                <label>Type <strong>{userStats.username}</strong> to confirm
                                    <input type="text" autoComplete="off" required value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} />
                                </label>
                                <button className="btn-danger" type="submit" disabled={accountActionBusy}>Delete my account</button>
                            </form>
                        </div>
                    </section>
                )}

                {view === 'session-summary' && sessionToShow && (
                    <section>
                        <h2 className="text-green">Session Summary</h2>
                        <p style={{ color: '#aaa' }}>Session: {sessionToShow.title || 'CourtSync Session'}</p>
                        <div style={{ background: '#1f1f1f', border: '1px solid #333', borderRadius: '12px', padding: '20px', maxWidth: '700px', margin: '20px auto' }}>
                            <p><strong>Total players:</strong> {sessionToShow.players.length}</p>
                            <p><strong>Total matches:</strong> {sessionToShow.matches.length}</p>
                            <p><strong>Completed matches:</strong> {sessionToShow.matches.filter((m) => m.status === 'finished').length}</p>
                            <p><strong>Ongoing matches:</strong> {sessionToShow.matches.filter((m) => m.status === 'ongoing').length}</p>
                            <p><strong>Session status:</strong> {sessionToShow.isActive ? 'Active' : 'Closed'}</p>
                        </div>
                        <div style={{ maxWidth: '700px', margin: '0 auto' }}>
                            {sessionToShow.matches.map((match, idx) => (
                                <div key={idx} style={{ background: '#252525', padding: '18px', borderRadius: '10px', marginBottom: '12px' }}>
                                    <p style={{ fontWeight: '700' }}>Court {match.court}</p>
                                    <p>
                                        <strong>{match.player1 || 'Vacant'}</strong> & <strong>{match.player2 || 'Vacant'}</strong>
                                        {match.player3 || match.player4 ? ` vs ${match.player3 || 'Vacant'} & ${match.player4 || 'Vacant'}` : ''}
                                    </p>
                                    <p>Status: {match.status.toUpperCase()}</p>
                                    {match.status === 'finished' && (
                                        <p>Winner: {match.winner}</p>
                                    )}
                                    <p>Score: {match.score?.team1} - {match.score?.team2}</p>
                                </div>
                            ))}
                        </div>
                        <button className="btn-primary" style={{ marginTop: '20px' }} onClick={() => {
                            setSelectedSession(null);
                            setView(selectedSession ? 'session-history' : 'overview');
                        }}>
                            {selectedSession ? 'Back to Session History' : 'Back to Dashboard'}
                        </button>
                    </section>
                )}

                {view === 'active-match' && activeSession?.isActive && (
                    <section style={{ textAlign: 'center', padding: '40px 0' }}>
                        <h2 className="text-green">Match in Progress</h2>
                        <p style={{ color: '#aaa', marginBottom: '10px' }}>Session: {activeSession.title || 'CourtSync Session'}</p>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', marginBottom: '16px' }}>
                            <button className="btn-primary" style={{ minWidth: '140px' }} onClick={handleEndSession} disabled={endingMatchId === 'session'}>
                                {endingMatchId === 'session' ? 'Ending Session…' : 'End Session'}
                            </button>
                        </div>
                        {matchActionError && <div className="error-banner" style={{ margin: '0 auto 20px', maxWidth: '700px' }}>{matchActionError}</div>}
                        <div style={{ fontSize: '1.1rem', marginBottom: '20px' }}>
                            <p>Live timer: <strong>{formatTimer(matchTimer)}</strong></p>
                        </div>
                        <div style={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: '10px', padding: '16px', margin: '0 auto 20px', maxWidth: '700px' }}>
                            <h4 style={{ margin: '0 0 10px', color: '#bbb' }}>Add Player to Queue</h4>
                            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                <input
                                    type="text"
                                    placeholder="Player name"
                                    value={newPlayerName}
                                    onChange={(e) => setNewPlayerName(e.target.value)}
                                    style={{ flex: 1, minWidth: '180px', padding: '10px', borderRadius: '8px', border: '1px solid #444', background: '#121212', color: '#fff' }}
                                />
                                <button className="btn-primary" onClick={handleAddPlayer}>
                                    Add Player
                                </button>
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
                                        <button
                                            className="btn-primary"
                                            style={{ background: '#c62828', borderColor: '#a82424' }}
                                            onClick={() => handleRemoveQueuePlayer(player.username)}
                                        >
                                            Remove
                                        </button>
                                    </div>
                                ))
                            ) : (
                                <p style={{ color: '#666' }}>No waiting players at the moment.</p>
                            )}
                        </div>
                        {activeSession.matches?.filter(m => m.status === 'ongoing').length > 0 ? (
                            activeSession.matches.filter(m => m.status === 'ongoing').map((match, idx) => (
                                <div key={idx} style={{ background: '#252525', padding: '20px', borderRadius: '10px', marginBottom: '20px', textAlign: 'left' }}>
                                    <p><strong>Court {match.court}</strong></p>
                                    <p style={{ margin: '6px 0' }}>
                                        <strong>{match.player1 || 'Vacant'}</strong> <span style={{ color: '#666' }}>vs</span> <strong>{match.player2 || 'Vacant'}</strong>
                                    </p>
                                    {match.player3 || match.player4 ? (
                                        <p style={{ margin: '6px 0' }}>
                                            <strong>{match.player3 || 'Vacant'}</strong> <span style={{ color: '#666' }}>vs</span> <strong>{match.player4 || 'Vacant'}</strong>
                                        </p>
                                    ) : null}

                                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '16px' }}>
                                        {isMatchComplete(match) ? (
                                            match.player3 && match.player4 ? (
                                                <>
                                                    <label style={{ color: '#ddd' }}>
                                                        <input
                                                            type="radio"
                                                            name={`winner-${match.matchId}`}
                                                            value="team1"
                                                            checked={selectedWinner[match.matchId] === 'team1'}
                                                            onChange={(e) => setSelectedWinner({ ...selectedWinner, [match.matchId]: e.target.value })}
                                                        />
                                                        Team 1: {match.player1} & {match.player2}
                                                    </label>
                                                    <label style={{ color: '#ddd' }}>
                                                        <input
                                                            type="radio"
                                                            name={`winner-${match.matchId}`}
                                                            value="team2"
                                                            checked={selectedWinner[match.matchId] === 'team2'}
                                                            onChange={(e) => setSelectedWinner({ ...selectedWinner, [match.matchId]: e.target.value })}
                                                        />
                                                        Team 2: {match.player3} & {match.player4}
                                                    </label>
                                                </>
                                            ) : (
                                                <>
                                                    <label style={{ color: '#ddd' }}>
                                                        <input
                                                            type="radio"
                                                            name={`winner-${match.matchId}`}
                                                            value={match.player1}
                                                            checked={selectedWinner[match.matchId] === match.player1}
                                                            onChange={(e) => setSelectedWinner({ ...selectedWinner, [match.matchId]: e.target.value })}
                                                        />
                                                        {match.player1} wins
                                                    </label>
                                                    <label style={{ color: '#ddd' }}>
                                                        <input
                                                            type="radio"
                                                            name={`winner-${match.matchId}`}
                                                            value={match.player2}
                                                            checked={selectedWinner[match.matchId] === match.player2}
                                                            onChange={(e) => setSelectedWinner({ ...selectedWinner, [match.matchId]: e.target.value })}
                                                        />
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
                                                {(activeSession.isDoubles ? ['player1', 'player2', 'player3', 'player4'] as PlayerField[] : ['player1', 'player2'] as PlayerField[]).map((field) => {
                                                    const currentName = match[field] || 'Vacant spot';
                                                    const key = `${match.matchId}-${field}`;
                                                    return (
                                                        <div key={key} style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                                                            <span style={{ color: '#ddd', minWidth: '90px' }}>{currentName}</span>
                                                            <select
                                                                value={replacementSelection[key] || ''}
                                                                onChange={(e) => setReplacementSelection({ ...replacementSelection, [key]: e.target.value })}
                                                                style={{ flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid #444', background: '#1a1a1a', color: '#fff' }}
                                                            >
                                                                <option value="">Choose replacement</option>
                                                                {waitingQueue.map((player) => (
                                                                    <option key={player.username} value={player.username}>{player.username}</option>
                                                                ))}
                                                            </select>
                                                            <button
                                                                className="btn-primary"
                                                                style={{ padding: '10px 16px' }}
                                                                onClick={() => handleReplacePlayer(match, field)}
                                                            >
                                                                Replace
                                                            </button>
                                                            {match[field] && (
                                                                <button
                                                                    className="btn-primary"
                                                                    style={{ padding: '10px 16px', background: '#c62828', borderColor: '#a82424' }}
                                                                    onClick={() => {
                                                                        const playerName = match[field];
                                                                        if (playerName) handleRemoveQueuePlayer(playerName);
                                                                    }}
                                                                >
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
                                            <input
                                                type="number"
                                                min="0"
                                                value={matchScores[match.matchId]?.team1 || 0}
                                                onChange={(e) => handleScoreChange(match.matchId, 'team1', e.target.value)}
                                                style={{ width: '80px', padding: '8px', borderRadius: '6px', border: '1px solid #444', background: '#1a1a1a', color: '#fff' }}
                                            />
                                        </div>

                                        <div style={{ display: 'grid', gap: '8px' }}>
                                            <label style={{ color: '#aaa' }}>Team 2 Score</label>
                                            <input
                                                type="number"
                                                min="0"
                                                value={matchScores[match.matchId]?.team2 || 0}
                                                onChange={(e) => handleScoreChange(match.matchId, 'team2', e.target.value)}
                                                style={{ width: '80px', padding: '8px', borderRadius: '6px', border: '1px solid #444', background: '#1a1a1a', color: '#fff' }}
                                            />
                                        </div>
                                    </div>

                                    <button
                                        className="btn-primary"
                                        style={{ marginTop: '18px' }}
                                        onClick={() => handleEndMatch(match)}
                                        disabled={endingMatchId === match.matchId || !isMatchComplete(match)}
                                    >
                                        {endingMatchId === match.matchId ? 'Ending…' : 'Finish Match'}
                                    </button>
                                </div>
                            ))
                        ) : (
                            <p>All matches finished. Generating next round...</p>
                        )}
                    </section>
                )}
            </div>
        </div>
    );
};

export default Dashboard;