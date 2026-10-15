import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { prisma } from './database';

interface GoogleTokenPayload {
  access_token?: string;
  error?: string;
  error_description?: string;
}

interface GoogleTokenError extends Error {
  statusCode?: number;
  data?: string;
}

interface OAuthClientForDiagnostics {
  getOAuthAccessToken(
    code: string,
    params: Record<string, string>,
    callback: (error: GoogleTokenError | null, accessToken?: string, refreshToken?: string, payload?: GoogleTokenPayload) => void
  ): void;
}

export function setupPassport() {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_CALLBACK_URL) {
    console.warn('Google OAuth is not configured; /api/auth/google will be unavailable.');
    return;
  }
  const googleStrategy = new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        callbackURL: process.env.GOOGLE_CALLBACK_URL!,
        // Use the token endpoint published in Google's downloaded OAuth client
        // JSON rather than passport-google-oauth20's legacy default endpoint.
        tokenURL: process.env.GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token',
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value;
          if (!email) return done(new Error('No email from Google'));

          let user = await prisma.user.findUnique({
            where: { googleId: profile.id },
          });

          if (!user) {
            user = await prisma.user.create({
              data: {
                googleId: profile.id,
                email,
                name: profile.displayName,
                avatar: profile.photos?.[0]?.value || null,
              },
            });
          } else {
            // Update avatar/name if changed
            user = await prisma.user.update({
              where: { id: user.id },
              data: {
                name: profile.displayName,
                avatar: profile.photos?.[0]?.value || null,
              },
            });
          }

          return done(null, user);
        } catch (err) {
          return done(err as Error);
        }
      }
    );

  // Passport OAuth2 reports a generic "no access token" if Google's endpoint
  // returns an OAuth error body with HTTP 200. Capture only safe provider
  // diagnostics here, never the authorization code, token, client ID, or secret.
  const oauthClient = (googleStrategy as unknown as { _oauth2: OAuthClientForDiagnostics })._oauth2;
  const originalGetAccessToken = oauthClient.getOAuthAccessToken.bind(oauthClient);
  oauthClient.getOAuthAccessToken = (code, params, callback) => {
    originalGetAccessToken(code, params, (error, accessToken, refreshToken, payload) => {
      if (error) {
        let providerError = error.message;
        if (error.data) {
          try {
            const body = JSON.parse(error.data) as GoogleTokenPayload;
            providerError = [body.error, body.error_description].filter(Boolean).join(': ') || providerError;
          } catch { /* use generic transport error */ }
        }
        console.error(`Google token endpoint failed (HTTP ${error.statusCode || 'unknown'}): ${providerError.slice(0, 300)}`);
      } else if (!accessToken) {
        const providerError = [payload?.error, payload?.error_description].filter(Boolean).join(': ');
        console.error(`Google token endpoint returned no access token${providerError ? `: ${providerError.slice(0, 300)}` : ' and no OAuth error details'}`);
      }
      callback(error, accessToken, refreshToken, payload);
    });
  };

  passport.use(googleStrategy);

  passport.serializeUser((user: Express.User, done) => {
    done(null, (user as { id: string }).id);
  });

  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await prisma.user.findUnique({ where: { id } });
      done(null, user);
    } catch (err) {
      done(err);
    }
  });
}

export const googleOAuthConfigured = Boolean(
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_CALLBACK_URL
);
