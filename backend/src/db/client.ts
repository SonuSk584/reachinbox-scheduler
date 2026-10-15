import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import { env } from '../config/env';
import * as schema from './schema';

// timezone 'Z' => all DATETIME values are read/written as UTC, independent of server TZ.
export const pool = mysql.createPool({ uri: env.DATABASE_URL, connectionLimit: 20, timezone: 'Z' });
export const db = drizzle(pool, { schema, mode: 'default' });
