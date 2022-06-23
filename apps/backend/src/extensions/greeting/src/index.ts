import { defineEndpoint } from '@directus/extensions-sdk';

export default defineEndpoint((router) => {
  router.get('/hello', (_req, res) => res.send('This changed!'));
});
