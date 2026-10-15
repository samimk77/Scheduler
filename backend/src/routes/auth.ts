import { Router, Request, Response, NextFunction } from 'express';
import passport from 'passport';
import { getMe, logout } from '../controllers/authController';
import { requireAuth } from '../middleware/auth';
import { googleOAuthConfigured } from '../config/passport';

const router = Router();

// Initiate Google OAuth flow
router.get('/google', (_req: Request, res: Response, next: NextFunction) => {
  if (!googleOAuthConfigured) {
    res.status(503).json({ error: 'Google OAuth is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_CALLBACK_URL.' });
    return;
  }
  next();
}, passport.authenticate('google', {
  scope: ['profile', 'email'],
}));

// Google OAuth callback
router.get('/google/callback',
  (_req: Request, res: Response, next: NextFunction) => {
    if (!googleOAuthConfigured) {
      res.status(503).json({ error: 'Google OAuth is not configured.' });
      return;
    }
    next();
  },
  passport.authenticate('google', { session: true }),
  (err: Error & { oauthError?: { statusCode?: number; data?: string; message?: string } }, _req: Request, res: Response, next: NextFunction) => {
    // The OAuth library wraps the provider response as oauthError. Show the
    // safe provider error code in logs; never log the client secret or token.
    let providerReason = err.oauthError?.message || err.message;
    if (err.oauthError?.data) {
      try {
        const payload = JSON.parse(err.oauthError.data) as { error?: string; error_description?: string };
        providerReason = [payload.error, payload.error_description].filter(Boolean).join(': ') || providerReason;
      } catch { /* retain safe generic reason */ }
    }
    console.error(`Google OAuth callback failed (HTTP ${err.oauthError?.statusCode || 'unknown'}): ${providerReason}`);
    if (res.headersSent) return next(err);
    res.redirect(`${process.env.FRONTEND_URL}/?error=oauth_failed`);
  },
  (_req: Request, res: Response) => {
    res.redirect(`${process.env.FRONTEND_URL}/dashboard`);
  }
);

// Get current user
router.get('/me', requireAuth, getMe);

// Logout
router.post('/logout', logout);

export default router;
