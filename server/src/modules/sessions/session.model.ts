import mongoose, { Schema, Types } from 'mongoose';

export type MatchStatus = 'proposed' | 'ongoing' | 'finished';
export type PlayerField = 'player1' | 'player2' | 'player3' | 'player4';
export type PlayFormat = 'singles' | 'doubles';
export type SessionStatus = 'scheduled' | 'active' | 'completed';

export interface SessionPlayer {
  username: string;
  isGuest: boolean;
  preferredFormat?: PlayFormat;
  age?: number;
  level?: string;
  rating: number;
  rd: number;
  vol: number;
  joinedAt: Date;
}

export interface MatchScore {
  team1: number;
  team2: number;
}

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
  startTime?: Date;
  finishedAt?: Date;
  score: MatchScore;
  winner?: string;
  winnerTeam?: string;
  createdAt?: Date;
}

export interface SessionRecord {
  title: string;
  numCourts: number;
  isDoubles: boolean;
  isActive: boolean;
  status?: SessionStatus;
  scheduledAt?: Date;
  endsAt?: Date;
  venue?: string;
  courtFormats: PlayFormat[];
  adminId: Types.ObjectId;
  players: SessionPlayer[];
  matches: SessionMatch[];
  endedAt?: Date;
}

export type SessionDocument = mongoose.HydratedDocument<SessionRecord>;

const playerSchema = new Schema<SessionPlayer>({
  username: { type: String, required: true },
  isGuest: { type: Boolean, default: false },
  preferredFormat: { type: String, enum: ['singles', 'doubles'] },
  age: Number,
  level: String,
  rating: { type: Number, default: 1500 },
  rd: { type: Number, default: 350 },
  vol: { type: Number, default: 0.06 },
  joinedAt: { type: Date, default: Date.now },
});

const matchSchema = new Schema<SessionMatch>({
  player1: String,
  player2: String,
  player3: String,
  player4: String,
  court: { type: Number, required: true },
  isDoubles: Boolean,
  matchId: { type: String, required: true },
  status: { type: String, enum: ['proposed', 'ongoing', 'finished'], default: 'ongoing' },
  awaitingNextFinish: { type: Boolean, default: false },
  manualOverride: { type: Boolean, default: false },
  startTime: Date,
  finishedAt: Date,
  score: {
    team1: { type: Number, default: 0 },
    team2: { type: Number, default: 0 },
  },
  winner: String,
  winnerTeam: String,
  createdAt: { type: Date, default: Date.now },
});

const sessionSchema = new Schema<SessionRecord>({
  title: { type: String, default: 'Badminton Session' },
  numCourts: { type: Number, default: 1 },
  isDoubles: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  status: { type: String, enum: ['scheduled', 'active', 'completed'] },
  scheduledAt: Date,
  endsAt: Date,
  venue: String,
  courtFormats: { type: [String], enum: ['singles', 'doubles'], default: [] },
  adminId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  players: { type: [playerSchema], default: [] },
  matches: { type: [matchSchema], default: [] },
  endedAt: Date,
}, { timestamps: true });

const Session = mongoose.model<SessionRecord>('Session', sessionSchema);
export default Session;