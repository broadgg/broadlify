import 'dotenv/config';

import type { APIGatewayProxyHandler } from 'aws-lambda';

import { database } from '../utils';

const handler: APIGatewayProxyHandler = async () => {
  try {
    await database.execute(
      'INSERT INTO accessLogs (ipAddress, userAgent) VALUES(?, ?)',
      ['should be ip address', 'should be user agent'],
    );
    return {
      body: JSON.stringify({
        erorrs: [],
        message: 'Saved',
        success: true,
      }),
      statusCode: 200,
    };
  } catch (error) {
    return {
      body: JSON.stringify({
        errors: [
          {
            stackTrace: error instanceof Error ? error.message : null,
          },
        ],
        message: 'Failed to save',
        success: false,
      }),
      statusCode: 500,
    };
  }
};

export { handler };
