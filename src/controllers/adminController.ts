import { Request, Response } from 'express';
import { checkAdminRole } from '../middleware/roles';

export const getAdminDashboard = (req: Request, res: Response) => {
    // Logic to retrieve admin dashboard data
    res.status(200).json({ message: 'Admin dashboard data' });
};

export const manageServerAutomation = (req: Request, res: Response) => {
    // Logic to manage server automation
    res.status(200).json({ message: 'Server automation managed' });
};

export const getUserRoles = (req: Request, res: Response) => {
    // Logic to retrieve user roles
    res.status(200).json({ message: 'User roles retrieved' });
};

// Middleware to check admin role
export const isAdmin = [checkAdminRole, (req: Request, res: Response, next: Function) => {
    if (req.user && req.user.role === 'admin') {
        return next();
    }
    res.status(403).json({ message: 'Access denied' });
}];