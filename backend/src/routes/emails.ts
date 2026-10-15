import { Router } from 'express';
import multer from 'multer';
import {
  scheduleEmail,
  getScheduledEmails,
  getSentEmails,
  getEmailById,
  getSenders,
  createSender,
  createEtherealSender,
} from '../controllers/emailController';
import { requireAuth } from '../middleware/auth';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// All routes require auth
router.use(requireAuth);

// Sender management
router.get('/senders', getSenders);
router.post('/senders', createSender);
router.post('/senders/ethereal', createEtherealSender);

// Email scheduling
router.post('/schedule', upload.single('csvFile'), scheduleEmail);
router.get('/scheduled', getScheduledEmails);
router.get('/sent', getSentEmails);
router.get('/:id', getEmailById);

export default router;
