import mongoose, { Schema, Types } from 'mongoose';

export interface ClubRecord {
    name: string;
    ownerId: Types.ObjectId;
    isDefault: boolean;
    inviteCodeHash?: string;
}

const clubSchema = new Schema<ClubRecord>({
    name: { type: String, required: true, trim: true },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    isDefault: { type: Boolean, default: false },
    inviteCodeHash: String
}, { timestamps: true });

clubSchema.index({ ownerId: 1 }, { unique: true, partialFilterExpression: { isDefault: true } });

const Club = mongoose.model<ClubRecord>('Club', clubSchema);
export default Club;
