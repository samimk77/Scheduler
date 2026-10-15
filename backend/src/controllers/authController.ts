import { Request, Response } from 'express';

export function getMe(req: Request, res: Response): void {
  const user = req.user as {
    id: string;
    email: string;
    name: string;
    avatar: string | null;
    slackToken: string | null;
    slackTeamId: string | null;
  };

  res.json({
    id: user.id,
    email: user.email,
    name: user.name,
    avatar: user.avatar,
    slackConnected: !!user.slackToken,
    slackTeamId: user.slackTeamId,
  });
}

export function logout(req: Request, res: Response): void {
  req.logout((err) => {
    if (err) {
      res.status(500).json({ error: 'Logout failed' });
      return;
    }
    req.session.destroy(() => {
      res.clearCookie('connect.sid');
      res.json({ message: 'Logged out successfully' });
    });
  });
}
