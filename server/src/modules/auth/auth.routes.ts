import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import type { RequestHandler } from 'express';
import type { Types } from 'mongoose';
import User from '../users/user.model.js';
import Club from '../clubs/club.model.js';

interface RegisterRequest {
    username: string;
    password: string;
    age?: string | number;
    level?: string;
    clubId?: string;
    clubCode?: string;
}

interface LoginRequest {
    username: string;
    password: string;
}

interface AuthResponse {
    message?: string;
    error?: string;
    token?: string;
    username?: string;
    role?: 'player' | 'organiser';
    organiserAccess?: boolean;
}

const router = express.Router();
const getErrorMessage = (error: unknown): string => error instanceof Error ? error.message : 'Unknown error';
const isDuplicateUsername = (error: unknown): boolean =>
    typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;

// Register
const register: RequestHandler<Record<string, never>, AuthResponse, RegisterRequest> = async (req, res) => {
    try {
        const { username, password, age, level, clubId, clubCode } = req.body;
        if (typeof username !== 'string' || !username.trim() || typeof password !== 'string' || password.length < 8) {
            res.status(400).json({ error: 'Username is required and password must be at least 8 characters' });
            return;
        }
        const hasClubId = typeof clubId === 'string' && clubId.length > 0;
        const hasClubCode = typeof clubCode === 'string' && clubCode.trim().length > 0;
        if ((clubId !== undefined && typeof clubId !== 'string') ||
            (clubCode !== undefined && typeof clubCode !== 'string') ||
            hasClubId !== hasClubCode ||
            (typeof clubCode === 'string' && clubCode.length > 100)) {
            res.status(400).json({ error: 'Choose a club and enter its invite code, or leave both blank' });
            return;
        }
        let membership: { clubId: Types.ObjectId; status: 'pending'; requestedAt: Date } | undefined;
        if (hasClubId && hasClubCode) {
            if (!/^[a-f\d]{24}$/i.test(clubId)) {
                res.status(400).json({ error: 'Selected club is invalid' });
                return;
            }
            const club = await Club.findById(clubId).select('inviteCodeHash');
            if (!club?.inviteCodeHash || !(await bcrypt.compare(clubCode.trim(), club.inviteCodeHash))) {
                res.status(400).json({ error: 'The club invite code is invalid' });
                return;
            }
            membership = { clubId: club._id, status: 'pending', requestedAt: new Date() };
        }
        const organiserUsername = process.env.INITIAL_ORGANISER_USERNAME?.trim() || '1234';
        if (username.trim() === organiserUsername) {
            res.status(409).json({ error: 'This username is reserved for organiser account setup' });
            return;
        }
        const hashedPassword = await bcrypt.hash(password, 10);

        const levelRatingMap: Record<string, number> = {
            'Beginner': 600,
            'Weekly casual': 800,
            'Tier 1/2/3 BE': 2000,
            'Bi-weekly casual': 1000,
            'Occasional tournament player': 1600,
            'ISO medal holder': 1800,
            'Badminton England rated': 1700
        };

        const initialRating = levelRatingMap[level ?? ''] ?? 1500;

        const user = new User({
            username: username.trim(),
            password: hashedPassword,
            age: age ? Number(age) : undefined,
            level: level || 'Beginner',
            rating: initialRating,
            rd: 350,
            vol: 0.06,
            ...(membership ? { clubs: [membership] } : {})
        });
        await user.save();
        res.status(201).json({ message: "User Created" });
    } catch (error) {
        console.error('REGISTER ERROR:', getErrorMessage(error));
        if (isDuplicateUsername(error)) {
            res.status(409).json({ error: 'Username already exists' });
            return;
        }
        res.status(500).json({ error: 'Could not create account' });
    }
};

router.post('/register', register);

// Login
const login: RequestHandler<Record<string, never>, AuthResponse, LoginRequest> = async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username });
        if (user && !user.isDeleted && await bcrypt.compare(password, user.password)) {
            const loginDay = new Date().toISOString().slice(0, 10);
            const loginDays = user.loginDays ?? [];
            if (!loginDays.includes(loginDay)) {
                user.loginDays = [...loginDays, loginDay].slice(-400);
                await user.save();
            }
            const secret = process.env.JWT_SECRET;
            if (!secret) {
                res.status(500).json({ error: 'JWT secret is not configured' });
                return;
            }
            const token = jwt.sign({ id: user._id.toString(), username: user.username }, secret);
            res.json({
                token,
                username: user.username,
                role: user.role ?? 'player',
                organiserAccess: user.role === 'organiser' || user.organiserAccess
            });
        } else {
            res.status(401).json({ error: "Invalid credentials" });
        }
    } catch (error) {
        console.error('LOGIN ERROR:', getErrorMessage(error));
        res.status(500).json({ error: "Server error" });
    }
};

router.post('/login', login);

export default router;