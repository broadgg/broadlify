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
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import type { FunctionOptions } from 'aws-cdk-lib/aws-lambda';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

const WEB_SOURCE_DIRECTORY = path.join(__dirname, '../../frontend/dist');
const API_SOURCE_DIRECTORY = path.join(__dirname, '../../api/dist/source');
const DOMAIN_NAME = 'marekvargovcik.com';
const API_DOMAIN_NAME = `api.${DOMAIN_NAME}`;

class Infrastructure extends Construct {
  constructor(scope: Construct, name: string) {
    super(scope, name);

    const secrets = secretsmanager.Secret.fromSecretNameV2(
      this,
      'Secrets',
      'broadlifySecrets',
    );
    const githubOauthToken = secrets.secretValueFromJson('githubOauthToken');
    const rdsUsername = secrets.secretValueFromJson('rdsUsername');
    const rdsPassword = secrets.secretValueFromJson('rdsPassword');

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
        region: 'us-east-1',
        subjectAlternativeNames: [API_DOMAIN_NAME],
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

    const buildStage = new codepipelineActions.CodeBuildAction({
      actionName: 'Build',
      input: repositorySource,
      outputs: [websiteOutput, apiOutput],
      project: new codebuild.PipelineProject(this, 'BuildWebsite', {
        buildSpec: codebuild.BuildSpec.fromSourceFilename(
          'apps/cdk/lib/buildspec.yml',
        ),
        environment: {
          buildImage: codebuild.LinuxBuildImage.STANDARD_5_0,
        },
        projectName: 'Website',
      }),
    });

    pipeline.addStage({
      actions: [buildStage],
      stageName: 'Build',
    });

    const websiteDeployStage = new codepipelineActions.S3DeployAction({
      actionName: 'Website',
      bucket: siteBucket,
      input: websiteOutput,
    });

    const apiDeployStage = new codepipelineActions.S3DeployAction({
      actionName: 'Api',
      bucket: apiBucket,
      extract: false,
      input: apiOutput,
      objectKey: 'source',
    });

    pipeline.addStage({
      actions: [websiteDeployStage, apiDeployStage],
      stageName: 'Deploy',
    });

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
  }
}

export { Infrastructure };
