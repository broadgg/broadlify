import { Link } from '@remix-run/react';

const Index = () => (
  <div style={{ fontFamily: 'system-ui, sans-serif', lineHeight: '1.4' }}>
    <h1>Welcome to Remix - Index page</h1>
    <ul>
      <li>
        <a
          href='https://remix.run/tutorials/blog'
          rel='noreferrer'
          target='_blank'
        >
          15m Quickstart Blog Tutorial
        </a>
      </li>
      <li>
        <a
          href='https://remix.run/tutorials/jokes'
          rel='noreferrer'
          target='_blank'
        >
          Deep Dive Jokes App Tutorial
        </a>
      </li>
      <li>
        <a href='https://remix.run/docs' rel='noreferrer' target='_blank'>
          Remix Docs
        </a>
      </li>
      <li>
        <Link to='/about'>Go to About</Link>
      </li>
    </ul>
  </div>
);

export default Index;
