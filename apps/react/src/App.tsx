import styles from '@/styles.module.css';

const App = () => {
  const name = 'CDK';
  return (
    <h1>
      Hello <span className={styles.greeting}>{name}</span>!
    </h1>
  );
};

export { App };
