import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  database: process.env.DB_NAME,
  host: process.env.DB_HOSTNAME,
  password: process.env.DB_PASSWORD,
  port: Number.parseInt(process.env.DB_PORT, 10),
  user: process.env.DB_USER,
});

export { pool as database };
