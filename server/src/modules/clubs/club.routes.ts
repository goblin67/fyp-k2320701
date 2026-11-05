import bcrypt from 'bcryptjs';
import express from 'express';
import authMiddleware from '../auth/auth.middleware.js';
import Club from './club.model.js';
import User from '../users/user.model.js';

const router = express.Router();

router.get('/', async (_req, res) => {
    try {
        const clubs = await Club.find().select('name').sort({ name: 1 }).lean();
        res.json(clubs.map((club) => ({ id: club._id.toString(), name: club.name })));
    } catch (error) {
        console.error('CLUB LIST ERROR:', error);
        res.status(500).json({ error: 'Could not load clubs' });
    }
});

router.get('/mine', authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('clubs').lean();
        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        const clubs = await Club.find({ _id: { $in: user.clubs.map((membership) => membership.clubId) } })
            .select('name')
            .lean();
        const clubNames = new Map(clubs.map((club) => [club._id.toString(), club.name]));
        res.json(user.clubs.flatMap((membership) => {
            const name = clubNames.get(membership.clubId.toString());
            return name ? [{
                clubId: membership.clubId.toString(),
                name,
                status: membership.status,
                requestedAt: membership.requestedAt,
                approvedAt: membership.approvedAt
            }] : [];
        }));
    } catch (error) {
        console.error('USER CLUB MEMBERSHIPS ERROR:', error);
        res.status(500).json({ error: 'Could not load club memberships' });
    }
});

router.post('/join', authMiddleware, async (req, res) => {
    try {
        const { clubId, inviteCode } = req.body as { clubId?: unknown; inviteCode?: unknown };
        if (typeof clubId !== 'string' || !/^[a-f\d]{24}$/i.test(clubId) ||
            typeof inviteCode !== 'string' || !inviteCode.trim() || inviteCode.length > 100) {
            res.status(400).json({ error: 'Choose a club and enter its invite code' });
            return;
        }

        const [club, user] = await Promise.all([
            Club.findById(clubId).select('inviteCodeHash'),
            User.findById(req.user.id)
        ]);
        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        if (!club?.inviteCodeHash || !(await bcrypt.compare(inviteCode.trim(), club.inviteCodeHash))) {
            res.status(400).json({ error: 'The club invite code is invalid' });
            return;
        }

        const existing = user.clubs.find((membership) => membership.clubId.toString() === clubId);
        if (existing?.status === 'approved') {
            res.status(409).json({ error: 'You are already a member of this club' });
            return;
        }
        if (existing?.status === 'pending') {
            res.json({ message: 'Your membership request is awaiting approval' });
            return;
        }

        user.clubs.push({
            clubId: club._id,
            status: 'pending',
            requestedAt: new Date()
        });
        await user.save();
        res.status(201).json({ message: 'Membership request sent for organiser approval' });
    } catch (error) {
        console.error('CLUB JOIN REQUEST ERROR:', error);
        res.status(500).json({ error: 'Could not request club membership' });
    }
});

export default router;
