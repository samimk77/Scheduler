import { Client } from '@elastic/elasticsearch';

export const esClient = new Client({
  node: process.env.ELASTICSEARCH_URL || 'http://localhost:9200',
});

export const EMAIL_INDEX = 'email_jobs';

export async function setupElasticsearch(): Promise<void> {
  try {
    const exists = await esClient.indices.exists({ index: EMAIL_INDEX });
    if (!exists) {
      await esClient.indices.create({
        index: EMAIL_INDEX,
        mappings: {
          properties: {
            id: { type: 'keyword' },
            userId: { type: 'keyword' },
            senderId: { type: 'keyword' },
            senderEmail: { type: 'keyword' },
            recipients: { type: 'keyword' },
            subject: {
              type: 'text',
              fields: { keyword: { type: 'keyword' } },
            },
            body: { type: 'text' },
            status: { type: 'keyword' },
            scheduledAt: { type: 'date' },
            sentAt: { type: 'date' },
            createdAt: { type: 'date' },
          },
        },
      });
      console.log(`✅ Elasticsearch index '${EMAIL_INDEX}' created`);
    } else {
      console.log(`✅ Elasticsearch index '${EMAIL_INDEX}' already exists`);
    }
  } catch (err) {
    console.error('❌ Elasticsearch setup error:', err);
  }
}
