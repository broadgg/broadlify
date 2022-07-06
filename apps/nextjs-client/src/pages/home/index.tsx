import type { NextPage } from 'next';

import styles from '@/pages/home/styles.module.css';

const Home: NextPage = () => (
  <div className={styles.container}>
    <main className={styles.main}>
      <h1 className={styles.title}>Today is 06.07.2022</h1>
    </main>
  </div>
);

export default Home;
