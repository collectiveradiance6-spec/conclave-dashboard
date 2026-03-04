import { Response, NextFunction } from "express";
import { AuthRequest } from "../types/AuthRequest";

const roles = {
    admin: 'admin',
    user: 'user',
};

export const checkRole = (role: string) => {
    return (req: AuthRequest, res: Response, next: NextFunction) => {
        const userRole = req.user?.role; // Assuming req.user is populated with user data

        if (userRole && userRole === role) {
            next();
        } else {
            return res.status(403).json({ message: 'Access denied' });
        }
    };
};

export const checkAdmin = checkRole(roles.admin);