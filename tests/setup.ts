// Loads the test environment before anything imports '@/config/env'.
import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(__dirname, '../.env.test'), override: true });
process.env.NODE_ENV = 'test';
