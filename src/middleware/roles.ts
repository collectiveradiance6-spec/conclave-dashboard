import { Request, Response, NextFunction } from 'express';

const roles = {
    admin: 'admin',
    user: 'user',
};

export const checkRole = (role: string) => {
    return (req: Request, res: Response, next: NextFunction) => {
        const userRole = req.user?.role; // Assuming req.user is populated with user data

        if (userRole && userRole === role) {
            next();
        } else {
            return res.status(403).json({ message: 'Access denied' });
        }
    };
};

export const checkAdmin = checkRole(roles.admin);