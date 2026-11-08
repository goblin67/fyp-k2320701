export interface MatchHistoryEntry {
  opponent: string;
  teammate?: string;
  isWin: boolean;
  matchDate: string | Date;
}

export interface UserStats {
  username: string;
  bio: string;
  loginDays: string[];
  matchHistory: MatchHistoryEntry[];
  completedMatches: number;
  pointsFor: number;
  pointsAgainst: number;
}

export interface SessionPlayer {
  username: string;
  isGuest: boolean;
  preferredFormat?: 'singles' | 'doubles';
  age?: number;
  level?: string;
  rating: number;
  rd: number;
  vol: number;
  joinedAt?: string | Date;
}

export interface MatchScore {
  team1: number;
  team2: number;
}

export type MatchStatus = 'proposed' | 'ongoing' | 'finished';
export type PlayerField = 'player1' | 'player2' | 'player3' | 'player4';
export type WinnerTeam = 'team1' | 'team2';

export interface SessionMatch {
  player1?: string;
  player2?: string;
  player3?: string;
  player4?: string;
  court: number;
  isDoubles?: boolean;
  matchId: string;
  status: MatchStatus;
  awaitingNextFinish?: boolean;
  manualOverride?: boolean;
  createdAt?: string | Date;
  startTime?: string | Date;
  finishedAt?: string | Date;
  score: MatchScore;
  winner?: string;
  winnerTeam?: WinnerTeam;
}

export interface SessionData {
  _id: string;
  title: string;
  numCourts: number;
  isDoubles: boolean;
  isActive: boolean;
  status?: 'scheduled' | 'active' | 'completed';
  scheduledAt?: string | Date;
  endsAt?: string | Date;
  venue?: string;
  clubId?: string;
  courtFormats?: ('singles' | 'doubles')[];
  adminId: string;
  players: SessionPlayer[];
  matches: SessionMatch[];
  createdAt?: string | Date;
  endedAt?: string | Date;
}

export interface LeaderboardRow {
  rank: number;
  player: string;
  games: number;
  wins: number;
  winRate: number;
}

export interface ApiErrorResponse {
  error?: string;
  msg?: string;
}