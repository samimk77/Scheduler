import Redis from 'ioredis';

const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: null, // Required for BullMQ
  enableReadyCheck: false,
};

// Connection for BullMQ (must have maxRetriesPerRequest: null)
export const bullRedisConnection = new Redis(redisConfig);

// General-purpose Redis client
export const redisClient = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
});

bullRedisConnection.on('connect', () => console.log('✅ BullMQ Redis connected'));
bullRedisConnection.on('error', (err) => console.error('❌ BullMQ Redis error:', err));

redisClient.on('connect', () => console.log('✅ Redis client connected'));
redisClient.on('error', (err) => console.error('❌ Redis client error:', err));

export default redisClient;
