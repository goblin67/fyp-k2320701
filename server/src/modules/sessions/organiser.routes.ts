import express from 'express';
import authMiddleware from '../auth/auth.middleware.js';
import organiserMiddleware from '../auth/organiser.middleware.js';
import User from '../users/user.model.js';
import Session, { type PlayFormat, type PlayerField, type SessionDocument, type SessionMatch, type SessionPlayer } from './session.model.js';
import { getFreeCourts, buildWaitingMatches, updateMatchRatings } from './session.controller.js';

const router = express.Router();
const formats: PlayFormat[] = ['singles', 'doubles'];

const isFormat = (value: unknown): value is PlayFormat =>
    typeof value === 'string' && formats.includes(value as PlayFormat);

const getWaitingPlayers = (session: SessionDocument | null) => {
    if (!session) return [];
    const assigned = new Set(
        session.matches
            .filter((match) => match.status !== 'finished')
            .flatMap((match) => [match.player1, match.player2, match.player3, match.player4])
            .filter((username): username is string => Boolean(username))
    );
    return session.players.filter((player) => !assigned.has(player.username));
};

const getMatchFields = (match: SessionMatch): PlayerField[] =>
    (match.isDoubles ?? false)
        ? ['player1', 'player2', 'player3', 'player4']
        : ['player1', 'player2'];

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

router.get('/player-stats', async (req, res) => {
    try {
        const sessions = await Session.find({ adminId: req.user.id })
            .select('title scheduledAt players matches')
            .lean();
        const registeredPlayerNames = new Set(
            sessions.flatMap((session) =>
                session.players
                    .filter((player) => !player.isGuest)
                    .map((player) => player.username)
            )
        );
        const accounts = await User.find({ username: { $in: [...registeredPlayerNames] } })
            .select('username rating')
            .lean();
        const accountRatings = new Map(accounts.map((account) => [account.username, account.rating]));
        const playerStats = new Map([...registeredPlayerNames].map((username) => [
            username,
            {
                username,
                rating: accountRatings.get(username) ?? 1500,
                games: 0,
                wins: 0,
                pointsFor: 0,
                pointsAgainst: 0,
                matches: [] as {
                    sessionId: string;
                    sessionTitle: string;
                    matchId: string;
                    date: Date | undefined;
                    court: number;
                    isDoubles: boolean;
                    side: string;
                    teammates: string;
                    opponents: string;
                    pointsFor: number;
                    pointsAgainst: number;
                    won: boolean;
                }[]
            }
        ]));

        for (const session of sessions) {
            const registeredInSession = new Set(
                session.players.filter((player) => !player.isGuest).map((player) => player.username)
            );
            for (const match of session.matches) {
                if (match.status !== 'finished') continue;
                const isDoubles = Boolean(match.isDoubles);
                const teams = [
                    {
                        side: 'Side 1',
                        players: (isDoubles ? [match.player1, match.player2] : [match.player1])
                            .filter((username): username is string => Boolean(username)),
                        opponents: (isDoubles ? [match.player3, match.player4] : [match.player2])
                            .filter((username): username is string => Boolean(username)),
                        pointsFor: match.score.team1,
                        pointsAgainst: match.score.team2,
                        won: match.winnerTeam === 'team1' || (!isDoubles && match.winner === match.player1)
                    },
                    {
                        side: 'Side 2',
                        players: (isDoubles ? [match.player3, match.player4] : [match.player2])
                            .filter((username): username is string => Boolean(username)),
                        opponents: (isDoubles ? [match.player1, match.player2] : [match.player1])
                            .filter((username): username is string => Boolean(username)),
                        pointsFor: match.score.team2,
                        pointsAgainst: match.score.team1,
                        won: match.winnerTeam === 'team2' || (!isDoubles && match.winner === match.player2)
                    }
                ];
                for (const team of teams) {
                    for (const username of team.players) {
                        if (!registeredInSession.has(username)) continue;
                        const stats = playerStats.get(username);
                        if (!stats) continue;
                        stats.games += 1;
                        if (team.won) stats.wins += 1;
                        stats.pointsFor += team.pointsFor;
                        stats.pointsAgainst += team.pointsAgainst;
                        stats.matches.push({
                            sessionId: session._id.toString(),
                            sessionTitle: session.title,
                            matchId: match.matchId,
                            date: match.finishedAt ?? match.startTime ?? session.scheduledAt,
                            court: match.court,
                            isDoubles,
                            side: team.side,
                            teammates: team.players.filter((name) => name !== username).join(' & '),
                            opponents: team.opponents.join(' & '),
                            pointsFor: team.pointsFor,
                            pointsAgainst: team.pointsAgainst,
                            won: team.won
                        });
                    }
                }
            }
        }

        const ranked = [...playerStats.values()]
            .map((stats) => ({
                ...stats,
                losses: stats.games - stats.wins,
                winRate: stats.games ? Math.round((stats.wins / stats.games) * 100) : 0,
                pointDifference: stats.pointsFor - stats.pointsAgainst,
                matches: stats.matches.sort((a, b) =>
                    new Date(a.date ?? 0).getTime() - new Date(b.date ?? 0).getTime()
                )
            }))
            .filter((stats) => stats.games > 0)
            .sort((a, b) => b.rating - a.rating || b.winRate - a.winRate || b.games - a.games || a.username.localeCompare(b.username))
            .map((stats, index) => ({ rank: index + 1, ...stats }));

        res.json(ranked);
    } catch (error) {
        console.error('ORGANISER PLAYER STATS ERROR:', error);
        res.status(500).json({ error: 'Could not load player stats' });
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
        session.matches = buildWaitingMatches(session.players, getFreeCourts(session), session, true);

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
        const newMatches = buildWaitingMatches(getWaitingPlayers(session), getFreeCourts(session), session, true);
        if (newMatches.length) session.matches.push(...newMatches);
        session.isActive = true;
        await session.save();
        res.status(201).json(session);
    } catch (error) {
        console.error('ORGANISER PLAYER ADD ERROR:', error);
        res.status(500).json({ error: 'Could not add player to session' });
    }
});

router.post('/sessions/:id/matches/:matchId/start', async (req, res) => {
    try {
        const session = await Session.findOne({ _id: req.params.id, adminId: req.user.id });
        if (!session) {
            res.status(404).json({ error: 'Session not found' });
            return;
        }
        const match = session.matches.find((item) => item.matchId === req.params.matchId);
        if (!match || match.status !== 'proposed') {
            res.status(404).json({ error: 'Proposed match not found' });
            return;
        }
        if (match.awaitingNextFinish && !match.manualOverride) {
            res.status(409).json({ error: 'This lineup repeats a recent pairing. Wait for another match to finish or edit the lineup to approve it manually.' });
            return;
        }
        const fields = getMatchFields(match);
        const names = fields.map((field) => match[field]);
        if (names.some((name) => !name) || new Set(names).size !== names.length) {
            res.status(400).json({ error: 'Complete the proposed lineup with unique players before starting' });
            return;
        }
        const assignedElsewhere = session.matches.some((other) =>
            other !== match && other.status === 'ongoing' &&
            fields.some((field) => {
                const name = match[field];
                return Boolean(name && [other.player1, other.player2, other.player3, other.player4].includes(name));
            })
        );
        if (assignedElsewhere) {
            res.status(409).json({ error: 'A proposed player is still assigned to another live match. Edit the lineup to pull them out first.' });
            return;
        }

        match.status = 'ongoing';
        match.startTime = new Date();
        await session.save();
        res.json(session);
    } catch (error) {
        console.error('ORGANISER MATCH START ERROR:', error);
        res.status(500).json({ error: 'Could not start proposed match' });
    }
});

router.patch('/sessions/:id/matches/:matchId/players', async (req, res) => {
    try {
        const session = await Session.findOne({ _id: req.params.id, adminId: req.user.id });
        if (!session) {
            res.status(404).json({ error: 'Session not found' });
            return;
        }
        const match = session.matches.find((item) => item.matchId === req.params.matchId);
        if (!match || match.status === 'finished') {
            res.status(404).json({ error: 'Editable match not found' });
            return;
        }
        const fields = getMatchFields(match);
        const lineup = req.body?.lineup;
        if (!Array.isArray(lineup) || lineup.length !== fields.length) {
            res.status(400).json({ error: `Provide ${fields.length} lineup entries` });
            return;
        }
        const names: (string | undefined)[] = lineup.map((name: unknown) =>
            name === null || name === '' ? undefined : typeof name === 'string' ? name : undefined
        );
        if (lineup.some((name: unknown) => name !== null && name !== '' && typeof name !== 'string')) {
            res.status(400).json({ error: 'Lineup entries must be player names or empty' });
            return;
        }
        const selectedNames = names.filter((name: string | undefined): name is string => Boolean(name));
        if (new Set(selectedNames).size !== selectedNames.length) {
            res.status(400).json({ error: 'A player cannot occupy more than one spot in the same match' });
            return;
        }
        for (const username of selectedNames) {
            const player = session.players.find((item) => item.username === username);
            if (!player) {
                res.status(400).json({ error: `Player "${username}" is not in this session` });
                return;
            }
            const format: PlayFormat = match.isDoubles ? 'doubles' : 'singles';
            if (player.preferredFormat && player.preferredFormat !== format) {
                res.status(400).json({ error: `${username} prefers ${player.preferredFormat} and cannot be assigned to this ${format} match` });
                return;
            }
        }

        for (const other of session.matches) {
            if (other === match || other.status === 'finished') continue;
            let changed = false;
            for (const field of ['player1', 'player2', 'player3', 'player4'] as PlayerField[]) {
                if (other[field] && selectedNames.includes(other[field]!)) {
                    other[field] = undefined;
                    changed = true;
                }
            }
            if (changed && other.status === 'proposed') {
                other.awaitingNextFinish = true;
                other.manualOverride = false;
            }
        }
        fields.forEach((field, index) => {
            match[field] = names[index] as string | undefined;
        });
        match.manualOverride = true;
        match.awaitingNextFinish = false;

        await session.save();
        res.json(session);
    } catch (error) {
        console.error('ORGANISER MATCH LINEUP ERROR:', error);
        res.status(500).json({ error: 'Could not update match lineup' });
    }
});

router.post('/sessions/:id/matches/:matchId/finish', async (req, res) => {
    try {
        const session = await Session.findOne({ _id: req.params.id, adminId: req.user.id });
        if (!session) {
            res.status(404).json({ error: 'Session not found' });
            return;
        }
        const match = session.matches.find((item) => item.matchId === req.params.matchId);
        if (!match || match.status !== 'ongoing') {
            res.status(404).json({ error: 'Live match not found' });
            return;
        }
        const fields = getMatchFields(match);
        const names = fields.map((field) => match[field]);
        if (names.some((name) => !name) || new Set(names).size !== names.length) {
            res.status(400).json({ error: 'Fill every player spot before ending the match' });
            return;
        }

        const { team1, team2, winnerTeam } = req.body as {
            team1?: unknown;
            team2?: unknown;
            winnerTeam?: unknown;
        };
        if (!Number.isInteger(team1) || Number(team1) < 0 || !Number.isInteger(team2) || Number(team2) < 0) {
            res.status(400).json({ error: 'Enter a whole-number score of zero or more for both sides' });
            return;
        }
        if (winnerTeam !== 'team1' && winnerTeam !== 'team2') {
            res.status(400).json({ error: 'Select which side won the match' });
            return;
        }

        match.score = { team1: Number(team1), team2: Number(team2) };
        match.winnerTeam = winnerTeam;
        const team1Players = (match.isDoubles ? [match.player1, match.player2] : [match.player1])
            .filter((name): name is string => Boolean(name));
        const team2Players = (match.isDoubles ? [match.player3, match.player4] : [match.player2])
            .filter((name): name is string => Boolean(name));
        const winners = winnerTeam === 'team1' ? team1Players : team2Players;
        const losers = winnerTeam === 'team1' ? team2Players : team1Players;
        await updateMatchRatings(session, winners, losers);
        match.winner = winners.join(' & ');
        match.status = 'finished';

        const now = new Date();
        match.finishedAt = now;
        session.players.forEach((player) => {
            if (names.includes(player.username)) player.joinedAt = now;
        });
        session.matches = session.matches.filter((item) =>
            item.status !== 'proposed' || !item.awaitingNextFinish || item.manualOverride
        );
        const newMatches = buildWaitingMatches(getWaitingPlayers(session), getFreeCourts(session), session, true);
        if (newMatches.length) session.matches.push(...newMatches);
        session.isActive = true;
        await session.save();
        res.json(session);
    } catch (error) {
        console.error('ORGANISER MATCH FINISH ERROR:', error);
        res.status(500).json({ error: 'Could not finish match' });
    }
});

export default router;
