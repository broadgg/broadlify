import 'dotenv/config';

import type { APIGatewayProxyHandler } from 'aws-lambda';

import { database } from '../utils';

const handler: APIGatewayProxyHandler = async () => {
  try {
    await database.execute(
      'CREATE TABLE IF NOT EXISTS accessLogs (ipAddress VARCHAR(255), userAgent VARCHAR(255))',
      [],
    );
    await database.execute(
      'INSERT INTO accessLogs (ipAddress, userAgent) VALUES(?, ?)',
      ['should be ip address', 'should be user agent'],
    );
    return {
      body: JSON.stringify({
        erorrs: [],
        message: 'Today is 06.07.2022. Log was saved!',
        success: true,
      }),
      statusCode: 200,
    };
  } catch (error) {
    return {
      body: JSON.stringify({
        errors: [
          {
            source: '',
            stackTrace: error instanceof Error ? error.message : null,
          },
        ],
        message: 'Today is 06.07.2022. Failed to save.',
        success: false,
      }),
      statusCode: 500,
    };
  }
};

export { handler };
