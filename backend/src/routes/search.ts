import { Router } from 'express';
import { searchEmailsHandler } from '../controllers/searchController';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.use(requireAuth);

// GET /api/search?q=hello&status=SENT&from=0&size=20
router.get('/', searchEmailsHandler);

export default router;
