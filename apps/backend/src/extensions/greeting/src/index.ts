import { defineEndpoint } from '@directus/extensions-sdk';

export default defineEndpoint((router) => {
  router.get('/greetings', (_req, res) => res.send('Hello, World!'));
});
