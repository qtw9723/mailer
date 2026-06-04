// server/db.js
import pg from 'pg'

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})

pool.on('error', (err) => console.error('pg pool error', err))

export default pool
