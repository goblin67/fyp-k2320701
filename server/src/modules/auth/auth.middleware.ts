import jwt from 'jsonwebtoken';
import type { RequestHandler } from 'express';
import User from '../users/user.model.js';

const authMiddleware: RequestHandler = async (req, res, next) => {
    const authHeader = req.header('Authorization');
    const token = authHeader && authHeader.split(' ')[1]; // Extract Bearer <token>

    if (!token) {
        return res.status(401).json({ msg: 'No token, authorization denied' });
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
        res.status(500).json({ msg: 'JWT secret is not configured' });
        return;
    }

    let decoded: string | jwt.JwtPayload;
    try {
        decoded = jwt.verify(token, secret);
    } catch {
        res.status(401).json({ msg: 'Token is not valid' });
        return;
    }

    if (typeof decoded === 'string' || typeof decoded.id !== 'string' || typeof decoded.username !== 'string') {
        res.status(401).json({ msg: 'Token is not valid' });
        return;
    }

    const user = await User.findById(decoded.id).select('isDeleted');
    if (!user || user.isDeleted) {
        res.status(401).json({ msg: 'Account is unavailable' });
        return;
    }

    req.user = { id: decoded.id, username: decoded.username };
    return next();
};

export default authMiddleware; // Fixed export for ES Modules