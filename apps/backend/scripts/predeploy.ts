import 'dotenv/config';

import mysql from 'mysql2/promise';

// const DB_HOSTNAME =
//   'infrastructurestack-infrastructurerds337fc230-1ijg2doy62g9x.cluster-cluv9fda2rfp.us-east-1.rds.amazonaws.com';
// const DB_NAME = 'sys';
// const DB_PASSWORD = 'BiytdLQxyzJ2EK4GnsWJzHFK';
// const DB_PORT = '3306';
// const DB_USER = 'HU28KDna';

(async () => {
  try {
    const pool = mysql.createPool({
      database: process.env.DB_NAME,
      host: process.env.DB_HOSTNAME,
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
