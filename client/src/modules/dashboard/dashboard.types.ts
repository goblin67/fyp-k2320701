import type { Dispatch, FormEvent, SetStateAction } from 'react';
import type {
    LeaderboardRow,
    MatchHistoryEntry,
    MatchScore,
    PlayerField,
    SessionData,
    SessionMatch,
    SessionPlayer,
    UserStats,
    WinnerTeam
} from '../../types/domain';

export type DashboardView =
    | 'overview'
    | 'active-match'
    | 'session-summary'
    | 'leaderboard'
    | 'settings'
    | 'match-history'
    | 'session-history'
    | 'achievements';

export interface Achievement {
    id: string;
    title: string;
    tagline: string;
    requirement: string;
    progress: number;
    target: number;
    unlocked: boolean;
    displayProgress: number;
}

export interface OverviewPageProps {
    totalGames: number;
    totalWins: number;
    winRate: number;
    streakLabel: string;
    matchHistory: MatchHistoryEntry[];
}

export interface LeaderboardPageProps {
    loading: boolean;
    error: string;
    rows: LeaderboardRow[];
    totalGames: number;
    winRate: number;
    activePlayerCount: number;
}

export interface MatchHistoryPageProps {
    matchHistory: MatchHistoryEntry[];
}

export interface SessionHistoryPageProps {
    sessions: SessionData[];
    onSelect: (sessionId: string) => void;
}

export interface AchievementsPageProps {
    achievements: Achievement[];
}

export interface SettingsPageProps {
    username: string;
    error: string;
    message: string;
    busy: boolean;
    currentPassword: string;
    newPassword: string;
    confirmNewPassword: string;
    deletePassword: string;
    deleteConfirmation: string;
    setCurrentPassword: Dispatch<SetStateAction<string>>;
    setNewPassword: Dispatch<SetStateAction<string>>;
    setConfirmNewPassword: Dispatch<SetStateAction<string>>;
    setDeletePassword: Dispatch<SetStateAction<string>>;
    setDeleteConfirmation: Dispatch<SetStateAction<string>>;
    onPasswordChange: (event: FormEvent<HTMLFormElement>) => void;
    onExport: () => void;
    onDelete: (event: FormEvent<HTMLFormElement>) => void;
}

export interface SessionSummaryPageProps {
    session: SessionData;
    selectedSession: SessionData | null;
    onBack: () => void;
}

export interface ActiveMatchPageProps {
    session: SessionData;
    endingMatchId: string | null;
    matchActionError: string;
    matchTimer: string;
    newPlayerName: string;
    setNewPlayerName: Dispatch<SetStateAction<string>>;
    onEndSession: () => void;
    onAddPlayer: () => void;
    waitingQueue: SessionPlayer[];
    queueWaitTime: (joinedAt?: string | Date) => string;
    onRemoveQueuePlayer: (username: string) => void;
    isMatchComplete: (match: SessionMatch) => boolean;
    selectedWinner: Record<string, string>;
    setSelectedWinner: Dispatch<SetStateAction<Record<string, string>>>;
    replacementSelection: Record<string, string>;
    setReplacementSelection: Dispatch<SetStateAction<Record<string, string>>>;
    onReplacePlayer: (match: SessionMatch, field: PlayerField) => void;
    matchScores: Record<string, Partial<MatchScore>>;
    onScoreChange: (matchId: string, field: keyof MatchScore, value: string) => void;
    onEndMatch: (match: SessionMatch) => void;
}

export type { MatchScore, PlayerField, SessionData, SessionMatch, UserStats, WinnerTeam };
