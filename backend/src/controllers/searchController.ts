import { Request, Response } from 'express';
import { searchEmails } from '../services/elasticsearchService';
import { prisma } from '../config/database';

interface AuthUser { id: string; }

export async function searchEmailsHandler(req: Request, res: Response): Promise<void> {
  const user = req.user as AuthUser;
  const q = (req.query.q as string) || '';
  const statuses = typeof req.query.status === 'string'
    ? req.query.status.split(',').map((value) => value.trim().toUpperCase()).filter(Boolean)
    : [];
  const from = Math.max(0, Number.parseInt(req.query.from as string || '0', 10) || 0);
  const size = Math.min(100, Math.max(1, Number.parseInt(req.query.size as string || '20', 10) || 20));

  const result = await searchEmails(user.id, q.trim(), statuses, from, size);
  const ids = result.hits.map((hit) => hit.id);
  const records = ids.length ? await prisma.emailJob.findMany({
    where: { userId: user.id, id: { in: ids } },
    include: { sender: { select: { email: true, name: true } } },
  }) : [];
  const byId = new Map(records.map((record) => [record.id, record]));
  res.json({
    hits: ids.map((id) => byId.get(id)).filter(Boolean),
    total: result.total,
    from,
    size,
  });
}
