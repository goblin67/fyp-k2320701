import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import User from '../modules/users/user.model.js';

const createOrganiser = async (): Promise<void> => {
    const mongoUri = process.env.MONGO_DB_URI;
    const username = process.env.INITIAL_ORGANISER_USERNAME?.trim() || '1234';
    const password = process.env.INITIAL_ORGANISER_PASSWORD;

    if (!mongoUri) throw new Error('MONGO_DB_URI is not configured');
    if (!password || password.length < 8) {
        throw new Error('Set INITIAL_ORGANISER_PASSWORD to a private password of at least 8 characters');
    }

    await mongoose.connect(mongoUri);
    const existingUser = await User.findOne({ username });

    if (existingUser) {
        const passwordMatches = await bcrypt.compare(password, existingUser.password);
        if (!passwordMatches) {
            throw new Error(`Account "${username}" already exists. Its password must be verified before assigning organiser access.`);
        }
        existingUser.role = 'organiser';
        await existingUser.save();
        console.log(`Organiser access assigned to existing account "${username}".`);
        return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await User.create({ username, password: passwordHash, role: 'organiser' });
    console.log(`Organiser account "${username}" created.`);
};

createOrganiser()
    .catch((error: unknown) => {
        console.error('Could not provision organiser:', error instanceof Error ? error.message : error);
        process.exitCode = 1;
    })
    .finally(async () => {
        if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
    });
