import { Router } from 'express';
import { getServiceStatus, restartService } from '../controllers/nitradoController';
import { authenticate } from '../middleware/auth';
import { checkAdminRole } from '../middleware/roles';

const router = Router();

// Route to get the status of a Nitrado service
router.get('/status', authenticate, checkAdminRole, getServiceStatus);

// Route to restart a Nitrado service
router.post('/restart', authenticate, checkAdminRole, restartService);

export default router;