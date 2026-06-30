/**
 * scripts/migrate-from-supabase.js
 *
 * Migrates data from a Supabase project into the local PostgreSQL database.
 *
 * Usage:
 *   SUPABASE_URL=https://xxxx.supabase.co \
 *   SUPABASE_SERVICE_KEY=eyJ... \
 *   node scripts/migrate-from-supabase.js
 *
 * The script is safe to re-run — it uses INSERT ... ON CONFLICT DO NOTHING
 * so existing rows are never overwritten.
 *
 * Tables migrated (in order):
 *   instruments → maintenance_logs → documents → notification_settings
 *
 * NOTE: Supabase Auth users (passwords) cannot be migrated — Supabase stores
 * them in a private auth.users table that is not accessible via the REST API.
 * If you need to preserve user accounts, use the Supabase dashboard to export
 * auth.users and re-hash passwords manually, OR have users sign up again.
 */

const path = require('path');
// Resolve dependencies from api/ which has pg and dotenv installed
const apiDir = path.join(__dirname, '../api');
require(path.join(apiDir, 'node_modules/dotenv')).config({ path: path.join(__dirname, '../.env') });

const { Pool } = require(path.join(apiDir, 'node_modules/pg'));

// ─── Config ──────────────────────────────────────────────────────────────────

const SUPABASE_URL        = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const DATABASE_URL        = process.env.DATABASE_URL;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌  Missing required environment variables:');
  if (!SUPABASE_URL)         console.error('   SUPABASE_URL');
  if (!SUPABASE_SERVICE_KEY) console.error('   SUPABASE_SERVICE_KEY');
  console.error('\nRun as:');
  console.error('  SUPABASE_URL=https://xxxx.supabase.co SUPABASE_SERVICE_KEY=eyJ... node scripts/migrate-from-supabase.js');
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });

// ─── Supabase REST helper ─────────────────────────────────────────────────────

async function fetchAll(table) {
  const results = [];
  let from  = 0;
  const PAGE = 1000;

  while (true) {
    const url = `${SUPABASE_URL}/rest/v1/${table}?select=*&limit=${PAGE}&offset=${from}`;
    const res = await fetch(url, {
      headers: {
        apikey:        SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        // Ask Supabase to count rows so we know when to stop
        Prefer: 'count=exact',
      },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Supabase fetch failed for "${table}" (${res.status}): ${body}`);
    }

    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) break;
    results.push(...rows);

    if (rows.length < PAGE) break; // last page
    from += PAGE;
  }

  return results;
}

// ─── Insert helpers ───────────────────────────────────────────────────────────

/**
 * Bulk-upsert rows into a local table.
 * Builds a multi-row INSERT … ON CONFLICT DO NOTHING.
 */
async function upsert(tableName, rows, columns) {
  if (rows.length === 0) return 0;

  const colList = columns.join(', ');
  const inserted = { count: 0 };

  // Insert in batches of 200 to avoid huge queries
  const BATCH = 200;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch  = rows.slice(i, i + BATCH);
    const values = [];
    const placeholders = batch.map((row, ri) => {
      const rowPlaceholders = columns.map((_, ci) => `$${ri * columns.length + ci + 1}`);
      columns.forEach((col) => values.push(row[col] ?? null));
      return `(${rowPlaceholders.join(', ')})`;
    });

    const sql = `
      INSERT INTO ${tableName} (${colList})
      VALUES ${placeholders.join(', ')}
      ON CONFLICT (id) DO NOTHING
    `;

    const result = await pool.query(sql, values);
    inserted.count += result.rowCount ?? 0;
  }

  return inserted.count;
}

// ─── Migration steps ──────────────────────────────────────────────────────────

async function migrateInstruments() {
  console.log('\n📦  Fetching instruments from Supabase...');
  const rows = await fetchAll('instruments');
  console.log(`   Found ${rows.length} instruments`);
  if (rows.length === 0) return;

  const cols = [
    'id', 'name', 'model', 'serial_number', 'location', 'category', 'status',
    'purchase_date', 'last_maintenance', 'next_maintenance',
    'last_calibration', 'next_calibration', 'notes',
    'cei_score', 'risk_score',
    'predicted_failure_days', 'failure_probability',
    'prediction_confidence', 'prediction_reasoning', 'prediction_updated_at',
    'created_at', 'updated_at',
  ];

  // Keep only columns that exist in the source rows
  const availableCols = cols.filter((c) => c in rows[0]);
  const inserted = await upsert('instruments', rows, availableCols);
  console.log(`   ✅  Inserted ${inserted} new rows (${rows.length - inserted} already existed)`);
}

async function migrateLogs() {
  console.log('\n📋  Fetching maintenance_logs from Supabase...');
  const rows = await fetchAll('maintenance_logs');
  console.log(`   Found ${rows.length} logs`);
  if (rows.length === 0) return;

  const cols = [
    'id', 'instrument_id', 'log_type', 'description',
    'technician', 'log_date', 'next_due_date', 'cost', 'status', 'created_at',
  ];
  const availableCols = cols.filter((c) => c in rows[0]);
  const inserted = await upsert('maintenance_logs', rows, availableCols);
  console.log(`   ✅  Inserted ${inserted} new rows (${rows.length - inserted} already existed)`);
}

async function migrateDocuments() {
  console.log('\n📄  Fetching documents from Supabase...');
  const rows = await fetchAll('documents');
  console.log(`   Found ${rows.length} documents`);
  if (rows.length === 0) return;

  const cols = [
    'id', 'instrument_id', 'log_id',
    'file_name', 'file_path', 'file_type', 'ocr_text', 'created_at',
  ];
  const availableCols = cols.filter((c) => c in rows[0]);
  const inserted = await upsert('documents', rows, availableCols);
  console.log(`   ✅  Inserted ${inserted} new rows (${rows.length - inserted} already existed)`);
}

async function migrateNotificationSettings() {
  console.log('\n🔔  Fetching notification_settings from Supabase...');
  const rows = await fetchAll('notification_settings');
  console.log(`   Found ${rows.length} notification settings`);
  if (rows.length === 0) return;

  const cols = [
    'id', 'email', 'full_name', 'role', 'cadence',
    'alert_overdue', 'alert_upcoming', 'alert_out_of_service', 'alert_low_cei',
    'upcoming_days', 'last_sent_at', 'created_at', 'updated_at',
  ];
  const availableCols = cols.filter((c) => c in rows[0]);
  const inserted = await upsert('notification_settings', rows, availableCols);
  console.log(`   ✅  Inserted ${inserted} new rows (${rows.length - inserted} already existed)`);
}

async function migrateProfiles() {
  console.log('\n👤  Fetching profiles from Supabase...');
  const rows = await fetchAll('profiles');
  console.log(`   Found ${rows.length} profiles`);
  if (rows.length === 0) return;

  // Profiles reference users(id). Since we can't migrate Supabase Auth users,
  // we skip profiles whose user id doesn't exist locally.
  const { rows: localUsers } = await pool.query('SELECT id FROM users');
  const localIds = new Set(localUsers.map((u) => u.id));

  const orphaned = rows.filter((r) => !localIds.has(r.id));
  const valid    = rows.filter((r) =>  localIds.has(r.id));

  if (orphaned.length > 0) {
    console.log(`   ⚠️   Skipping ${orphaned.length} profile(s) — their Supabase Auth user accounts don't exist locally.`);
    console.log('       These users will need to sign up again at http://localhost:8082/login');
    orphaned.forEach((p) => console.log(`       - ${p.email} (${p.role})`));
  }

  if (valid.length === 0) return;
  const cols = ['id', 'email', 'role', 'full_name', 'created_at', 'updated_at'];
  const availableCols = cols.filter((c) => c in rows[0]);
  const inserted = await upsert('profiles', valid, availableCols);
  console.log(`   ✅  Inserted ${inserted} new rows`);
}

// ─── Summary ──────────────────────────────────────────────────────────────────

async function printSummary() {
  console.log('\n─────────────────────────────────────────');
  console.log('📊  Local DB row counts after migration:');
  const tables = ['instruments', 'maintenance_logs', 'documents', 'notification_settings', 'users', 'profiles'];
  for (const t of tables) {
    const { rows } = await pool.query(`SELECT COUNT(*) FROM ${t}`);
    console.log(`   ${t.padEnd(25)} ${rows[0].count} rows`);
  }
  console.log('─────────────────────────────────────────');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🚀  LabCEI — Supabase → PostgreSQL Migration');
  console.log(`    Supabase: ${SUPABASE_URL}`);
  console.log(`    Local DB: ${DATABASE_URL?.replace(/:([^:@]+)@/, ':****@')}`);

  try {
    await migrateInstruments();
    await migrateLogs();
    await migrateDocuments();
    await migrateNotificationSettings();
    await migrateProfiles();
    await printSummary();
    console.log('\n✅  Migration complete!\n');
  } catch (err) {
    console.error('\n❌  Migration failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
