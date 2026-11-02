import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import User from '../modules/users/user.model.js';

const grantOrganiserAccess = async (): Promise<void> => {
    const mongoUri = process.env.MONGO_DB_URI;
    const username = process.env.ORGANISER_ACCESS_USERNAME?.trim();
    const password = process.env.ORGANISER_ACCESS_PASSWORD;

    if (!mongoUri) throw new Error('MONGO_DB_URI is not configured');
    if (!username) throw new Error('Set ORGANISER_ACCESS_USERNAME to the existing player account');
    if (!password) throw new Error('Set ORGANISER_ACCESS_PASSWORD to that account password');

    await mongoose.connect(mongoUri);
    const user = await User.findOne({ username });
    if (!user) throw new Error(`Account "${username}" was not found`);

    const passwordMatches = await bcrypt.compare(password, user.password);
    if (!passwordMatches) throw new Error(`Password verification failed for account "${username}"`);

    user.role = 'player';
    user.organiserAccess = true;
    await user.save();
    console.log(`Organiser access granted to player account "${username}".`);
};

grantOrganiserAccess()
    .catch((error: unknown) => {
        console.error('Could not grant organiser access:', error instanceof Error ? error.message : error);
        process.exitCode = 1;
    })
    .finally(async () => {
        if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
    });
