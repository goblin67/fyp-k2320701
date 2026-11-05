import express from 'express';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import authMiddleware from '../auth/auth.middleware.js';
import organiserMiddleware from '../auth/organiser.middleware.js';
import User from '../users/user.model.js';
import Club from '../clubs/club.model.js';
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

const createInviteCode = (): string => randomBytes(10).toString('hex').toUpperCase();
const isDuplicateKeyError = (error: unknown): boolean =>
    typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;

const ensureDefaultClub = async (ownerId: string) => {
    let club = await Club.findOne({ ownerId, isDefault: true });
    if (!club) {
        club = await Club.findOne({ ownerId }).sort({ createdAt: 1 });
    }
    if (!club) {
        const owner = await User.findById(ownerId).select('username');
        if (!owner) throw new Error('Organiser account was not found');
        try {
            club = await Club.create({
                ownerId,
                name: `${owner.username}'s Club`,
                isDefault: true
            });
        } catch (error) {
            if (!isDuplicateKeyError(error)) throw error;
            club = await Club.findOne({ ownerId, isDefault: true });
            if (!club) throw error;
        }
    }

    await Session.updateMany(
        { adminId: ownerId, clubId: null },
        { $set: { clubId: club._id } }
    );
    const sessions = await Session.find({ adminId: ownerId, clubId: club._id }).select('players').lean();
    const accountNames = [...new Set(sessions.flatMap((session) =>
        session.players.filter((player) => !player.isGuest).map((player) => player.username)
    ))];
    if (accountNames.length) {
        const users = await User.find({
            username: { $in: accountNames },
            isDeleted: { $ne: true },
            role: { $ne: 'organiser' }
        });
        for (const user of users) {
            if (!user.clubs.some((membership) => membership.clubId.toString() === club._id.toString())) {
                user.clubs.push({
                    clubId: club._id,
                    status: 'approved',
                    requestedAt: new Date(),
                    approvedAt: new Date()
                });
                await user.save();
            }
        }
    }
    return club;
};

const findOwnedClub = async (clubId: unknown, ownerId: string) => {
    if (typeof clubId !== 'string' || !/^[a-f\d]{24}$/i.test(clubId)) return null;
    return Club.findOne({ _id: clubId, ownerId });
};

router.use(authMiddleware, organiserMiddleware);

router.get('/clubs', async (req, res) => {
    try {
        await ensureDefaultClub(req.user.id);
        const clubs = await Club.find({ ownerId: req.user.id })
            .select('name isDefault inviteCodeHash allowedFormats defaultFormat')
            .sort({ isDefault: -1, name: 1 })
            .lean();
        const clubData = await Promise.all(clubs.map(async (club) => {
            const [sessionCount, memberCount] = await Promise.all([
                Session.countDocuments({ adminId: req.user.id, clubId: club._id }),
                User.countDocuments({
                    isDeleted: { $ne: true },
                    clubs: { $elemMatch: { clubId: club._id } }
                })
            ]);
            return {
                id: club._id.toString(),
                name: club.name,
                isDefault: club.isDefault,
                hasInviteCode: Boolean(club.inviteCodeHash),
                allowedFormats: club.allowedFormats?.length ? club.allowedFormats : formats,
                defaultFormat: club.defaultFormat ?? 'singles',
                sessionCount,
                memberCount
            };
        }));
        res.json(clubData);
    } catch (error) {
        console.error('ORGANISER CLUB LIST ERROR:', error);
        res.status(500).json({ error: 'Could not load clubs' });
    }
});

router.post('/clubs', async (req, res) => {
    try {
        const { name } = req.body as { name?: unknown };
        if (typeof name !== 'string' || !name.trim() || name.trim().length > 80) {
            res.status(400).json({ error: 'Club name must be between 1 and 80 characters' });
            return;
        }
        const inviteCode = createInviteCode();
        const club = await Club.create({
            ownerId: req.user.id,
            name: name.trim(),
            inviteCodeHash: await bcrypt.hash(inviteCode, 10)
        });
        res.status(201).json({
            id: club._id.toString(),
            name: club.name,
            isDefault: false,
            hasInviteCode: true,
            allowedFormats: club.allowedFormats,
            defaultFormat: club.defaultFormat,
            inviteCode
        });
    } catch (error) {
        console.error('ORGANISER CLUB CREATE ERROR:', error);
        res.status(500).json({ error: 'Could not create club' });
    }
});

router.patch('/clubs/:id', async (req, res) => {
    try {
        const club = await findOwnedClub(req.params.id, req.user.id);
        if (!club) {
            res.status(404).json({ error: 'Club not found' });
            return;
        }
        const { name } = req.body as { name?: unknown };
        if (typeof name !== 'string' || !name.trim() || name.trim().length > 80) {
            res.status(400).json({ error: 'Club name must be between 1 and 80 characters' });
            return;
        }
        club.name = name.trim();
        await club.save();
        res.json({
            id: club._id.toString(),
            name: club.name,
            isDefault: club.isDefault,
            hasInviteCode: Boolean(club.inviteCodeHash)
        });
    } catch (error) {
        console.error('ORGANISER CLUB UPDATE ERROR:', error);
        res.status(500).json({ error: 'Could not update club name' });
    }
});

router.delete('/clubs/:id', async (req, res) => {
    try {
        const club = await findOwnedClub(req.params.id, req.user.id);
        if (!club) {
            res.status(404).json({ error: 'Club not found' });
            return;
        }
        const [sessionCount, memberCount, otherClubCount] = await Promise.all([
            Session.countDocuments({ adminId: req.user.id, clubId: club._id }),
            User.countDocuments({
                isDeleted: { $ne: true },
                clubs: { $elemMatch: { clubId: club._id } }
            }),
            Club.countDocuments({ ownerId: req.user.id, _id: { $ne: club._id } })
        ]);
        if (sessionCount || memberCount) {
            res.status(409).json({
                error: `Remove this club’s ${sessionCount} session(s) and ${memberCount} member(s) before deleting it`,
                sessionCount,
                memberCount
            });
            return;
        }
        if (!otherClubCount) {
            res.status(409).json({ error: 'Create or keep another club before deleting your last club' });
            return;
        }
        await User.updateMany(
            { clubs: { $elemMatch: { clubId: club._id } } },
            { $pull: { clubs: { clubId: club._id } } }
        );
        await club.deleteOne();
        res.json({ message: 'Club deleted' });
    } catch (error) {
        console.error('ORGANISER CLUB DELETE ERROR:', error);
        res.status(500).json({ error: 'Could not delete club' });
    }
});

router.patch('/clubs/:id/settings', async (req, res) => {
    try {
        const club = await findOwnedClub(req.params.id, req.user.id);
        if (!club) {
            res.status(404).json({ error: 'Club not found' });
            return;
        }
        const { allowedFormats, defaultFormat } = req.body as {
            allowedFormats?: unknown;
            defaultFormat?: unknown;
        };
        if (!Array.isArray(allowedFormats) || allowedFormats.length < 1 ||
            allowedFormats.length > formats.length || !allowedFormats.every(isFormat) ||
            new Set(allowedFormats).size !== allowedFormats.length) {
            res.status(400).json({ error: 'Choose singles, doubles, or both formats' });
            return;
        }
        if (!isFormat(defaultFormat) || !allowedFormats.includes(defaultFormat)) {
            res.status(400).json({ error: 'The default format must be one of the club’s allowed formats' });
            return;
        }
        const activeSessions = await Session.find({
            adminId: req.user.id,
            clubId: club._id,
            status: 'active'
        }).select('courtFormats').lean();
        if (activeSessions.some((session) =>
            session.courtFormats.some((format) => !allowedFormats.includes(format as PlayFormat))
        )) {
            res.status(409).json({ error: 'Finish or update active sessions before removing a format used by one of their courts' });
            return;
        }

        club.allowedFormats = allowedFormats;
        club.defaultFormat = defaultFormat;
        await club.save();
        res.json({
            allowedFormats: club.allowedFormats,
            defaultFormat: club.defaultFormat
        });
    } catch (error) {
        console.error('ORGANISER CLUB SETTINGS ERROR:', error);
        res.status(500).json({ error: 'Could not update club session formats' });
    }
});

router.post('/clubs/:id/invite-code', async (req, res) => {
    try {
        const club = await findOwnedClub(req.params.id, req.user.id);
        if (!club) {
            res.status(404).json({ error: 'Club not found' });
            return;
        }
        const inviteCode = createInviteCode();
        club.inviteCodeHash = await bcrypt.hash(inviteCode, 10);
        await club.save();
        res.json({ inviteCode, hasInviteCode: true });
    } catch (error) {
        console.error('ORGANISER CLUB INVITE CODE ERROR:', error);
        res.status(500).json({ error: 'Could not generate invite code' });
    }
});

router.get('/clubs/:id/members', async (req, res) => {
    try {
        const club = await findOwnedClub(req.params.id, req.user.id);
        if (!club) {
            res.status(404).json({ error: 'Club not found' });
            return;
        }
        const status = req.query.status === 'approved' ? 'approved' : 'pending';
        const users = await User.find({
            clubs: { $elemMatch: { clubId: club._id, status } },
            isDeleted: { $ne: true }
        }).select('username age level rating clubs').sort({ username: 1 }).lean();
        res.json(users.map((user) => {
            const membership = user.clubs.find((entry) => entry.clubId.toString() === club._id.toString());
            return {
                userId: user._id.toString(),
                username: user.username,
                age: user.age,
                level: user.level,
                rating: user.rating,
                status: membership?.status,
                requestedAt: membership?.requestedAt
            };
        }));
    } catch (error) {
        console.error('ORGANISER CLUB MEMBER LIST ERROR:', error);
        res.status(500).json({ error: 'Could not load club members' });
    }
});

router.patch('/clubs/:id/members/:userId/approve', async (req, res) => {
    try {
        const club = await findOwnedClub(req.params.id, req.user.id);
        if (!club) {
            res.status(404).json({ error: 'Club not found' });
            return;
        }
        if (!/^[a-f\d]{24}$/i.test(req.params.userId)) {
            res.status(400).json({ error: 'Player id is invalid' });
            return;
        }
        const user = await User.findOne({
            _id: req.params.userId,
            clubs: { $elemMatch: { clubId: club._id, status: 'pending' } },
            isDeleted: { $ne: true }
        });
        if (!user) {
            res.status(404).json({ error: 'Pending membership request not found' });
            return;
        }
        const membership = user.clubs.find((entry) =>
            entry.clubId.toString() === club._id.toString() && entry.status === 'pending'
        );
        if (!membership) {
            res.status(404).json({ error: 'Pending membership request not found' });
            return;
        }
        membership.status = 'approved';
        membership.approvedAt = new Date();
        await user.save();
        res.json({ message: 'Player approved' });
    } catch (error) {
        console.error('ORGANISER CLUB APPROVAL ERROR:', error);
        res.status(500).json({ error: 'Could not approve membership request' });
    }
});

router.delete('/clubs/:id/members/:userId', async (req, res) => {
    try {
        const club = await findOwnedClub(req.params.id, req.user.id);
        if (!club) {
            res.status(404).json({ error: 'Club not found' });
            return;
        }
        if (!/^[a-f\d]{24}$/i.test(req.params.userId)) {
            res.status(400).json({ error: 'Player id is invalid' });
            return;
        }
        const user = await User.findOneAndUpdate(
            { _id: req.params.userId, clubs: { $elemMatch: { clubId: club._id } } },
            { $pull: { clubs: { clubId: club._id } } },
            { new: true }
        );
        if (!user) {
            res.status(404).json({ error: 'Club member not found' });
            return;
        }
        res.json({ message: 'Player removed from club' });
    } catch (error) {
        console.error('ORGANISER CLUB MEMBER REMOVE ERROR:', error);
        res.status(500).json({ error: 'Could not remove player from club' });
    }
});

router.post('/clubs/:id/players', async (req, res) => {
    try {
        const club = await findOwnedClub(req.params.id, req.user.id);
        if (!club) {
            res.status(404).json({ error: 'Club not found' });
            return;
        }
        const { username, password, age, level } = req.body as {
            username?: unknown;
            password?: unknown;
            age?: unknown;
            level?: unknown;
        };
        if (typeof username !== 'string' || !username.trim() ||
            typeof password !== 'string' || password.length < 8) {
            res.status(400).json({ error: 'Username is required and password must be at least 8 characters' });
            return;
        }
        const organiserUsername = process.env.INITIAL_ORGANISER_USERNAME?.trim() || '1234';
        if (username.trim() === organiserUsername) {
            res.status(409).json({ error: 'This username is reserved for organiser account setup' });
            return;
        }
        if (age !== undefined && age !== '' && (!Number.isFinite(Number(age)) || Number(age) < 1 || Number(age) > 120)) {
            res.status(400).json({ error: 'Age must be a number between 1 and 120' });
            return;
        }
        const levelRatingMap: Record<string, number> = {
            Beginner: 600,
            'Weekly casual': 800,
            'Tier 1/2/3 BE': 2000,
            'Bi-weekly casual': 1000,
            'Occasional tournament player': 1600,
            'ISO medal holder': 1800,
            'Badminton England rated': 1700
        };
        const selectedLevel = typeof level === 'string' && level ? level : 'Beginner';
        const player = await User.create({
            username: username.trim(),
            password: await bcrypt.hash(password, 10),
            age: age ? Number(age) : undefined,
            level: selectedLevel,
            rating: levelRatingMap[selectedLevel] ?? 1500,
            rd: 350,
            vol: 0.06,
            clubs: [{
                clubId: club._id,
                status: 'approved',
                requestedAt: new Date(),
                approvedAt: new Date()
            }]
        });
        res.status(201).json({
            username: player.username,
            age: player.age,
            level: player.level,
            rating: player.rating
        });
    } catch (error) {
        if (isDuplicateKeyError(error)) {
            res.status(409).json({ error: 'Username already exists' });
            return;
        }
        console.error('ORGANISER CLUB PLAYER CREATE ERROR:', error);
        res.status(500).json({ error: 'Could not register player' });
    }
});

router.get('/players', async (req, res) => {
    try {
        const club = await findOwnedClub(req.query.clubId, req.user.id);
        if (!club) {
            res.status(400).json({ error: 'Select a valid club' });
            return;
        }
        const players = await User.find({
            isDeleted: { $ne: true },
            $or: [{ role: 'player' }, { role: { $exists: false } }],
            clubs: { $elemMatch: { clubId: club._id, status: 'approved' } }
        })
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
        const club = await findOwnedClub(req.query.clubId, req.user.id);
        if (!club) {
            res.status(400).json({ error: 'Select a valid club' });
            return;
        }
        const sessions = await Session.find({ adminId: req.user.id, clubId: club._id })
            .sort({ scheduledAt: 1, createdAt: -1 })
            .limit(100);
        res.json(sessions);
    } catch (error) {
        console.error('ORGANISER SESSION LIST ERROR:', error);
        res.status(500).json({ error: 'Could not load sessions' });
    }
});

router.delete('/sessions/:id', async (req, res) => {
    try {
        const session = await Session.findOne({ _id: req.params.id, adminId: req.user.id });
        if (!session) {
            res.status(404).json({ error: 'Session not found' });
            return;
        }
        if (session.isActive || (session.status !== 'scheduled' && session.status !== 'completed' && session.status !== undefined)) {
            res.status(409).json({ error: 'Only planned or completed sessions can be deleted' });
            return;
        }

        await session.deleteOne();
        res.json({ message: 'Session deleted. Player lifetime records were preserved.' });
    } catch (error) {
        console.error('ORGANISER SESSION DELETE ERROR:', error);
        res.status(500).json({ error: 'Could not delete session' });
    }
});

router.get('/player-stats', async (req, res) => {
    try {
        const club = await findOwnedClub(req.query.clubId, req.user.id);
        if (!club) {
            res.status(400).json({ error: 'Select a valid club' });
            return;
        }
        const sessions = await Session.find({ adminId: req.user.id, clubId: club._id })
            .select('title scheduledAt players matches')
            .lean();
        const registeredPlayerNames = new Set(
            sessions.flatMap((session) =>
                session.players
                    .filter((player) => !player.isGuest)
                    .map((player) => player.username)
            )
        );
        const accounts = await User.find({ username: { $in: [...registeredPlayerNames] }, isDeleted: { $ne: true } })
            .select('username rating matchHistory')
            .lean();
        const accountRatings = new Map(accounts.map((account) => [account.username, account.rating]));
        const accountMatchHistories = new Map(accounts.map((account) => [
            account.username,
            account.matchHistory.map((entry, index) => ({ ...entry, index }))
        ]));
        const usedHistoryEntries = new Map<string, Set<number>>();
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
                    eloBefore?: number;
                    eloAfter?: number;
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
                        const history = accountMatchHistories.get(username) ?? [];
                        const usedEntries = usedHistoryEntries.get(username) ?? new Set<number>();
                        const expectedOpponent = team.opponents.join(' & ');
                        const matchDate = match.finishedAt ?? match.startTime;
                        const matchingHistory = matchDate
                            ? history
                                .filter((entry) =>
                                    !usedEntries.has(entry.index) &&
                                    entry.opponent === expectedOpponent &&
                                    entry.isWin === team.won
                                )
                                .map((entry) => ({
                                    entry,
                                    distance: Math.abs(new Date(entry.matchDate).getTime() - new Date(matchDate).getTime())
                                }))
                                .filter((candidate) => candidate.distance <= 10 * 60 * 1000)
                                .sort((a, b) => a.distance - b.distance)[0]?.entry
                            : undefined;
                        if (matchingHistory) {
                            usedEntries.add(matchingHistory.index);
                            usedHistoryEntries.set(username, usedEntries);
                        }
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
                            won: team.won,
                            ...(matchingHistory ? {
                                eloBefore: matchingHistory.eloBefore,
                                eloAfter: matchingHistory.eloAfter
                            } : {})
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
                    new Date(a.date ?? 0).getTime() - new Date(b.date ?? 0).getTime() ||
                    a.matchId.localeCompare(b.matchId)
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
        const { title, scheduledAt, endsAt, venue, clubId } = req.body as {
            title?: unknown;
            scheduledAt?: unknown;
            endsAt?: unknown;
            venue?: unknown;
            clubId?: unknown;
        };
        const club = await findOwnedClub(clubId, req.user.id);
        if (!club) {
            res.status(400).json({ error: 'Select a valid club for this session' });
            return;
        }
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
            clubId: club._id,
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
        const club = session.clubId
            ? await Club.findOne({ _id: session.clubId, ownerId: req.user.id })
            : null;
        if (!club) {
            res.status(409).json({ error: 'This session is not associated with a club' });
            return;
        }
        const allowedFormats = club.allowedFormats?.length ? club.allowedFormats : formats;
        const defaultFormat = club.defaultFormat ?? 'singles';
        const fixedFormat = allowedFormats.length === 1 ? allowedFormats[0] : undefined;

        const { players, courtFormats } = req.body as {
            players?: unknown;
            courtFormats?: unknown;
        };
        if (!Array.isArray(players) || players.length === 0) {
            res.status(400).json({ error: 'Select at least one player' });
            return;
        }
        if (!Array.isArray(courtFormats) || courtFormats.length < 1 || courtFormats.length > 6 ||
            !courtFormats.every((format) => isFormat(format) && allowedFormats.includes(format))) {
            res.status(400).json({ error: 'Choose a format for each of 1 to 6 courts' });
            return;
        }
        if (fixedFormat && courtFormats.some((format) => format !== fixedFormat)) {
            res.status(400).json({ error: `This club only allows ${fixedFormat} courts` });
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
            if (!username || (!fixedFormat && !isFormat(player.preferredFormat)) ||
                (player.preferredFormat !== undefined && !isFormat(player.preferredFormat)) ||
                (player.kind !== 'account' && player.kind !== 'guest')) {
                res.status(400).json({ error: 'Each player needs a name, player type, and singles/doubles preference' });
                return;
            }
            if (!fixedFormat && !allowedFormats.includes(player.preferredFormat as PlayFormat)) {
                res.status(400).json({ error: `This club does not allow ${player.preferredFormat} player preferences` });
                return;
            }
            if (seenNames.has(username.toLowerCase())) {
                res.status(400).json({ error: `Player "${username}" was selected more than once` });
                return;
            }
            seenNames.add(username.toLowerCase());

            const user = player.kind === 'account' ? await User.findOne({ username, isDeleted: { $ne: true } }) : null;
            if (player.kind === 'account' && !user) {
                res.status(404).json({ error: `Account "${username}" was not found` });
                return;
            }
            if (user && !user.clubs.some((membership) =>
                membership.clubId.toString() === session.clubId?.toString() && membership.status === 'approved'
            )) {
                res.status(403).json({ error: `"${username}" is not an approved member of this session's club` });
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
                preferredFormat: fixedFormat ?? player.preferredFormat ?? defaultFormat,
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
        const club = session.clubId
            ? await Club.findOne({ _id: session.clubId, ownerId: req.user.id })
            : null;
        if (!club) {
            res.status(409).json({ error: 'This session is not associated with a club' });
            return;
        }
        const allowedFormats = club.allowedFormats?.length ? club.allowedFormats : formats;
        const fixedFormat = allowedFormats.length === 1 ? allowedFormats[0] : undefined;

        const { username: rawUsername, kind, preferredFormat, age, level } = req.body as {
            username?: unknown;
            kind?: unknown;
            preferredFormat?: unknown;
            age?: unknown;
            level?: unknown;
        };
        const username = typeof rawUsername === 'string' ? rawUsername.trim() : '';
        if (!username || (kind !== 'account' && kind !== 'guest') ||
            (!fixedFormat && !isFormat(preferredFormat)) ||
            (preferredFormat !== undefined && !isFormat(preferredFormat))) {
            res.status(400).json({ error: 'Name, player type, and singles/doubles preference are required' });
            return;
        }
        if (!fixedFormat && !allowedFormats.includes(preferredFormat as PlayFormat)) {
            res.status(400).json({ error: `This club does not allow ${preferredFormat} player preferences` });
            return;
        }
        if (session.players.some((player) => player.username.toLowerCase() === username.toLowerCase())) {
            res.status(409).json({ error: 'Player is already in this session' });
            return;
        }
        const user = kind === 'account' ? await User.findOne({ username, isDeleted: { $ne: true } }) : null;
        if (kind === 'account' && !user) {
            res.status(404).json({ error: 'Player account not found' });
            return;
        }
        if (user && !user.clubs.some((membership) =>
            membership.clubId.toString() === session.clubId?.toString() && membership.status === 'approved'
        )) {
            res.status(403).json({ error: 'Player is not an approved member of this session club' });
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
            preferredFormat: fixedFormat ?? preferredFormat,
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

router.patch('/sessions/:id/courts', async (req, res) => {
    try {
        const session = await Session.findOne({ _id: req.params.id, adminId: req.user.id });
        if (!session) {
            res.status(404).json({ error: 'Session not found' });
            return;
        }
        if (!session.isActive) {
            res.status(409).json({ error: 'Courts can only be changed during a live session' });
            return;
        }
        const club = session.clubId
            ? await Club.findOne({ _id: session.clubId, ownerId: req.user.id })
            : null;
        if (!club) {
            res.status(409).json({ error: 'This session is not associated with a club' });
            return;
        }
        const allowedFormats = club.allowedFormats?.length ? club.allowedFormats : formats;

        const { courtFormats } = req.body as { courtFormats?: unknown };
        if (!Array.isArray(courtFormats) || courtFormats.length < 1 || courtFormats.length > 6 ||
            !courtFormats.every((format) => isFormat(format) && allowedFormats.includes(format))) {
            res.status(400).json({ error: `Choose between 1 and 6 courts using the club’s allowed formats: ${allowedFormats.join(', ')}` });
            return;
        }
        if (session.matches.some((match) => match.status === 'ongoing' && match.court > courtFormats.length)) {
            res.status(409).json({ error: 'Finish the match on the highest-numbered court before removing that court' });
            return;
        }

        session.matches = session.matches.filter((match) => match.status !== 'proposed');
        session.courtFormats = courtFormats;
        session.numCourts = courtFormats.length;
        session.isDoubles = courtFormats.every((format) => format === 'doubles');
        const newMatches = buildWaitingMatches(getWaitingPlayers(session), getFreeCourts(session), session, true);
        if (newMatches.length) session.matches.push(...newMatches);

        await session.save();
        res.json(session);
    } catch (error) {
        console.error('ORGANISER COURT UPDATE ERROR:', error);
        res.status(500).json({ error: 'Could not update session courts' });
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
            res.status(409).json({ error: 'Players in this lineup have played together recently. Wait for another match to finish or edit the lineup to approve it manually.' });
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
        const waitAlreadyUsedOnCourts = new Set(
            session.matches
                .filter((item) => item.status === 'proposed' && item.awaitingNextFinish && !item.manualOverride)
                .map((item) => item.court)
        );
        session.matches = session.matches.filter((item) =>
            item.status !== 'proposed' || item.manualOverride
        );
        const newMatches = buildWaitingMatches(
            getWaitingPlayers(session),
            getFreeCourts(session),
            session,
            true,
            waitAlreadyUsedOnCourts
        );
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
