// Vitest global setup.
// Loads environment variables from .env.local so DATABASE_URL and other secrets
// are available to tests.
import { config } from 'dotenv';

config({ path: '.env.local' });
