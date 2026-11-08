import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import express from 'express';
import authMiddleware from '../auth/auth.middleware.js';
import Club from '../clubs/club.model.js';
import User from '../users/user.model.js';
import Session, { type PlayFormat, type SessionDocument } from './session.model.js';
import { buildWaitingMatches, getFreeCourts } from './session.controller.js';

const router = express.Router();

const validateJoinLink = async (
    sessionId: unknown,
    code: unknown
): Promise<{ session: SessionDocument; status: 'scheduled' | 'active' } | { error: string; statusCode: number }> => {
    if (typeof sessionId !== 'string' || !/^[a-f\d]{24}$/i.test(sessionId) ||
        typeof code !== 'string' || !/^[a-f\d]{64}$/i.test(code)) {
        return { error: 'This session QR link is invalid', statusCode: 400 };
    }

    const session = await Session.findById(sessionId).select('+sessionJoinCodeHash');
    if (!session || !session.sessionJoinCodeHash) {
        return { error: 'This session QR link is no longer available', statusCode: 404 };
    }
    const requestedHash = createHash('sha256').update(code).digest();
    const storedHash = Buffer.from(session.sessionJoinCodeHash, 'hex');
    if (storedHash.length !== requestedHash.length || !timingSafeEqual(storedHash, requestedHash)) {
        return { error: 'This session QR link is invalid or has been replaced', statusCode: 404 };
    }

    const status = session.status ?? (session.isActive ? 'active' : 'completed');
    if (status !== 'scheduled' && status !== 'active') {
        return { error: 'This session is no longer accepting players', statusCode: 409 };
    }
    if (!session.clubId) {
        return { error: 'This session is not associated with a club', statusCode: 409 };
    }
    return { session, status };
};

router.post('/:sessionId', authMiddleware, async (req, res) => {
    try {
        const sessionId = Array.isArray(req.params.sessionId)
            ? req.params.sessionId[0]
            : req.params.sessionId;
        const { code } = req.body as { code?: unknown };
        const validation = await validateJoinLink(sessionId, code);
        if ('error' in validation) {
            res.status(validation.statusCode).json({ error: validation.error });
            return;
        }
        const { session, status: sessionStatus } = validation;
        const [club, user] = await Promise.all([
            Club.findById(session.clubId).select('name allowedFormats defaultFormat'),
            User.findById(req.user.id)
        ]);
        if (!club || !user) {
            res.status(404).json({ error: 'Session club or player account could not be found' });
            return;
        }
        if (user.isDeleted || user.role === 'organiser') {
            res.status(403).json({ error: 'Only player accounts can join from a session QR code' });
            return;
        }

        const allowedFormats = club.allowedFormats?.length
            ? club.allowedFormats
            : ['singles', 'doubles'] as PlayFormat[];
        const preferredFormat = allowedFormats.includes(club.defaultFormat)
            ? club.defaultFormat
            : allowedFormats[0]!;
        const membership = user.clubs.find((entry) => entry.clubId.toString() === club._id.toString());
        if (membership) {
            membership.status = 'approved';
            membership.approvedAt = new Date();
        } else {
            user.clubs.push({
                clubId: club._id,
                status: 'approved',
                requestedAt: new Date(),
                approvedAt: new Date()
            });
        }

        const alreadyInSession = session.players.some((player) =>
            player.username.toLowerCase() === user.username.toLowerCase()
        );
        if (!alreadyInSession) {
            session.players.push({
                username: user.username,
                isGuest: false,
                preferredFormat,
                age: user.age,
                level: user.level,
                rating: user.rating,
                rd: user.rd,
                vol: user.vol,
                joinedAt: new Date()
            });
        }

        await user.save();
        if (sessionStatus === 'active' && !alreadyInSession) {
            const assigned = new Set(
                session.matches
                    .filter((match) => match.status !== 'finished')
                    .flatMap((match) => [match.player1, match.player2, match.player3, match.player4])
                    .filter((username): username is string => Boolean(username))
            );
            const waitingPlayers = session.players.filter((player) => !assigned.has(player.username));
            const newMatches = buildWaitingMatches(waitingPlayers, getFreeCourts(session), session, true);
            if (newMatches.length) session.matches.push(...newMatches);
            session.isActive = true;
        }
        await session.save();

        res.json({
            message: alreadyInSession ? 'You are already on this session roster' : 'You have joined the session',
            sessionTitle: session.title,
            clubName: club.name,
            status: sessionStatus
        });
    } catch (error) {
        console.error('SESSION QR JOIN ERROR:', error);
        res.status(500).json({ error: 'Could not join this session' });
    }
});

router.post('/:sessionId/guest', async (req, res) => {
    try {
        const sessionId = Array.isArray(req.params.sessionId)
            ? req.params.sessionId[0]
            : req.params.sessionId;
        const { code, username: rawUsername } = req.body as { code?: unknown; username?: unknown };
        const validation = await validateJoinLink(sessionId, code);
        if ('error' in validation) {
            res.status(validation.statusCode).json({ error: validation.error });
            return;
        }
        const { session, status: sessionStatus } = validation;
        const username = typeof rawUsername === 'string' ? rawUsername.trim() : '';
        if (!username || [...username].length > 40) {
            res.status(400).json({ error: 'Enter a name between 1 and 40 characters.' });
            return;
        }

        const accountNamePattern = new RegExp(`^${username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
        if (await User.exists({ username: accountNamePattern, isDeleted: { $ne: true } })) {
            res.status(409).json({ error: 'This name belongs to an account. Sign in or choose another guest name.' });
            return;
        }
        if (session.players.some((player) => player.username.toLowerCase() === username.toLowerCase())) {
            res.status(409).json({ error: 'This name is already on the session roster. Choose another guest name.' });
            return;
        }

        const club = await Club.findById(session.clubId).select('name allowedFormats defaultFormat');
        if (!club) {
            res.status(404).json({ error: 'The session club could not be found.' });
            return;
        }
        const allowedFormats = club.allowedFormats?.length
            ? club.allowedFormats
            : ['singles', 'doubles'] as PlayFormat[];
        const preferredFormat = allowedFormats.includes(club.defaultFormat)
            ? club.defaultFormat
            : allowedFormats[0]!;
        session.players.push({
            username,
            isGuest: true,
            preferredFormat,
            rating: 1500,
            rd: 350,
            vol: 0.06,
            joinedAt: new Date()
        });

        if (sessionStatus === 'active') {
            const assigned = new Set(
                session.matches
                    .filter((match) => match.status !== 'finished')
                    .flatMap((match) => [match.player1, match.player2, match.player3, match.player4])
                    .filter((name): name is string => Boolean(name))
            );
            const waitingPlayers = session.players.filter((player) => !assigned.has(player.username));
            const newMatches = buildWaitingMatches(waitingPlayers, getFreeCourts(session), session, true);
            if (newMatches.length) session.matches.push(...newMatches);
            session.isActive = true;
        }
        await session.save();

        res.status(201).json({
            message: 'You have joined the session as a guest',
            sessionTitle: session.title,
            clubName: club.name,
            status: sessionStatus,
            isGuest: true
        });
    } catch (error) {
        console.error('SESSION QR GUEST JOIN ERROR:', error);
        res.status(500).json({ error: 'Could not join this session as a guest' });
    }
});

export default router;
