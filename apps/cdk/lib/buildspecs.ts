const createBuildBuildspec = () => ({
  artifacts: {
    'secondary-artifacts': {
      api: {
        'base-directory': 'apps/api/dist',
        files: ['*.js'],
      },

      nextjsClientOutput: {
        'base-directory': 'apps/nextjs-client/dist',
        files: ['**/*'],
      },
      reactOutput: {
        'base-directory': 'apps/react/dist',
        files: ['**/*'],
      },
      // backend: {
      //   'base-directory': 'apps/backend/dist',
      //   files: ['**/*'],
      // },
    },
  },
  phases: {
    build: {
      commands: [
        'npm run api:build',
        'npm run react:build',
        'npm run nextjs-client:build',
        // 'npm run backend:build',
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
  cloudfrontId: string;
  functionNames: string[];
};

const createDeployBuildspec = ({
  cloudfrontId,
  functionNames,
}: CreateDeployBuildspecParams) => ({
  phases: {
    build: {
      commands: [
        ...functionNames.map(
          (functionName) =>
            `aws lambda update-function-code --function-name ${functionName} --s3-bucket marekvargovcik.com-api --s3-key source --region us-east-1`,
        ),
        `aws cloudfront create-invalidation --distribution-id ${cloudfrontId} --paths "/*"`,
      ],
    },
  },
  version: 0.2,
});

export { createBuildBuildspec, createDeployBuildspec };
