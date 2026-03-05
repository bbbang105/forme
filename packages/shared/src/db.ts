import {drizzle, type PostgresJsDatabase} from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

let _db: PostgresJsDatabase<typeof schema> | undefined;

/**
 * Lazy-initialized DB singleton.
 * Throws only at first actual usage, not at import/build time.
 */
export const db = new Proxy({} as PostgresJsDatabase<typeof schema>, {
  get(_target, prop, receiver) {
    if (!_db) {
      const connStr = process.env.DATABASE_URL;
      if (!connStr) {
        throw new Error('DATABASE_URL environment variable is not set');
      }
      const client = postgres(connStr, {
        max: 1,
        idle_timeout: 20,
        connect_timeout: 10,
        prepare: false,
        ssl: 'require',
      });
      _db = drizzle(client, { schema });
    }
    return Reflect.get(_db, prop, receiver);
  },
});

export { schema };
