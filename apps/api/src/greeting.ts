import type { APIGatewayProxyHandler } from 'aws-lambda';
import axios from 'axios';

const handler: APIGatewayProxyHandler = async () => {
  const URL = 'https://swapi.dev/api/people/1';

  let body;
  try {
    const response = await axios.get(URL);
    body = JSON.stringify(response.data);
  } catch {
    body = 'That did not work..';
  }

  return {
    body,
    statusCode: 200,
  };
};

export { handler };
