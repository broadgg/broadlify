import { Link } from '@remix-run/react';

const About = () => (
  <div style={{ fontFamily: 'system-ui, sans-serif', lineHeight: '1.4' }}>
    <h1>Today is 07.07.2022</h1>
    <ul>
      <li style={{ color: 'red' }}>Homepage</li>
      <li>
        <Link to='/about'>About</Link>
      </li>
    </ul>
  </div>
);

export default About;
