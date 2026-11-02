import express from 'express';
import authMiddleware from '../auth/auth.middleware.js';
import organiserMiddleware from '../auth/organiser.middleware.js';
import User from '../users/user.model.js';
import Session, { type PlayFormat, type SessionPlayer } from './session.model.js';
import { getFreeCourts, buildWaitingMatches } from './session.controller.js';

const router = express.Router();
const formats: PlayFormat[] = ['singles', 'doubles'];

const isFormat = (value: unknown): value is PlayFormat =>
    typeof value === 'string' && formats.includes(value as PlayFormat);

router.use(authMiddleware, organiserMiddleware);

router.get('/players', async (req, res) => {
    try {
        const players = await User.find({ $or: [{ role: 'player' }, { role: { $exists: false } }] })
            .select('username age level rating')
            .sort({ username: 1 })
            .lean();
        res.json(players);
    } catch (error) {
        console.error('ORGANISER PLAYER LIST ERROR:', error);
        res.status(500).json({ error: 'Could not load players' });
    }
});

router.get('/sessions', async (req, res) => {
    try {
        const sessions = await Session.find({ adminId: req.user.id })
            .sort({ scheduledAt: 1, createdAt: -1 })
            .limit(100);
        res.json(sessions);
    } catch (error) {
        console.error('ORGANISER SESSION LIST ERROR:', error);
        res.status(500).json({ error: 'Could not load sessions' });
    }
});

router.post('/sessions', async (req, res) => {
    try {
        const { title, scheduledAt, endsAt, venue } = req.body as {
            title?: unknown;
            scheduledAt?: unknown;
            endsAt?: unknown;
            venue?: unknown;
        };
        const parsedStart = typeof scheduledAt === 'string' ? new Date(scheduledAt) : null;
        const parsedEnd = typeof endsAt === 'string' && endsAt ? new Date(endsAt) : null;

        if (typeof title !== 'string' || !title.trim() || !parsedStart || Number.isNaN(parsedStart.getTime())) {
            res.status(400).json({ error: 'A session title and valid start date/time are required' });
            return;
        }
        if (parsedEnd && (Number.isNaN(parsedEnd.getTime()) || parsedEnd <= parsedStart)) {
            res.status(400).json({ error: 'End time must be later than start time' });
            return;
        }
        if (venue !== undefined && typeof venue !== 'string') {
            res.status(400).json({ error: 'Venue must be text' });
            return;
        }

        const session = await Session.create({
            title: title.trim(),
            scheduledAt: parsedStart,
            endsAt: parsedEnd ?? undefined,
            venue: typeof venue === 'string' ? venue.trim() : undefined,
            numCourts: 0,
            isDoubles: false,
            isActive: false,
            status: 'scheduled',
            adminId: req.user.id,
            players: [],
            matches: [],
            courtFormats: []
        });
        res.status(201).json(session);
    } catch (error) {
        console.error('ORGANISER SESSION CREATE ERROR:', error);
        res.status(500).json({ error: 'Could not create session' });
    }
});

router.patch('/sessions/:id', async (req, res) => {
    try {
        const session = await Session.findOne({ _id: req.params.id, adminId: req.user.id });
        if (!session) {
            res.status(404).json({ error: 'Session not found' });
            return;
        }
        if (session.status !== 'scheduled') {
            res.status(409).json({ error: 'Only planned sessions can be edited' });
            return;
        }

        const { title, scheduledAt, endsAt, venue } = req.body as {
            title?: unknown;
            scheduledAt?: unknown;
            endsAt?: unknown;
            venue?: unknown;
        };
        const nextTitle = title === undefined ? session.title : title;
        const nextStart = scheduledAt === undefined ? session.scheduledAt : new Date(String(scheduledAt));
        const nextEnd = endsAt === undefined || endsAt === '' ? undefined : new Date(String(endsAt));

        if (typeof nextTitle !== 'string' || !nextTitle.trim() || !nextStart || Number.isNaN(nextStart.getTime())) {
            res.status(400).json({ error: 'A session title and valid start date/time are required' });
            return;
        }
        if (nextEnd && (Number.isNaN(nextEnd.getTime()) || nextEnd <= nextStart)) {
            res.status(400).json({ error: 'End time must be later than start time' });
            return;
        }
        if (venue !== undefined && typeof venue !== 'string') {
            res.status(400).json({ error: 'Venue must be text' });
            return;
        }

        session.title = nextTitle.trim();
        session.scheduledAt = nextStart;
        session.endsAt = nextEnd;
        if (venue !== undefined) session.venue = venue.trim();
        await session.save();
        res.json(session);
    } catch (error) {
        console.error('ORGANISER SESSION UPDATE ERROR:', error);
        res.status(500).json({ error: 'Could not update session' });
    }
});

router.post('/sessions/:id/start', async (req, res) => {
    try {
        const session = await Session.findOne({ _id: req.params.id, adminId: req.user.id });
        if (!session) {
            res.status(404).json({ error: 'Session not found' });
            return;
        }
        if (session.status !== 'scheduled') {
            res.status(409).json({ error: 'This session is not planned and cannot be started' });
            return;
        }

        const { players, courtFormats } = req.body as {
            players?: unknown;
            courtFormats?: unknown;
        };
        if (!Array.isArray(players) || players.length === 0) {
            res.status(400).json({ error: 'Select at least one player' });
            return;
        }
        if (!Array.isArray(courtFormats) || courtFormats.length < 1 || courtFormats.length > 6 || !courtFormats.every(isFormat)) {
            res.status(400).json({ error: 'Choose a format for each of 1 to 6 courts' });
            return;
        }

        const seenNames = new Set<string>();
        const sessionPlayers: SessionPlayer[] = [];
        for (const entry of players) {
            if (typeof entry !== 'object' || entry === null) {
                res.status(400).json({ error: 'Player entries are invalid' });
                return;
            }
            const player = entry as {
                username?: unknown;
                kind?: unknown;
                preferredFormat?: unknown;
                age?: unknown;
                level?: unknown;
            };
            const username = typeof player.username === 'string' ? player.username.trim() : '';
            if (!username || !isFormat(player.preferredFormat) || (player.kind !== 'account' && player.kind !== 'guest')) {
                res.status(400).json({ error: 'Each player needs a name, player type, and singles/doubles preference' });
                return;
            }
            if (seenNames.has(username.toLowerCase())) {
                res.status(400).json({ error: `Player "${username}" was selected more than once` });
                return;
            }
            seenNames.add(username.toLowerCase());

            const user = player.kind === 'account' ? await User.findOne({ username }) : null;
            if (player.kind === 'account' && !user) {
                res.status(404).json({ error: `Account "${username}" was not found` });
                return;
            }
            if (player.kind === 'guest' && await User.exists({ username })) {
                res.status(409).json({ error: `"${username}" already has an account; select the account instead` });
                return;
            }
            if (player.age !== undefined && player.age !== null && (
                typeof player.age !== 'number' || !Number.isInteger(player.age) || player.age < 1 || player.age > 120
            )) {
                res.status(400).json({ error: `Age for "${username}" must be between 1 and 120` });
                return;
            }
            if (player.level !== undefined && typeof player.level !== 'string') {
                res.status(400).json({ error: `Playing level for "${username}" must be text` });
                return;
            }

            sessionPlayers.push({
                username,
                isGuest: player.kind === 'guest',
                preferredFormat: player.preferredFormat,
                age: typeof player.age === 'number' ? player.age : undefined,
                level: typeof player.level === 'string' ? player.level.trim() : user?.level,
                rating: user?.rating ?? 1500,
                rd: user?.rd ?? 350,
                vol: user?.vol ?? 0.06,
                joinedAt: new Date()
            });
        }

        session.players = sessionPlayers;
        session.courtFormats = courtFormats;
        session.numCourts = courtFormats.length;
        session.isDoubles = courtFormats.every((format) => format === 'doubles');
        session.status = 'active';
        session.isActive = true;
        session.matches = buildWaitingMatches(session.players, getFreeCourts(session), session);
        if (session.matches.length === 0) {
            res.status(400).json({ error: 'No court has enough players who prefer its format. Adjust the player preferences or court formats.' });
            return;
        }

        await session.save();
        res.json(session);
    } catch (error) {
        console.error('ORGANISER SESSION START ERROR:', error);
        res.status(500).json({ error: 'Could not start session' });
    }
});

router.post('/sessions/:id/players', async (req, res) => {
    try {
        const session = await Session.findOne({ _id: req.params.id, adminId: req.user.id });
        if (!session) {
            res.status(404).json({ error: 'Session not found' });
            return;
        }
        if (session.status !== 'active') {
            res.status(409).json({ error: 'Players can only be added to a live session' });
            return;
        }

        const { username: rawUsername, kind, preferredFormat, age, level } = req.body as {
            username?: unknown;
            kind?: unknown;
            preferredFormat?: unknown;
            age?: unknown;
            level?: unknown;
        };
        const username = typeof rawUsername === 'string' ? rawUsername.trim() : '';
        if (!username || (kind !== 'account' && kind !== 'guest') || !isFormat(preferredFormat)) {
            res.status(400).json({ error: 'Name, player type, and singles/doubles preference are required' });
            return;
        }
        if (session.players.some((player) => player.username.toLowerCase() === username.toLowerCase())) {
            res.status(409).json({ error: 'Player is already in this session' });
            return;
        }
        const user = kind === 'account' ? await User.findOne({ username }) : null;
        if (kind === 'account' && !user) {
            res.status(404).json({ error: 'Player account not found' });
            return;
        }
        if (kind === 'guest' && await User.exists({ username })) {
            res.status(409).json({ error: 'This name belongs to an account; select the account instead' });
            return;
        }
        if (age !== undefined && age !== null && (
            typeof age !== 'number' || !Number.isInteger(age) || age < 1 || age > 120
        )) {
            res.status(400).json({ error: 'Age must be between 1 and 120' });
            return;
        }
        if (level !== undefined && typeof level !== 'string') {
            res.status(400).json({ error: 'Playing level must be text' });
            return;
        }

        session.players.push({
            username,
            isGuest: kind === 'guest',
            preferredFormat,
            age: typeof age === 'number' ? age : undefined,
            level: typeof level === 'string' ? level.trim() : user?.level,
            rating: user?.rating ?? 1500,
            rd: user?.rd ?? 350,
            vol: user?.vol ?? 0.06,
            joinedAt: new Date()
        });
        const waitingPlayers = session.players.filter((player) => !session.matches.some(
            (match) => match.status === 'ongoing' && [match.player1, match.player2, match.player3, match.player4].includes(player.username)
        ));
        const newMatches = buildWaitingMatches(waitingPlayers, getFreeCourts(session), session);
        if (newMatches.length) session.matches.push(...newMatches);
        session.isActive = true;
        await session.save();
        res.status(201).json(session);
    } catch (error) {
        console.error('ORGANISER PLAYER ADD ERROR:', error);
        res.status(500).json({ error: 'Could not add player to session' });
    }
});

export default router;
