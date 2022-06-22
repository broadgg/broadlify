import * as path from 'node:path';

import * as apiGatewayV2Alpha from '@aws-cdk/aws-apigatewayv2-alpha';
import * as apiGatewayV2AlphaIntegrations from '@aws-cdk/aws-apigatewayv2-integrations-alpha';
import * as cdk from 'aws-cdk-lib';
import * as apiGateway from 'aws-cdk-lib/aws-apigateway';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as cloudfrontOrigins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codepipelineActions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elasticbeanstalk from 'aws-cdk-lib/aws-elasticbeanstalk';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

import * as buildspecs from './buildspecs';

const addWWWSuffix = (domain: string) => `www.${domain}`;

const SOURCE_DIRECTORIES = {
  API: path.join(__dirname, '../../api/dist/source'),
  BACKEND: path.join(__dirname, '../../backend/dist/source'),
  NEXTJS_CLIENT: path.join(__dirname, '../../nextjs-client/dist'),
  REACT: path.join(__dirname, '../../react/dist'),
  REMIX: path.join(__dirname, '../../remix/build/source'),
};

const DOMAIN_NAME = 'marekvargovcik.com';
const API_DOMAIN_NAME = `api.${DOMAIN_NAME}`;
const REACT_DOMAIN_NAME = `react.${DOMAIN_NAME}`;
const NEXTJS_CLIENT_DOMAIN_NAME = `nextjs-client.${DOMAIN_NAME}`;
// const NEXTJS_SERVER_DOMAIN_NAME = `nextjs-server.${DOMAIN_NAME}`;
const REMIX_DOMAIN_NAME = `remix.${DOMAIN_NAME}`;

type InfrastructureProps = {
  accountId: string;
};

class Infrastructure extends Construct {
  constructor(scope: Construct, name: string, props: InfrastructureProps) {
    super(scope, name);

    // credentials
    const secrets = secretsmanager.Secret.fromSecretNameV2(
      this,
      'secrets',
      'broadlifySecrets',
    );
    const githubOauthToken = secrets.secretValueFromJson('githubOauthToken');
    const rdsUsername = secrets.secretValueFromJson('rdsUsername');
    const rdsPassword = secrets.secretValueFromJson('rdsPassword');

    // networking
    const vpc = new ec2.Vpc(this, 'vpc', {
      cidr: '10.0.0.0/16',
      maxAzs: 2,
      subnetConfiguration: [
        {
          cidrMask: 20,
          name: 'broadlify-public-subnet-01',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 20,
          name: 'broadlify-public-subnet-02',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 20,
          name: 'broadlify-private-subnet-01',
          subnetType: ec2.SubnetType.PRIVATE_WITH_NAT,
        },
        {
          cidrMask: 20,
          name: 'broadlify-private-subnet-02',
          subnetType: ec2.SubnetType.PRIVATE_WITH_NAT,
        },
      ],
      vpcName: 'broadlify-vpc',
    });

    // database
    const database = new rds.DatabaseCluster(this, 'rds', {
      credentials: rds.Credentials.fromPassword(
        rdsUsername.toString(),
        rdsPassword,
      ),
      engine: rds.DatabaseClusterEngine.AURORA_MYSQL,
      instanceProps: {
        instanceType: ec2.InstanceType.of(
          ec2.InstanceClass.T3,
          ec2.InstanceSize.SMALL,
        ),
        publiclyAccessible: true,
        vpc,
        vpcSubnets: vpc.selectSubnets({
          subnetType: ec2.SubnetType.PUBLIC,
        }),
      },
    });

    // opens 3306 port
    database.connections.allowDefaultPortFromAnyIpv4();

    const zone = route53.HostedZone.fromLookup(this, 'zone', {
      domainName: DOMAIN_NAME,
    });

    const cloudfrontOAI = new cloudfront.OriginAccessIdentity(
      this,
      'cloudfrontOAI',
    );

    // react
    const reactBucket = new s3.Bucket(this, 'reactBucket', {
      autoDeleteObjects: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      bucketName: REACT_DOMAIN_NAME,
      publicReadAccess: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    reactBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        actions: ['s3:GetObject'],
        principals: [
          new iam.CanonicalUserPrincipal(
            cloudfrontOAI.cloudFrontOriginAccessIdentityS3CanonicalUserId,
          ),
        ],
        resources: [reactBucket.arnForObjects('*')],
      }),
    );

    const reactCertificate = new acm.DnsValidatedCertificate(
      this,
      'reactCertificate',
      {
        domainName: REACT_DOMAIN_NAME,
        hostedZone: zone,
        region: 'us-east-1',
        subjectAlternativeNames: [addWWWSuffix(REACT_DOMAIN_NAME)],
      },
    );

    const reactDistribution = new cloudfront.Distribution(
      this,
      'reactDistribution',
      {
        certificate: reactCertificate,
        defaultBehavior: {
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
          origin: new cloudfrontOrigins.S3Origin(reactBucket, {
            originAccessIdentity: cloudfrontOAI,
          }),
          viewerProtocolPolicy:
            cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        },
        defaultRootObject: 'index.html',
        domainNames: [REACT_DOMAIN_NAME, addWWWSuffix(REACT_DOMAIN_NAME)],
        enableLogging: true,
      },
    );

    new route53.ARecord(this, 'reactARecord', {
      recordName: REACT_DOMAIN_NAME,
      target: route53.RecordTarget.fromAlias(
        new targets.CloudFrontTarget(reactDistribution),
      ),
      zone,
    });

    new route53.CnameRecord(this, 'reactCnameRecord', {
      domainName: REACT_DOMAIN_NAME,
      recordName: addWWWSuffix(REACT_DOMAIN_NAME),
      zone,
    });

    new s3deploy.BucketDeployment(this, 'reactBucketDeployment', {
      destinationBucket: reactBucket,
      distribution: reactDistribution,
      distributionPaths: ['/*'],
      sources: [s3deploy.Source.asset(SOURCE_DIRECTORIES.REACT)],
    });

    // nextjs client
    const nextjsClientBucket = new s3.Bucket(this, 'nextjsClientBucket', {
      autoDeleteObjects: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      bucketName: NEXTJS_CLIENT_DOMAIN_NAME,
      publicReadAccess: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    nextjsClientBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        actions: ['s3:GetObject'],
        principals: [
          new iam.CanonicalUserPrincipal(
            cloudfrontOAI.cloudFrontOriginAccessIdentityS3CanonicalUserId,
          ),
        ],
        resources: [nextjsClientBucket.arnForObjects('*')],
      }),
    );

    const nextjsClientCertificate = new acm.DnsValidatedCertificate(
      this,
      'nextjsClientCertificate',
      {
        domainName: NEXTJS_CLIENT_DOMAIN_NAME,
        hostedZone: zone,
        region: 'us-east-1',
        subjectAlternativeNames: [addWWWSuffix(NEXTJS_CLIENT_DOMAIN_NAME)],
      },
    );

    const nextjsClientDistribution = new cloudfront.Distribution(
      this,
      'nextjsClientDistribution',
      {
        certificate: nextjsClientCertificate,
        defaultBehavior: {
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
          origin: new cloudfrontOrigins.S3Origin(nextjsClientBucket, {
            originAccessIdentity: cloudfrontOAI,
          }),
          viewerProtocolPolicy:
            cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        },
        defaultRootObject: 'home.html',
        domainNames: [
          NEXTJS_CLIENT_DOMAIN_NAME,
          addWWWSuffix(NEXTJS_CLIENT_DOMAIN_NAME),
        ],
        enableLogging: true,
      },
    );

    new route53.ARecord(this, 'nextjsClientARecord', {
      recordName: NEXTJS_CLIENT_DOMAIN_NAME,
      target: route53.RecordTarget.fromAlias(
        new targets.CloudFrontTarget(nextjsClientDistribution),
      ),
      zone,
    });

    new route53.CnameRecord(this, 'nextjsClientCnameRecord', {
      domainName: NEXTJS_CLIENT_DOMAIN_NAME,
      recordName: addWWWSuffix(NEXTJS_CLIENT_DOMAIN_NAME),
      zone,
    });

    new s3deploy.BucketDeployment(this, 'nextjsClientBucketDeployment', {
      destinationBucket: nextjsClientBucket,
      distribution: nextjsClientDistribution,
      distributionPaths: ['/*'],
      sources: [s3deploy.Source.asset(SOURCE_DIRECTORIES.NEXTJS_CLIENT)],
    });

    // remix
    const remixBucket = new s3.Bucket(this, 'remixBucket', {
      autoDeleteObjects: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      bucketName: REMIX_DOMAIN_NAME,
      publicReadAccess: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    remixBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        actions: ['s3:GetObject'],
        principals: [
          new iam.CanonicalUserPrincipal(
            cloudfrontOAI.cloudFrontOriginAccessIdentityS3CanonicalUserId,
          ),
        ],
        resources: [remixBucket.arnForObjects('*')],
      }),
    );

    const remixBuildDeployment = new s3deploy.BucketDeployment(
      this,
      'remixBucketDeployment',
      {
        destinationBucket: remixBucket,
        sources: [s3deploy.Source.asset(SOURCE_DIRECTORIES.REMIX)],
      },
    );

    const remixLambda = new lambda.Function(this, 'remixLambda', {
      code: lambda.Code.fromBucket(remixBucket, 'source'),
      handler: 'index.handler',
      runtime: lambda.Runtime.NODEJS_14_X,
      timeout: cdk.Duration.seconds(10),
    });
    remixLambda.node.addDependency(remixBuildDeployment);

    const remixHttpApi = new apiGatewayV2Alpha.HttpApi(this, 'remixHttpApi', {
      defaultIntegration:
        new apiGatewayV2AlphaIntegrations.HttpLambdaIntegration(
          'remixHttpApiIntegration',
          remixLambda,
          {
            payloadFormatVersion:
              apiGatewayV2Alpha.PayloadFormatVersion.VERSION_2_0,
          },
        ),
    });

    const remixHttpApiUrl = `${remixHttpApi.httpApiId}.execute-api.${
      cdk.Stack.of(this).region
    }.${cdk.Stack.of(this).urlSuffix}`;

    const remixCertificate = new acm.DnsValidatedCertificate(
      this,
      'remixCertificate',
      {
        domainName: REMIX_DOMAIN_NAME,
        hostedZone: zone,
        region: 'us-east-1',
        subjectAlternativeNames: [addWWWSuffix(REMIX_DOMAIN_NAME)],
      },
    );

    const remixDistribution = new cloudfront.Distribution(
      this,
      'remixDistribution',
      {
        certificate: remixCertificate,
        defaultBehavior: {
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          origin: new cloudfrontOrigins.HttpOrigin(remixHttpApiUrl),
          originRequestPolicy: new cloudfront.OriginRequestPolicy(
            this,
            'remixOriginRequestPolicy',
            {
              cookieBehavior: cloudfront.OriginRequestCookieBehavior.all(),
              // https://stackoverflow.com/questions/65243953/pass-query-params-from-cloudfront-to-api-gateway
              headerBehavior: cloudfront.OriginRequestHeaderBehavior.none(),
              originRequestPolicyName: 'remixOriginRequestPolicyName',
              queryStringBehavior:
                cloudfront.OriginRequestQueryStringBehavior.all(),
            },
          ),
          viewerProtocolPolicy:
            cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        },
        domainNames: [REMIX_DOMAIN_NAME, addWWWSuffix(REMIX_DOMAIN_NAME)],
        enableLogging: true,
      },
    );

    new route53.ARecord(this, 'remixARecord', {
      recordName: REMIX_DOMAIN_NAME,
      target: route53.RecordTarget.fromAlias(
        new targets.CloudFrontTarget(remixDistribution),
      ),
      zone,
    });

    new route53.CnameRecord(this, 'remixCnameRecord', {
      domainName: REMIX_DOMAIN_NAME,
      recordName: addWWWSuffix(REMIX_DOMAIN_NAME),
      zone,
    });

    // api
    const apiBucket = new s3.Bucket(this, 'apiBucket', {
      autoDeleteObjects: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      bucketName: API_DOMAIN_NAME,
      publicReadAccess: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const apiDeployment = new s3deploy.BucketDeployment(this, 'apiDeploy', {
      destinationBucket: apiBucket,
      sources: [s3deploy.Source.asset(SOURCE_DIRECTORIES.API)],
    });

    // api
    const lambdaEnvironment: lambda.FunctionOptions['environment'] = {
      DB_HOSTNAME: database.clusterEndpoint.hostname,
      DB_NAME: 'aws_db',
      DB_PASSWORD: rdsPassword.toString(),
      DB_PORT: database.clusterEndpoint.port.toString(),
      DB_USER: rdsUsername.toString(),
    };

    const logLambda = new lambda.Function(this, 'logLambda', {
      code: lambda.Code.fromBucket(apiBucket, 'source'),
      environment: lambdaEnvironment,
      handler: 'log.handler',
      runtime: lambda.Runtime.NODEJS_14_X,
    });

    logLambda.node.addDependency(apiDeployment);

    const apiCertificate = new acm.DnsValidatedCertificate(
      this,
      'apiCertificate',
      {
        domainName: API_DOMAIN_NAME,
        hostedZone: zone,
        region: 'us-east-1',
        subjectAlternativeNames: [addWWWSuffix(API_DOMAIN_NAME)],
      },
    );

    const api = new apiGateway.LambdaRestApi(this, 'api', {
      domainName: {
        certificate: apiCertificate,
        domainName: API_DOMAIN_NAME,
        endpointType: apiGateway.EndpointType.EDGE,
      },
      handler: logLambda,
      proxy: false,
      restApiName: 'api',
    });

    api.root.addMethod('GET');

    new route53.ARecord(this, 'apiARecord', {
      recordName: API_DOMAIN_NAME,
      target: route53.RecordTarget.fromAlias(new targets.ApiGateway(api)),
      zone,
    });

    new route53.CnameRecord(this, 'apiCnameRecord', {
      domainName: API_DOMAIN_NAME,
      recordName: addWWWSuffix(API_DOMAIN_NAME),
      zone,
    });

    // backend
    const backendBucket = new s3.Bucket(this, 'BackendBucket', {
      autoDeleteObjects: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      bucketName: `${DOMAIN_NAME}-backend`,
      publicReadAccess: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const backendDeployment = new s3deploy.BucketDeployment(
      this,
      'BackendDeploy',
      {
        destinationBucket: backendBucket,
        sources: [s3deploy.Source.asset(SOURCE_DIRECTORIES.BACKEND)],
      },
    );

    const role = new iam.Role(this, `${name}-aws-elasticbeanstalk-ec2-role`, {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
    });

    const managedPolicy = iam.ManagedPolicy.fromAwsManagedPolicyName(
      'AWSElasticBeanstalkWebTier',
    );
    role.addManagedPolicy(managedPolicy);

    const profileName = `${name}-Directus-InstanceProfile`;

    new iam.CfnInstanceProfile(this, profileName, {
      instanceProfileName: profileName,
      roles: [role.roleName],
    });

    const s3User = new iam.User(this, 'S3User', {
      userName: `${name}-s3-user`,
    });

    s3User.addManagedPolicy(
      iam.ManagedPolicy.fromManagedPolicyArn(
        this,
        'S3AccessPolicy',
        'arn:aws:iam::aws:policy/AmazonS3FullAccess',
      ),
    );

    const s3AccessKey = new iam.CfnAccessKey(this, 'S3AccessKey', {
      userName: s3User.userName,
    });

    const fileStorageBucket = new s3.Bucket(this, 'FileStorageBucket', {
      autoDeleteObjects: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      bucketName: `${DOMAIN_NAME}-file-storage`,
      publicReadAccess: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const app = new elasticbeanstalk.CfnApplication(this, 'Application', {
      applicationName: `${name}-Directus-App`,
    });

    const appVersion = new elasticbeanstalk.CfnApplicationVersion(
      this,
      'ApplicationVersion',
      {
        applicationName: `${name}-Directus-App`,
        sourceBundle: {
          s3Bucket: backendBucket.bucketName,
          s3Key: 'source',
        },
      },
    );
    appVersion.node.addDependency(backendDeployment);
    appVersion.addDependsOn(app);

    const ebPublicSubnetsSelection = vpc.selectSubnets({
      onePerAz: true,
      subnetType: ec2.SubnetType.PUBLIC,
    });

    const ebPrivateSubnetsSelection = vpc.selectSubnets({
      onePerAz: true,
      subnetType: ec2.SubnetType.PRIVATE_WITH_NAT,
    });

    const optionSettingProperties: elasticbeanstalk.CfnEnvironment.OptionSettingProperty[] =
      [
        {
          namespace: 'aws:autoscaling:launchconfiguration',
          optionName: 'InstanceType',
          value: 't2.small',
        },
        {
          namespace: 'aws:autoscaling:asg',
          optionName: 'MinSize',
          value: '1',
        },
        {
          namespace: 'aws:autoscaling:asg',
          optionName: 'MaxSize',
          value: '1',
        },
        {
          namespace: 'aws:autoscaling:launchconfiguration',
          optionName: 'IamInstanceProfile',
          value: profileName,
        },
        {
          namespace: 'aws:ec2:vpc',
          optionName: 'VPCId',
          value: vpc.vpcId,
        },
        {
          namespace: 'aws:ec2:vpc',
          optionName: 'ELBSubnets',
          value: ebPublicSubnetsSelection.subnetIds.join(','),
        },
        {
          namespace: 'aws:ec2:vpc',
          optionName: 'Subnets',
          value: ebPrivateSubnetsSelection.subnetIds.join(','),
        },
        // Directus - Config options - General
        {
          namespace: 'aws:elasticbeanstalk:application:environment',
          optionName: 'PORT',
          value: '8080',
        },
        // Directus - Config options - Database
        {
          namespace: 'aws:elasticbeanstalk:application:environment',
          optionName: 'DB_CLIENT',
          value: 'mysql',
        },
        {
          namespace: 'aws:elasticbeanstalk:application:environment',
          optionName: 'DB_HOST',
          value: database.clusterEndpoint.hostname,
        },
        {
          namespace: 'aws:elasticbeanstalk:application:environment',
          optionName: 'DB_PORT',
          value: database.clusterEndpoint.port.toString(),
        },
        {
          namespace: 'aws:elasticbeanstalk:application:environment',
          optionName: 'DB_DATABASE',
          value: 'directus',
        },
        {
          namespace: 'aws:elasticbeanstalk:application:environment',
          optionName: 'DB_USER',
          value: rdsUsername.toString(),
        },
        {
          namespace: 'aws:elasticbeanstalk:application:environment',
          optionName: 'DB_PASSWORD',
          value: rdsPassword.toString(),
        },
        // Directus - Config options - Security
        {
          namespace: 'aws:elasticbeanstalk:application:environment',
          optionName: 'KEY',
          value: 'e9389813-ded0-4594-941c-abf8ca4535a7',
        },
        {
          namespace: 'aws:elasticbeanstalk:application:environment',
          optionName: 'SECRET',
          value: 'btzkt!7(^2jzo9%zt_4nc=_)hiyq^lk3+0i&#&=e*9fv4islx2',
        },
        // Directus - Config options - File storage
        {
          namespace: 'aws:elasticbeanstalk:application:environment',
          optionName: 'STORAGE_LOCATIONS',
          value: 's3',
        },
        {
          namespace: 'aws:elasticbeanstalk:application:environment',
          optionName: 'STORAGE_S3_DRIVER',
          value: 's3',
        },
        {
          namespace: 'aws:elasticbeanstalk:application:environment',
          optionName: 'STORAGE_S3_KEY',
          value: s3AccessKey.ref,
        },
        {
          namespace: 'aws:elasticbeanstalk:application:environment',
          optionName: 'STORAGE_S3_SECRET',
          value: s3AccessKey.attrSecretAccessKey,
        },
        {
          namespace: 'aws:elasticbeanstalk:application:environment',
          optionName: 'STORAGE_S3_BUCKET',
          value: fileStorageBucket.bucketName,
        },
        {
          namespace: 'aws:elasticbeanstalk:application:environment',
          optionName: 'STORAGE_S3_REGION',
          value: 'us-east-1',
        },
      ];

    const node = this.node;
    const platform = node.tryGetContext('platform');
    const env = new elasticbeanstalk.CfnEnvironment(this, 'Environment', {
      applicationName: `${name}-Directus-App`,
      environmentName: `${name}-Directus-Env`,
      optionSettings: optionSettingProperties,
      platformArn: platform,
      solutionStackName: '64bit Amazon Linux 2 v5.5.2 running Node.js 14',
      versionLabel: appVersion.ref,
    });
    env.node.addDependency(database);
    env.addDependsOn(app);

    // ci/cd
    const pipeline = new codepipeline.Pipeline(this, 'pipeline', {
      crossAccountKeys: true,
    });

    const repositorySource = new codepipeline.Artifact();

    const sourceStage = new codepipelineActions.GitHubSourceAction({
      actionName: 'Checkout',
      branch: 'main',
      oauthToken: githubOauthToken,
      output: repositorySource,
      owner: 'broadgg',
      repo: 'broadlify',
      trigger: codepipelineActions.GitHubTrigger.WEBHOOK,
    });

    pipeline.addStage({
      actions: [sourceStage],
      stageName: 'Source',
    });

    const apiOutput = new codepipeline.Artifact('apiOutput');
    const backendOutput = new codepipeline.Artifact('backendOutput');
    const nextjsClientOutput = new codepipeline.Artifact('nextjsClientOutput');
    const reactOutput = new codepipeline.Artifact('reactOutput');
    const remixOutput = new codepipeline.Artifact('remixOutput');

    const buildStage = new codepipelineActions.CodeBuildAction({
      actionName: 'Build',
      input: repositorySource,
      outputs: [
        apiOutput,
        backendOutput,
        nextjsClientOutput,
        reactOutput,
        remixOutput,
      ],
      project: new codebuild.PipelineProject(this, 'project', {
        buildSpec: codebuild.BuildSpec.fromObject(
          buildspecs.createBuildBuildspec(),
        ),
        environment: {
          buildImage: codebuild.LinuxBuildImage.STANDARD_5_0,
        },
        projectName: 'Build',
      }),
    });

    pipeline.addStage({
      actions: [buildStage],
      stageName: 'Build',
    });

    const uploadApiArtifactToS3Action = new codepipelineActions.S3DeployAction({
      actionName: 'uploadApiAction',
      bucket: apiBucket,
      extract: false,
      input: apiOutput,
      objectKey: 'source',
    });

    const uploadReactArtifactToS3Action =
      new codepipelineActions.S3DeployAction({
        actionName: 'uploadReactAction',
        bucket: reactBucket,
        input: reactOutput,
      });

    const uploadNextJsClientArtifactToS3Action =
      new codepipelineActions.S3DeployAction({
        actionName: 'uploadNextjsClientAction',
        bucket: nextjsClientBucket,
        input: nextjsClientOutput,
      });

    const uploadRemixBuildArtifactToS3Action =
      new codepipelineActions.S3DeployAction({
        actionName: 'uploadRemixBuildAction',
        bucket: remixBucket,
        extract: false,
        input: remixOutput,
        objectKey: 'source',
      });

    const uploadBackendArtifactToS3Action =
      new codepipelineActions.S3DeployAction({
        actionName: 'Backend',
        bucket: backendBucket,
        extract: false,
        input: backendOutput,
        objectKey: 'source',
      });

    pipeline.addStage({
      actions: [
        uploadApiArtifactToS3Action,
        uploadReactArtifactToS3Action,
        uploadNextJsClientArtifactToS3Action,
        uploadRemixBuildArtifactToS3Action,
        uploadBackendArtifactToS3Action,
      ],
      stageName: 'Upload',
    });

    const deployActionProjectBuildspec = codebuild.BuildSpec.fromObject(
      buildspecs.createDeployBuildspec({
        backend: {
          applicationName: app.applicationName as string,
          environmentName: env.environmentName as string,
          source: {
            bucket: backendBucket.bucketName,
            key: 'source',
          },
        },
        distributions: [
          {
            id: reactDistribution.distributionId,
            path: '/*',
          },
          {
            id: remixDistribution.distributionId,
            path: '/*',
          },
          {
            id: nextjsClientDistribution.distributionId,
            path: '/*',
          },
        ],
        functions: [
          {
            bucket: apiBucket.bucketName,
            key: 'source',
            name: logLambda.functionName,
          },
          {
            bucket: remixBucket.bucketName,
            key: 'source',
            name: remixLambda.functionName,
          },
        ],
      }),
    );

    const deployActionProject = new codebuild.PipelineProject(
      this,
      'deployApi',
      {
        buildSpec: deployActionProjectBuildspec,
        environment: {
          buildImage: codebuild.LinuxBuildImage.STANDARD_5_0,
        },
        projectName: 'Deploy',
      },
    );

    deployActionProject.node.addDependency(app);

    // const reactDistributionArn = `arn:aws:cloudfront::${props.accountId}:distribution/${reactDistribution.distributionId}`;
    // const nextJsClientDistributionArn = `arn:aws:cloudfront::${props.accountId}:distribution/${nextjsClientDistribution.distributionId}`;
    // const remixDistributionArn = `arn:aws:cloudfront::${props.accountId}:distribution/${remixDistribution.distributionId}`;

    deployActionProject.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          'cloudfront:CreateInvalidation',
          'lambda:UpdateFunctionCode',
          's3:*',
          'elasticbeanstalk:*',
          'cloudformation:*',
        ],
        resources: [
          '*',
          // reactDistributionArn,
          // nextJsClientDistributionArn,
          // remixDistributionArn,
          // logLambda.functionArn,
          // remixLambda.functionArn,
          // `${apiBucket.bucketArn}/source`,
          // `${remixBucket.bucketArn}/source`,
          // `${backendBucket.bucketArn}/source`,
          // `arn:aws:s3:::elasticbeanstalk-us-east-1-${props.accountId}`,
          // `arn:aws:s3:::elasticbeanstalk-us-east-1-${props.accountId}/*`,
          // `arn:aws:elasticbeanstalk:us-east-1:${props.accountId}:applicationversion/*`,
          // `arn:aws:elasticbeanstalk:us-east-1:${props.accountId}:environment/*`,
        ],
      }),
    );

    const deployAction = new codepipelineActions.CodeBuildAction({
      actionName: 'Deploy',
      input: repositorySource,
      project: deployActionProject,
    });

    pipeline.addStage({
      actions: [deployAction],
      stageName: 'Deploy',
    });
  }
}

export { Infrastructure };
