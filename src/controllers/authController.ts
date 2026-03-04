import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { getUserData, generateAuthUrl } from '../services/discordService';

export const login = (req: Request, res: Response) => {
    const url = generateAuthUrl();
    res.redirect(url);
};

export const callback = async (req: Request, res: Response) => {
    const { code } = req.query;

    if (!code) {
        return res.status(400).json({ message: "No code provided" });
    }

    try {
        const userData = await getUserData(code as string);

        // 🔥 CREATE JWT HERE
        const token = jwt.sign(
            {
                discordId: userData.id,
                username: userData.username,
                role: "admin" // TEMP for testing
            },
            process.env.JWT_SECRET as string,
            { expiresIn: "1h" }
        );

        res.status(200).json({
            token,
            user: userData
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Authentication failed" });
    }
};