import { Router } from 'express';
import { connectSlack, slackCallback, disconnectSlack, getSlackStatus } from '../controllers/slackController';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.use(requireAuth);

// Initiate Slack OAuth
router.get('/connect', connectSlack);

// Slack OAuth callback
router.get('/callback', slackCallback);

// Disconnect Slack
router.delete('/disconnect', disconnectSlack);

// Get Slack connection status
router.get('/status', getSlackStatus);

export default router;
