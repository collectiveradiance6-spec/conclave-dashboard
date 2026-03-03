import { Request, Response } from 'express';
import { discordService } from '../services/discordService';

export const login = (req: Request, res: Response) => {
    const redirectUri = discordService.getOAuthRedirectUri();
    res.redirect(redirectUri);
};

export const callback = async (req: Request, res: Response) => {
    const { code } = req.query;
    try {
        const userData = await discordService.getUserData(code as string);
        // Handle user session and JWT token creation here
        res.status(200).json(userData);
    } catch (error) {
        res.status(500).json({ message: 'Authentication failed', error });
    }
};