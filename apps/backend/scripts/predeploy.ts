import 'dotenv/config';

import mysql from 'mysql2/promise';

(async () => {
  try {
    const pool = mysql.createPool({
      database: 'sys',
      host: process.env.DB_HOST,
      password: process.env.DB_PASSWORD,
      port: Number.parseInt(process.env.DB_PORT as string, 10),
      user: process.env.DB_USER,
    });

    await pool.execute('CREATE DATABASE IF NOT EXISTS directus;');

    await pool.end();
  } catch (error) {
    console.error(error);
  }
})();
