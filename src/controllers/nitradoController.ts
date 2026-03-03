import { Request, Response } from 'express';
import { NitradoService } from '../services/nitradoService';

const nitradoService = new NitradoService();

export const getServiceStatus = async (req: Request, res: Response) => {
    try {
        const status = await nitradoService.getServiceStatus(req.params.serviceId);
        res.status(200).json(status);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching service status', error });
    }
};

export const restartService = async (req: Request, res: Response) => {
    try {
        const result = await nitradoService.restartService(req.params.serviceId);
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({ message: 'Error restarting service', error });
    }
};