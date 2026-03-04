import { Request, Response } from 'express';
import { getServiceStatus, restartService } from '../services/nitradoService';

export const getServiceStatusController = async (req: Request, res: Response) => {
    try {
        const status = await getServiceStatus(req.params.serviceId);
        res.status(200).json(status);
    } catch (error: any) {
        res.status(500).json({ message: 'Error fetching service status', error: error.message });
    }
};

export const restartServiceController = async (req: Request, res: Response) => {
    try {
        const result = await restartService(req.params.serviceId);
        res.status(200).json(result);
    } catch (error: any) {
        res.status(500).json({ message: 'Error restarting service', error: error.message });
    }
};