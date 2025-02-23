import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema'; // Import your schema (lib/db/schema.ts)

const connection = postgres(process.env.DATABASE_URL!, { max: 1 });
export const db = drizzle(connection, { schema });
