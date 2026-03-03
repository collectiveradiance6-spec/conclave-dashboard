import { Router } from 'express';
import { getAdminDashboard, manageServerAutomation } from '../controllers/adminController';
import { verifyToken } from '../middleware/auth';
import { checkAdminRole } from '../middleware/roles';

const router = Router();

router.use(verifyToken);
router.use(checkAdminRole);

router.get('/dashboard', getAdminDashboard);
router.post('/manage-server', manageServerAutomation);

export default router;