import { Pool } from 'pg';
import { readFileSync } from 'fs';
import { join } from 'path';

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
});

export async function runMigrations(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  const migrationFile = '001_initial.sql';
  const { rowCount } = await pool.query(
    'SELECT 1 FROM _migrations WHERE name = $1',
    [migrationFile]
  );

  if (rowCount === 0) {
    const sql = readFileSync(
      join(__dirname, '..', 'migrations', migrationFile),
      'utf-8'
    );
    await pool.query(sql);
    await pool.query('INSERT INTO _migrations (name) VALUES ($1)', [migrationFile]);
    console.log(`Migration ${migrationFile} applied`);
  }
}
