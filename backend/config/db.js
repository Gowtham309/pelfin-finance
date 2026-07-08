import sqlite3 from 'sqlite3';
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { Pool } = pg;

const usePostgres = !!process.env.DATABASE_URL;
let dbSqlite = null;
let dbPostgresPool = null;

if (usePostgres) {
  console.log('[Database] Connecting to PostgreSQL database pool...');
  dbPostgresPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } // Required for hosting platforms like Render / Neon
  });
} else {
  console.log('[Database] Connecting to SQLite database...');
  let dbPath = process.env.DB_PATH || './database.sqlite';
  if (process.env.NODE_ENV === 'production') {
    try {
      if (!fs.existsSync('/data')) {
        fs.mkdirSync('/data', { recursive: true });
      }
      dbPath = '/data/database.sqlite';
    } catch (err) {
      console.error('Failed to initialize persistent database volume directory:', err.message);
    }
  }

  dbSqlite = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('Error opening SQLite database:', err.message);
    } else {
      dbSqlite.run('PRAGMA foreign_keys = ON;', (pragmaErr) => {
        if (pragmaErr) {
          console.error('Failed to enable SQLite foreign keys:', pragmaErr.message);
        }
      });
    }
  });
}

// Convert SQLite query placeholders and functions to Postgres format on-the-fly
function convertQuery(sql) {
  if (!usePostgres) return sql;

  // 1. Translate SQLite strftime("%Y-%m", column) to PostgreSQL to_char(column, 'YYYY-MM')
  let pgSql = sql.replace(/strftime\((["'])%Y-%m\1,\s*([a-zA-Z0-9._]+)\)/g, "to_char($2, 'YYYY-MM')");

  // 2. Convert ? placeholders to $1, $2, $3, etc.
  let index = 1;
  return pgSql.replace(/\?/g, () => `$${index++}`);
}

// Promisified query wrappers
export const dbRun = (sql, params = []) => {
  if (usePostgres) {
    return new Promise((resolve, reject) => {
      dbPostgresPool.query(convertQuery(sql), params, (err, res) => {
        if (err) {
          reject(err);
        } else {
          resolve({ lastID: null, changes: res.rowCount });
        }
      });
    });
  } else {
    return new Promise((resolve, reject) => {
      dbSqlite.run(sql, params, function (err) {
        if (err) {
          reject(err);
        } else {
          resolve({ lastID: this.lastID, changes: this.changes });
        }
      });
    });
  }
};

export const dbGet = (sql, params = []) => {
  if (usePostgres) {
    return new Promise((resolve, reject) => {
      dbPostgresPool.query(convertQuery(sql), params, (err, res) => {
        if (err) {
          reject(err);
        } else {
          resolve(res.rows[0] || null);
        }
      });
    });
  } else {
    return new Promise((resolve, reject) => {
      dbSqlite.get(sql, params, (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }
};

export const dbAll = (sql, params = []) => {
  if (usePostgres) {
    return new Promise((resolve, reject) => {
      dbPostgresPool.query(convertQuery(sql), params, (err, res) => {
        if (err) {
          reject(err);
        } else {
          resolve(res.rows);
        }
      });
    });
  } else {
    return new Promise((resolve, reject) => {
      dbSqlite.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }
};
export const initDb = async () => {
  const schemaPath = path.join(__dirname, '../models/schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');

  if (usePostgres) {
    const pgSchema = schema.replace(/\bDATETIME\b/gi, 'TIMESTAMP');
    // Split schema file to execute statement blocks sequentially
    const queries = pgSchema
      .split(';')
      .map(q => q.trim())
      .filter(q => q.length > 0 && !q.startsWith('--'));

    for (const query of queries) {
      await new Promise((resolve, reject) => {
        dbPostgresPool.query(query, (err) => {
          if (err) {
            console.error('PostgreSQL schema creation execution error:', err.message, 'Query:', query);
            reject(err);
          } else {
            resolve();
          }
        });
      });
    }
  } else {
    return new Promise((resolve, reject) => {
      dbSqlite.exec(schema, (err) => {
        if (err) {
          console.error('SQLite schema execution error:', err);
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }
};

export default dbSqlite || dbPostgresPool;
