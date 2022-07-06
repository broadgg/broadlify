import { Link } from '@remix-run/react';

const About = () => (
  <div style={{ fontFamily: 'system-ui, sans-serif', lineHeight: '1.4' }}>
    <h1>Today is 06.07.2022</h1>
    <ul>
      <li>
        <Link to='/'>Homepage</Link>
      </li>
      <li style={{ color: 'red' }}>About</li>
    </ul>
  </div>
);

export default About;
