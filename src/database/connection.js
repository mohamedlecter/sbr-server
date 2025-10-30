const mysql = require('mysql2/promise');
require('dotenv').config();

// Create connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  database: process.env.DB_NAME || 'sbr_db_dev',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  waitForConnections: true,
  connectionLimit: 20,
  queueLimit: 0
});

// Test database connection
pool.getConnection()
  .then(connection => {
    console.log('Connected to MySQL database');
    connection.release();
  })
  .catch(err => {
    console.error('Database connection error:', err);
  });

// Helper function to execute queries
// Helper function to execute queries
const query = async (text, params = []) => {
  const start = Date.now();
  try {
    const [result, fields] = await pool.execute(text, params);
    const duration = Date.now() - start;
    console.log('Executed query', { text, duration });

    // SELECT queries return an array of rows
    if (Array.isArray(result)) {
      return { rows: result, fields, rowCount: result.length };
    }

    // Non-SELECT (INSERT/UPDATE/DELETE) return an OkPacket-like object
    return {
      affectedRows: result?.affectedRows ?? 0,
      insertId: result?.insertId ?? null
    };
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
};


// Helper function to get a connection for transactions
const getConnection = async () => {
  return await pool.getConnection();
};

// Helper function to execute transactions
const transaction = async (callback) => {
  const connection = await getConnection();
  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

module.exports = {
  pool,
  query,
  getConnection,
  transaction
};
