import express from 'express';
const router = express.Router();
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import User from '../users/user.model.js';
import Session from './session.model.js';
import authMiddleware from '../auth/auth.middleware.js';
import organiserMiddleware from '../auth/organiser.middleware.js';
import { startSession, endMatch, endSession, addPlayerToSession, removePlayerFromSession, replaceMatchPlayer } from './session.controller.js';

const errorMessage = (error: unknown): string => error instanceof Error ? error.message : 'Unknown error';

const getLifetimePoints = async (username: string) => {
    const sessions = await Session.find({
        players: { $elemMatch: { username, isGuest: false } },
        matches: {
            $elemMatch: {
                status: 'finished',
                $or: [
                    { player1: username },
                    { player2: username },
                    { player3: username },
                    { player4: username }
                ]
            }
        }
    }).select('players matches').lean();

    return sessions.reduce((totals, session) => {
        session.matches.forEach((match) => {
            if (match.status !== 'finished') return;
            const isDoublesMatch = match.isDoubles || Boolean(match.player3 || match.player4);
            const onTeamOne = isDoublesMatch
                ? match.player1 === username || match.player2 === username
                : match.player1 === username;
            const onTeamTwo = isDoublesMatch
                ? match.player3 === username || match.player4 === username
                : match.player2 === username;
            if (onTeamOne) {
                totals.completedMatches += 1;
                totals.pointsFor += match.score.team1;
                totals.pointsAgainst += match.score.team2;
            } else if (onTeamTwo) {
                totals.completedMatches += 1;
                totals.pointsFor += match.score.team2;
                totals.pointsAgainst += match.score.team1;
            }
        });
        return totals;
    }, { completedMatches: 0, pointsFor: 0, pointsAgainst: 0 });
};

router.get('/me', authMiddleware, async (req, res) => {
    try {
        if (!req.user || !req.user.id) {
            return res.status(401).json({ msg: "Not authorized, user data missing" });
        }

        const user = await User.findById(req.user.id).select('username bio loginDays matchHistory');
        if (!user) return res.status(404).json({ msg: "User not found" });
        const lifetimePoints = await getLifetimePoints(user.username);

        res.json({
            username: user.username,
            bio: user.bio ?? '',
            loginDays: user.loginDays ?? [],
            ...lifetimePoints,
            matchHistory: user.matchHistory.map(({ opponent, teammate, isWin, matchDate }) => ({
                opponent,
                teammate,
                isWin,
                matchDate
            }))
        });
    } catch (err) {
        console.error("ME Error:", errorMessage(err));
        res.status(500).json({ error: "Server failed to fetch user profile" });
    }
});

router.post('/me/password', authMiddleware, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body as { currentPassword?: unknown; newPassword?: unknown };
        if (
            typeof currentPassword !== 'string' ||
            typeof newPassword !== 'string' ||
            Buffer.byteLength(newPassword, 'utf8') < 8 ||
            Buffer.byteLength(newPassword, 'utf8') > 72
        ) {
            return res.status(400).json({ error: 'Enter your current password and a new password between 8 and 72 bytes.' });
        }
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ error: 'User not found.' });
        if (!await bcrypt.compare(currentPassword, user.password)) {
            return res.status(400).json({ error: 'Current password is incorrect.' });
        }
        user.password = await bcrypt.hash(newPassword, 10);
        await user.save();
        return res.json({ message: 'Password updated.' });
    } catch (err) {
        console.error('PASSWORD UPDATE ERROR:', errorMessage(err));
        return res.status(500).json({ error: 'Could not update password.' });
    }
});

router.patch('/me/bio', authMiddleware, async (req, res) => {
    try {
        const { bio } = req.body as { bio?: unknown };
        if (typeof bio !== 'string' || [...bio.trim()].length > 100) {
            return res.status(400).json({ error: 'Bio must be 100 characters or fewer.' });
        }
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ error: 'User not found.' });
        user.bio = bio.trim();
        await user.save();
        return res.json({ bio: user.bio });
    } catch (err) {
        console.error('BIO UPDATE ERROR:', errorMessage(err));
        return res.status(500).json({ error: 'Could not update your bio.' });
    }
});

router.get('/me/export', authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('username age level bio role organiserAccess matchHistory').lean();
        if (!user) return res.status(404).json({ error: 'User not found.' });
        const lifetimePoints = await getLifetimePoints(user.username);
        res.setHeader('Content-Disposition', 'attachment; filename="courtsync-account-data.json"');
        return res.json({
            username: user.username,
            age: user.age ?? null,
            level: user.level ?? null,
            bio: user.bio ?? '',
            role: user.role,
            organiserAccess: user.organiserAccess,
            matchHistory: user.matchHistory.map(({ opponent, teammate, isWin, matchDate }) => ({
                opponent,
                teammate,
                isWin,
                matchDate
            })),
            lifetimePoints
        });
    } catch (err) {
        console.error('ACCOUNT EXPORT ERROR:', errorMessage(err));
        return res.status(500).json({ error: 'Could not export account data.' });
    }
});

router.delete('/me', authMiddleware, async (req, res) => {
    try {
        const { password, confirmation } = req.body as { password?: unknown; confirmation?: unknown };
        if (typeof password !== 'string' || typeof confirmation !== 'string') {
            return res.status(400).json({ error: 'Enter your password and type your username to confirm deletion.' });
        }
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ error: 'User not found.' });
        if (confirmation !== user.username) {
            return res.status(400).json({ error: 'The confirmation username does not match.' });
        }
        if (!await bcrypt.compare(password, user.password)) {
            return res.status(400).json({ error: 'Password is incorrect.' });
        }
        user.password = await bcrypt.hash(randomBytes(48).toString('hex'), 10);
        user.age = undefined;
        user.level = undefined;
        user.bio = '';
        user.loginDays = [];
        user.role = 'player';
        user.organiserAccess = false;
        user.isDeleted = true;
        user.matchHistory = [];
        user.rating = 1500;
        user.rd = 350;
        user.vol = 0.06;
        await user.save();
        return res.json({ message: 'Account deleted. Historical session results have been preserved.' });
    } catch (err) {
        console.error('ACCOUNT DELETION ERROR:', errorMessage(err));
        return res.status(500).json({ error: 'Could not delete account.' });
    }
});

router.get('/active', authMiddleware, async (req, res) => {
    try {
        let session = await Session.findOne({ adminId: req.user.id, isActive: true })
            .sort({ createdAt: -1 });

        if (!session) {
            session = await Session.findOne({ adminId: req.user.id })
                .sort({ createdAt: -1 });
        }

        res.json(session || null);
    } catch (err) {
        console.error("ACTIVE SESSION Error:", errorMessage(err));
        res.status(500).json({ error: "Server error fetching active session" });
    }
});

router.get('/history', authMiddleware, async (req, res) => {
    try {
        const sessions = await Session.find({
            $or: [
                { adminId: req.user.id },
                { 'players.username': req.user.username }
            ]
        })
            .sort({ createdAt: -1 })
            .limit(100);
        res.json(sessions);
    } catch (err) {
        console.error("SESSION HISTORY Error:", errorMessage(err));
        res.status(500).json({ error: "Server error fetching session history" });
    }
});

// Leaderboard: where egos go to die
router.get('/leaderboard', authMiddleware, async (req, res) => {
    try {
        const currentUser = await User.findById(req.user.id).select('username matchHistory');
        if (!currentUser) {
            return res.status(404).json({ error: 'User not found' });
        }

        const sessions = await Session.find({
            $or: [
                { adminId: req.user.id },
                { 'players.username': currentUser.username }
            ]
        }).lean();

        const sharedUsernames = new Set<string>();
        const adminIds = new Set<string>();

        sessions.forEach((session) => {
            session.players.forEach((player) => {
                if (player.username && player.username !== currentUser.username) {
                    sharedUsernames.add(player.username);
                }
            });
            if (session.adminId && session.adminId.toString() !== req.user.id) {
                adminIds.add(session.adminId.toString());
            }
        });

        if (adminIds.size > 0) {
            const admins = await User.find({ _id: { $in: Array.from(adminIds) }, isDeleted: { $ne: true } }).select('username');
            admins.forEach((admin) => sharedUsernames.add(admin.username));
        }

        const usernames = Array.from(sharedUsernames);
        const leaderboardUsers = await User.find({ username: { $in: [...usernames, currentUser.username] }, isDeleted: { $ne: true } })
            .select('username matchHistory')
            .lean();

        const rows = leaderboardUsers.map((user) => {
            const games = (user.matchHistory || []).length;
            const wins = (user.matchHistory || []).filter((match) => match.isWin).length;
            const winRate = games > 0 ? Math.round((wins / games) * 100) : 0;
            return {
                player: user.username,
                games,
                wins,
                winRate
            };
        });

        rows.sort((a, b) => b.wins - a.wins || b.winRate - a.winRate || b.games - a.games || a.player.localeCompare(b.player));
        const ranked = rows.map((row, index) => ({ rank: index + 1, ...row }));

        res.json(ranked);
    } catch (err) {
        console.error('LEADERBOARD ERROR:', err);
        res.status(500).json({ error: 'Server error fetching leaderboard' });
    }
});

router.get('/:id', authMiddleware, async (req, res) => {
    try {
        const session = await Session.findOne({
            _id: req.params.id,
            $or: [
                { adminId: req.user.id },
                { 'players.username': req.user.username }
            ]
        });
        if (!session) {
            return res.status(404).json({ error: 'Session not found' });
        }
        res.json(session);
    } catch (err) {
        console.error("SESSION FETCH Error:", errorMessage(err));
        res.status(500).json({ error: "Server error fetching session" });
    }
});

router.post('/start', authMiddleware, organiserMiddleware, startSession);

router.post('/end', authMiddleware, endMatch);

router.post('/close', authMiddleware, endSession);

router.post('/player/add', authMiddleware, addPlayerToSession);

router.post('/player/remove', authMiddleware, removePlayerFromSession);

router.post('/player/replace', authMiddleware, replaceMatchPlayer);

export default router;