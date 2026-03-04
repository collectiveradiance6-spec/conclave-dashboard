import { Router } from 'express';
import { getServiceStatusController, restartServiceController } from '../controllers/nitradoController';
import { verifyToken } from '../middleware/auth';
import { checkAdmin } from '../middleware/roles';

const router = Router();

router.get('/:serviceId/status', verifyToken, checkAdmin, getServiceStatusController);
router.post('/:serviceId/restart', verifyToken, checkAdmin, restartServiceController);

export default router;