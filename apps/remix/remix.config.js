/** @type {import('@remix-run/dev').AppConfig} */
const config = {
  appDirectory: 'src',
};

if (process.env.NODE_ENV === 'production') {
  config.server = 'server/lambda.ts';
}

module.exports = config;