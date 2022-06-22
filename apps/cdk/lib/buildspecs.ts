const createBuildBuildspec = () => ({
  artifacts: {
    'secondary-artifacts': {
      api: {
        'base-directory': 'apps/api/dist',
        files: ['*.js'],
      },
      backend: {
        'base-directory': 'apps/backend/dist',
        files: ['**/*'],
      },
      nextjsClientOutput: {
        'base-directory': 'apps/nextjs-client/dist',
        files: ['**/*'],
      },
      reactOutput: {
        'base-directory': 'apps/react/dist',
        files: ['**/*'],
      },
      remixAssetsOutput: {
        'base-directory': 'apps/remix/public',
        files: ['**/*'],
      },
      remixBuildOutput: {
        'base-directory': 'apps/remix/build',
        files: ['**/.js'],
      },
    },
  },
  phases: {
    build: {
      commands: [
        'npm run api:build',
        'npm run react:build',
        'npm run nextjs-client:build',
        'npm run remix:build',
        'npm run backend:build',
      ],
    },
    install: {
      commands: ['npm install -g npm@latest', 'npm install'],
      'runtime-versions': {
        nodejs: 14,
      },
    },
  },
  version: 0.2,
});

type CreateDeployBuildspecParams = {
  distributions: Array<{
    id: string;
    path: string;
  }>;
  functions: Array<{
    bucket: string;
    key: string;
    name: string;
  }>;
};

const createDeployBuildspec = ({
  distributions,
  functions,
}: CreateDeployBuildspecParams) => {
  const lambdaUpdateCommands = functions.map(
    (fn) =>
      `aws lambda update-function-code --function-name ${fn.name} --s3-bucket ${fn.bucket} --s3-key ${fn.key} --region us-east-1`,
  );
  const distributionInvalidationCommands = distributions.map(
    (distribution) =>
      `aws cloudfront create-invalidation --distribution-id ${distribution.id} --paths "${distribution.path}"`,
  );
  return {
    phases: {
      build: {
        commands: [lambdaUpdateCommands, distributionInvalidationCommands],
      },
    },
    version: 0.2,
  };
};

export { createBuildBuildspec, createDeployBuildspec };
