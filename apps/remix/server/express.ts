import path from 'node:path';

import { createRequestHandler } from '@remix-run/express';
import express from 'express';

const BUILD_DIR = path.join(__dirname, '../');

const app = express();

app.use(express.static('public'));
app.use('/build', express.static('public/build'));

app.all('*', (req, res, next) => {
  for (const key in require.cache) {
    if (key.startsWith(BUILD_DIR)) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete require.cache[key];
    }
  }

  return createRequestHandler({
    // eslint-disable-next-line @typescript-eslint/no-require-imports, node/global-require
    build: require(BUILD_DIR),
    mode: process.env.NODE_ENV,
  })(req, res, next);
});

const port = process.env.PORT ?? 3_000;

app.listen(port);
