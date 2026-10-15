import { esClient, EMAIL_INDEX } from '../config/elasticsearch';
import { prisma } from '../config/database';

export interface EmailDocument {
  id: string;
  userId: string;
  senderId: string;
  senderEmail: string;
  recipients: string[];
  subject: string;
  body: string;
  status: string;
  scheduledAt: string;
  sentAt?: string;
  createdAt: string;
}

export async function indexEmailJob(doc: EmailDocument): Promise<void> {
  try {
    await esClient.index({
      index: EMAIL_INDEX,
      id: doc.id,
      document: doc,
      refresh: 'wait_for',
    });
  } catch (err) {
    console.error('❌ Failed to index email in Elasticsearch:', (err as Error).message);
    // Non-fatal
  }
}

/** Reconcile pre-existing database rows into Elasticsearch on API startup. */
export async function backfillEmailSearchIndex(): Promise<number> {
  const batchSize = 500;
  let offset = 0;
  let indexed = 0;

  while (true) {
    const jobs = await prisma.emailJob.findMany({
      skip: offset,
      take: batchSize,
      orderBy: { id: 'asc' },
      include: { sender: { select: { email: true } } },
    });
    if (!jobs.length) break;

    const operations = jobs.flatMap((job) => [
      { index: { _index: EMAIL_INDEX, _id: job.id } },
      {
        id: job.id,
        userId: job.userId,
        senderId: job.senderId,
        senderEmail: job.sender.email,
        recipients: job.recipients as string[],
        subject: job.subject,
        body: job.body,
        status: job.status,
        scheduledAt: job.scheduledAt.toISOString(),
        ...(job.sentAt ? { sentAt: job.sentAt.toISOString() } : {}),
        createdAt: job.createdAt.toISOString(),
      },
    ]);
    const result = await esClient.bulk({ operations, refresh: false });
    if (result.errors) {
      const failures = result.items.filter((item) => item.index?.error).length;
      console.error(`Elasticsearch backfill batch had ${failures} failed records`);
    }

    indexed += jobs.length;
    offset += jobs.length;
  }

  await esClient.indices.refresh({ index: EMAIL_INDEX });
  return indexed;
}

export async function searchEmails(
  userId: string,
  query: string,
  statuses: string[] = [],
  from = 0,
  size = 20
): Promise<{ hits: EmailDocument[]; total: number }> {
  try {
    const must: object[] = [
      { term: { userId } },
    ];

    if (statuses.length) {
      must.push({ terms: { status: statuses } });
    }

    if (query) {
      // Existing indexes map senderEmail/recipients as keyword fields, so a
      // multi_match there only finds whole email addresses. Search body and
      // subject as text, and email fields with case-insensitive substrings.
      const emailQuery = query.replace(/[\\*?]/g, '\\$&');
      must.push({
        bool: {
          should: [
            {
              multi_match: {
                query,
                fields: ['subject', 'body'],
                fuzziness: 'AUTO',
              },
            },
            { wildcard: { recipients: { value: `*${emailQuery}*`, case_insensitive: true } } },
            { wildcard: { senderEmail: { value: `*${emailQuery}*`, case_insensitive: true } } },
          ],
          minimum_should_match: 1,
        },
      });
    }

    const result = await esClient.search<EmailDocument>({
      index: EMAIL_INDEX,
      from,
      size,
      query: { bool: { must } },
      sort: [{ createdAt: { order: 'desc' } }],
    });

    const hits = result.hits.hits.map((hit) => hit._source as EmailDocument);
    const total = typeof result.hits.total === 'number'
      ? result.hits.total
      : result.hits.total?.value || 0;

    return { hits, total };
  } catch (err) {
    console.error('❌ Elasticsearch search error:', err);
    return { hits: [], total: 0 };
  }
}

export async function deleteEmailFromIndex(id: string): Promise<void> {
  try {
    await esClient.delete({ index: EMAIL_INDEX, id });
  } catch (_err) {
    // Non-fatal
  }
}
