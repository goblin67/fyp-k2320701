import type { RequestHandler } from 'express';
import User from '../users/user.model.js';

const organiserMiddleware: RequestHandler = async (req, res, next) => {
    try {
        const user = await User.findById(req.user.id).select('role organiserAccess');
        if (!user || (user.role !== 'organiser' && !user.organiserAccess)) {
            res.status(403).json({ error: 'Organiser access required' });
            return;
        }
        next();
    } catch (error) {
        console.error('ORGANISER AUTHORIZATION ERROR:', error);
        res.status(500).json({ error: 'Could not verify organiser access' });
    }
};

export default organiserMiddleware;
