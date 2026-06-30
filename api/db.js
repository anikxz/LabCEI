const { Pool, types } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

// Return DATE columns as plain strings (YYYY-MM-DD) instead of JS Date objects.
// Without this, pg converts DATE → JS Date at UTC midnight, which shifts the
// date backwards by the server's UTC offset (e.g. UTC+6 → shows previous day).
types.setTypeParser(1082, (val) => val); // OID 1082 = DATE

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // For local PostgreSQL without SSL:
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL client error:', err.message);
});

// Quick connectivity test on startup
pool.query('SELECT 1').then(() => {
  console.log('PostgreSQL connected');
}).catch((err) => {
  console.error('PostgreSQL connection failed:', err.message);
  console.error('Check DATABASE_URL in your .env file');
});

module.exports = pool;
