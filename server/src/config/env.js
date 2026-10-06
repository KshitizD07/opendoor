import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env file from server root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const envSchema = z.object({
  PORT: z.coerce.number().default(5000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  CLIENT_URL: z.string().default('http://localhost:3000'),

  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET must be at least 16 chars'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET must be at least 16 chars'),
  QR_JWT_SECRET: z.string().min(16, 'QR_JWT_SECRET must be at least 16 chars'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN_DAYS: z.coerce.number().default(7),

  DATABASE_URL: z.string().optional(),
  REDIS_URL: z.string().optional(),

  RAZORPAY_KEY_ID: z.string().default('rzp_test_placeholder'),
  RAZORPAY_KEY_SECRET: z.string().default('rzp_secret_placeholder'),
  RAZORPAY_WEBHOOK_SECRET: z.string().default('rzp_webhook_secret_placeholder'),

  AWS_REGION: z.string().default('ap-south-1'),
  AWS_S3_BUCKET: z.string().default('opendoor-documents'),
});

const parseEnv = () => {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('❌ Invalid environment variables:\n', JSON.stringify(result.error.format(), null, 2));
    process.exit(1);
  }
  return result.data;
};

const env = parseEnv();

export default env;
