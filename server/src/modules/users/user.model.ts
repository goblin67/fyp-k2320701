import mongoose, { Schema } from 'mongoose';

export interface MatchHistoryEntry {
  opponent: string;
  teammate?: string;
  isWin: boolean;
  eloBefore: number;
  eloAfter: number;
  matchDate: Date;
}

export interface ClubMembership {
  clubId: mongoose.Types.ObjectId;
  status: 'pending' | 'approved';
  requestedAt: Date;
  approvedAt?: Date;
}

export interface UserRecord {
  username: string;
  password: string;
  role: 'player' | 'organiser';
  organiserAccess: boolean;
  isDeleted?: boolean;
  age?: number;
  level?: string;
  bio?: string;
  loginDays: string[];
  rating: number;
  rd: number;
  vol: number;
  matchHistory: MatchHistoryEntry[];
  clubs: ClubMembership[];
}

export type UserDocument = mongoose.HydratedDocument<UserRecord>;

const matchHistorySchema = new Schema<MatchHistoryEntry>({
  opponent: { type: String, required: true },
  teammate: String,
  isWin: { type: Boolean, required: true },
  eloBefore: { type: Number, required: true },
  eloAfter: { type: Number, required: true },
  matchDate: { type: Date, default: Date.now },
});

const clubMembershipSchema = new Schema<ClubMembership>({
  clubId: { type: Schema.Types.ObjectId, ref: 'Club', required: true },
  status: { type: String, enum: ['pending', 'approved'], required: true },
  requestedAt: { type: Date, default: Date.now },
  approvedAt: Date
}, { _id: false });

const userSchema = new Schema<UserRecord>({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['player', 'organiser'], default: 'player' },
  organiserAccess: { type: Boolean, default: false },
  isDeleted: { type: Boolean, default: false },
  age: Number,
  level: String,
  bio: {
    type: String,
    default: '',
    validate: {
      validator: (value: string) => [...value].length <= 100,
      message: 'Bio must be 100 characters or fewer.'
    }
  },
  loginDays: { type: [String], default: [] },
  rating: { type: Number, default: 1500 },
  rd: { type: Number, default: 350 },
  vol: { type: Number, default: 0.06 },
  matchHistory: { type: [matchHistorySchema], default: [] },
  clubs: { type: [clubMembershipSchema], default: [] },
});

const User = mongoose.model<UserRecord>('User', userSchema);
export default User;