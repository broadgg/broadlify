import type { APIGatewayProxyHandler } from 'aws-lambda'

const handler: APIGatewayProxyHandler = async (event) => {
  return {
    body: 'Greetings!',
    statusCode: 200,
  };
};

export { handler };