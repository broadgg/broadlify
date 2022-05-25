import * as path from 'node:path';

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
import { ManagedPolicy } from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import type { FunctionOptions } from 'aws-cdk-lib/aws-lambda';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

import * as buildspecs from './buildspecs';

const WEB_SOURCE_DIRECTORY = path.join(__dirname, '../../frontend/dist');
const API_SOURCE_DIRECTORY = path.join(__dirname, '../../api/dist/source');
const BACKEND_SOURCE_DIRECTORY = path.join(
  __dirname,
  '../../backend/dist/source',
);
const DOMAIN_NAME = 'marekvargovcik.com';
const API_DOMAIN_NAME = `api.${DOMAIN_NAME}`;
const BACKEND_DOMAIN_NAME = `admin.${DOMAIN_NAME}`;
const REGION = 'us-east-1';
type InfrastructureProps = {
  accountId: string;
};

class Infrastructure extends Construct {
  constructor(scope: Construct, name: string, props: InfrastructureProps) {
    super(scope, name);

    // credentials
    const secrets = secretsmanager.Secret.fromSecretNameV2(
      this,
      'Secrets',
      'broadlifySecrets',
    );
    const githubOauthToken = secrets.secretValueFromJson('githubOauthToken');
    const rdsUsername = secrets.secretValueFromJson('rdsUsername');
    const rdsPassword = secrets.secretValueFromJson('rdsPassword');

    // networking
    const vpc = new ec2.Vpc(this, 'Vpc', {
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
    const database = new rds.DatabaseCluster(this, 'Rds', {
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

    // buckets, certificates and CDN
    const zone = route53.HostedZone.fromLookup(this, 'Zone', {
      domainName: DOMAIN_NAME,
    });
    const cloudfrontOAI = new cloudfront.OriginAccessIdentity(
      this,
      'CloudfrontOAI',
    );

    const siteBucket = new s3.Bucket(this, 'SiteBucket', {
      autoDeleteObjects: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      bucketName: DOMAIN_NAME,
      publicReadAccess: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const apiBucket = new s3.Bucket(this, 'ApiBucket', {
      autoDeleteObjects: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      bucketName: `${DOMAIN_NAME}-api`,
      publicReadAccess: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const backendBucket = new s3.Bucket(this, 'BackendBucket', {
      autoDeleteObjects: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      bucketName: `${DOMAIN_NAME}-backend`,
      publicReadAccess: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    siteBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        actions: ['s3:GetObject'],
        principals: [
          new iam.CanonicalUserPrincipal(
            cloudfrontOAI.cloudFrontOriginAccessIdentityS3CanonicalUserId,
          ),
        ],
        resources: [siteBucket.arnForObjects('*')],
      }),
    );

    const certificate = new acm.DnsValidatedCertificate(
      this,
      'SiteCertificate',
      {
        domainName: DOMAIN_NAME,
        hostedZone: zone,
        region: REGION,
        subjectAlternativeNames: [API_DOMAIN_NAME, BACKEND_DOMAIN_NAME],
      },
    );

    const distribution = new cloudfront.Distribution(this, 'SiteDistribution', {
      certificate,
      defaultBehavior: {
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        origin: new cloudfrontOrigins.S3Origin(siteBucket, {
          originAccessIdentity: cloudfrontOAI,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      defaultRootObject: 'index.html',
      domainNames: [DOMAIN_NAME],
    });

    new route53.ARecord(this, 'SiteAliasRecord', {
      recordName: DOMAIN_NAME,
      target: route53.RecordTarget.fromAlias(
        new targets.CloudFrontTarget(distribution),
      ),
      zone,
    });

    // deployment of local assets (api, frontend, backend)
    new s3deploy.BucketDeployment(this, 'DeployWithInvalidation', {
      destinationBucket: siteBucket,
      distribution,
      distributionPaths: ['/*'],
      sources: [s3deploy.Source.asset(WEB_SOURCE_DIRECTORY)],
    });

    const apiDeployment = new s3deploy.BucketDeployment(this, 'ApiDeploy', {
      destinationBucket: apiBucket,
      sources: [s3deploy.Source.asset(API_SOURCE_DIRECTORY)],
    });

    const backendDeployment = new s3deploy.BucketDeployment(
      this,
      'BackendDeploy',
      {
        destinationBucket: backendBucket,
        sources: [s3deploy.Source.asset(BACKEND_SOURCE_DIRECTORY)],
      },
    );

    // api
    const lambdaEnvironment: FunctionOptions['environment'] = {
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

    const api = new apiGateway.RestApi(this, 'api', {
      domainName: {
        certificate,
        domainName: API_DOMAIN_NAME,
        endpointType: apiGateway.EndpointType.EDGE,
      },
      restApiName: 'api',
    });

    api.root.addMethod('GET', new apiGateway.LambdaIntegration(logLambda));

    new route53.ARecord(this, 'ApiAliasRecord', {
      recordName: API_DOMAIN_NAME,
      target: route53.RecordTarget.fromAlias(new targets.ApiGateway(api)),
      zone,
    });

    // backend
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
      ManagedPolicy.fromManagedPolicyArn(
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

    const optionSettingProperties: elasticbeanstalk.CfnEnvironment.OptionSettingProperty[] =
      [
        {
          namespace: 'aws:autoscaling:launchconfiguration',
          optionName: 'InstanceType',
          value: 't2.medium',
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
          value: REGION,
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
    const pipeline = new codepipeline.Pipeline(this, 'Pipeline', {
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

    const websiteOutput = new codepipeline.Artifact('website');
    const apiOutput = new codepipeline.Artifact('api');
    // const backendOutput = new codepipeline.Artifact('backend');

    const buildStage = new codepipelineActions.CodeBuildAction({
      actionName: 'Build',
      input: repositorySource,
      outputs: [
        websiteOutput,
        apiOutput,
        // backendOutput
      ],
      project: new codebuild.PipelineProject(this, 'BuildWebsite', {
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

    const uploadWebsiteArtifactToS3Action =
      new codepipelineActions.S3DeployAction({
        actionName: 'Website',
        bucket: siteBucket,
        input: websiteOutput,
      });

    const uploadApiArtifactToS3Action = new codepipelineActions.S3DeployAction({
      actionName: 'Api',
      bucket: apiBucket,
      extract: false,
      input: apiOutput,
      objectKey: 'source',
    });

    // const uploadBackendArtifactToS3Action =
    //   new codepipelineActions.S3DeployAction({
    //     actionName: 'Backend',
    //     bucket: backendBucket,
    //     extract: false,
    //     input: backendOutput,
    //     objectKey: 'source',
    //   });

    pipeline.addStage({
      actions: [
        uploadWebsiteArtifactToS3Action,
        uploadApiArtifactToS3Action,
        // uploadBackendArtifactToS3Action,
      ],
      stageName: 'Upload',
    });

    const deployActionProject = new codebuild.PipelineProject(
      this,
      'DeployApi',
      {
        buildSpec: codebuild.BuildSpec.fromObject(
          buildspecs.createDeployBuildspec({
            cloudfrontId: distribution.distributionId,
            functionNames: [logLambda.functionName],
          }),
        ),
        environment: {
          buildImage: codebuild.LinuxBuildImage.STANDARD_5_0,
        },
        projectName: 'Deploy',
      },
    );

    const distributionArn = `arn:aws:cloudfront::${props.accountId}:distribution/${distribution.distributionId}`;

    deployActionProject.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          'cloudfront:CreateInvalidation',
          'lambda:UpdateFunctionCode',
          's3:GetObject',
        ],
        resources: [
          distributionArn,
          logLambda.functionArn,
          `${apiBucket.bucketArn}/source`,
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
