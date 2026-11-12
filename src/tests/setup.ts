// Vitest global setup.
// Loads environment variables from .env.local so DATABASE_URL and other secrets
// are available to tests, then refuses to continue if DATABASE_URL points
// anywhere but this machine (several unit tests write to it).
import { config } from 'dotenv';
import { assertTestDatabaseIsLocal } from './local-db/guard';

config({ path: '.env.local' });
assertTestDatabaseIsLocal(process.env);
