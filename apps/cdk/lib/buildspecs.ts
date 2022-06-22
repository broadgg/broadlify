const createBuildBuildspec = () => ({
  artifacts: {
    'secondary-artifacts': {
      apiOutput: {
        'base-directory': 'apps/api/dist',
        files: ['*.js'],
      },
      backendOutput: {
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
      remixOutput: {
        'base-directory': 'apps/remix/build',
        files: ['**/*.js'],
      },
    },
  },
  phases: {
    build: {
      commands: [
        'npm run api:build',
        'npm run backend:build',
        'npm run nextjs-client:build',
        'npm run react:build',
        'npm run remix:build',
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
  backend: {
    applicationName: string;
    environmentName: string;
    source: {
      bucket: string;
      key: string;
    };
  };
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
  backend,
  distributions,
  functions,
}: CreateDeployBuildspecParams) => {
  const lambdaUpdateCommands = functions.map((fn) =>
    [
      'aws lambda',
      'update-function-code',
      `--function-name ${fn.name}`,
      `--s3-bucket ${fn.bucket}`,
      `--s3-key ${fn.key}`,
      '--region us-east-1',
    ].join(' '),
  );

  const distributionInvalidationCommands = distributions.map((distribution) =>
    [
      'aws cloudfront',
      'create-invalidation',
      `--distribution-id ${distribution.id}`,
      `--paths ${distribution.path}`,
    ].join(' '),
  );

  const backendCreateApplicationVersionCommand = [
    'aws elasticbeanstalk',
    'create-application-version',
    `--application-name ${backend.applicationName}`,
    '--version-label $CODEBUILD_RESOLVED_SOURCE_VERSION-$CODEBUILD_START_TIME',
    `--source-bundle S3Bucket="${backend.source.bucket}",S3Key="${backend.source.key}"`,
  ].join(' ');

  const backendUpdateEnvironment = [
    'aws elasticbeanstalk',
    'update-environment',
    `--environment-name ${backend.environmentName}`,
    '--version-label $CODEBUILD_RESOLVED_SOURCE_VERSION-$CODEBUILD_START_TIME',
  ].join(' ');

  return {
    phases: {
      build: {
        commands: [
          ...lambdaUpdateCommands,
          ...distributionInvalidationCommands,
          backendCreateApplicationVersionCommand,
          backendUpdateEnvironment,
        ],
      },
    },
    version: 0.2,
  };
};

export { createBuildBuildspec, createDeployBuildspec };
