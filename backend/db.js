// ============================================================
// BELTON IPQC — MySQL Connection Pool (db.js)
// Compatible with MySQL 5.0.96 + Node.js v22 + mysql2
// ============================================================

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const mysql = require('mysql2/promise');

const DB_HOST = process.env.DB_HOST || '127.0.0.1';
const DB_PORT = parseInt(process.env.DB_PORT || '3306', 10);
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || 'belton_ipqc';
const DB_CONNECTION_LIMIT = parseInt(process.env.DB_CONNECTION_LIMIT || '10', 10);
const DB_CONNECT_TIMEOUT = parseInt(process.env.DB_CONNECT_TIMEOUT || '10000', 10);
const DB_AUTH_PLUGIN = process.env.DB_AUTH_PLUGIN || '';

const authPlugins = {};
if (DB_AUTH_PLUGIN && mysql.authPlugins && mysql.authPlugins[DB_AUTH_PLUGIN]) {
  authPlugins[DB_AUTH_PLUGIN] = mysql.authPlugins[DB_AUTH_PLUGIN];
} else if (DB_AUTH_PLUGIN && DB_AUTH_PLUGIN !== 'mysql_native_password') {
  console.warn(`⚠️ Unknown DB_AUTH_PLUGIN '${DB_AUTH_PLUGIN}'. Using default auth plugin behavior.`);
}

const pool = mysql.createPool({
  host: DB_HOST,
  port: DB_PORT,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  charset: 'utf8',

  multipleStatements: true,
  waitForConnections: true,
  connectionLimit: DB_CONNECTION_LIMIT,
  queueLimit: 0,
  connectTimeout: DB_CONNECT_TIMEOUT,
  namedPlaceholders: true,
  supportBigNumbers: true,
  bigNumberStrings: true,
  ssl: false,
  ...(Object.keys(authPlugins).length ? { authPlugins } : {}),
});

console.log(`✅ Database configuration loaded:`);
console.log(`   host=${DB_HOST}, port=${DB_PORT}, user=${DB_USER}, database=${DB_NAME}`);
if (DB_AUTH_PLUGIN) {
  console.log(`   auth plugin=${DB_AUTH_PLUGIN}`);
}

// ทดสอบ connection ตอน startup
pool.getConnection()
  .then(conn => {
    console.log('✅ MySQL 5.0.96 connected successfully to "belton_ipqc"');
    conn.release();
  })
  .catch(async err => {
    if (err.code === 'ER_BAD_DB_ERROR') {
      console.log('⚠️ Database "belton_ipqc" not found. Creating it now...');
      try {
        const rootConn = await mysql.createConnection({
          host: DB_HOST, port: DB_PORT, user: DB_USER, password: DB_PASSWORD
        });
        await rootConn.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8 COLLATE utf8_general_ci`);
        await rootConn.end();
        console.log('✅ Database created! Please RESTART the server once to apply changes.');
        process.exit(0);
      } catch (createErr) {
        console.error('❌ Failed to create database:', createErr.message);
      }
    } else {
      console.error('❌ MySQL connection FAILED:', err.message);
      console.error('   → ตรวจสอบ: MySQL กำลังรันอยู่? user/password/database ถูกต้อง?');
      console.error('   → Error code:', err.code);
    }
  });

module.exports = pool;