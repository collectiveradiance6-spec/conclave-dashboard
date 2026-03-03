import { OAuth2Client } from 'google-auth-library';
import axios from 'axios';

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const DISCORD_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI;

const oauth2Client = new OAuth2Client(DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_REDIRECT_URI);

export const generateAuthUrl = () => {
    const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: ['identify', 'email'],
    });
    return authUrl;
};

export const getUserData = async (code: string) => {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    const response = await axios.get('https://discord.com/api/users/@me', {
        headers: {
            Authorization: `Bearer ${tokens.access_token}`,
        },
    });

    return response.data;
};