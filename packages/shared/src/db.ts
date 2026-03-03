import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

let db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let client: ReturnType<typeof postgres> | null = null;

export function getDb(connectionString?: string) {
  if (db) {
    return db;
  }

  const connStr = connectionString || process.env.DATABASE_URL;

  if (!connStr) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  client = postgres(connStr, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
  });

  db = drizzle(client, { schema });

  return db;
}

export async function closeDb() {
  if (client) {
    await client.end();
    client = null;
    db = null;
  }
}

export { schema };
