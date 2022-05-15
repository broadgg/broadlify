import * as route53 from 'aws-cdk-lib/aws-route53';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as cloudfrontOrigins from 'aws-cdk-lib/aws-cloudfront-origins';
import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codepipelineActions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apiGateway from 'aws-cdk-lib/aws-apigateway';
import { Construct } from 'constructs';

const DOMAIN_NAME = 'marekvargovcik.com';
export class Infrastructure extends Construct {
  constructor(scope: Construct, name: string) {
    super(scope, name);

    const zone = route53.HostedZone.fromLookup(this, 'Zone', { domainName: DOMAIN_NAME });
    const cloudfrontOAI = new cloudfront.OriginAccessIdentity(this, 'CloudfrontOAI');

    const siteBucket = new s3.Bucket(this, 'SiteBucket', {
      autoDeleteObjects: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      bucketName: DOMAIN_NAME,
      publicReadAccess: false,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const apiBucket = new s3.Bucket(this, 'ApiBucket', {
      autoDeleteObjects: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      bucketName: `${DOMAIN_NAME}-api`,
      publicReadAccess: false,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    siteBucket.addToResourcePolicy(new iam.PolicyStatement({
      actions: ['s3:GetObject'],
      resources: [siteBucket.arnForObjects('*')],
      principals: [new iam.CanonicalUserPrincipal(cloudfrontOAI.cloudFrontOriginAccessIdentityS3CanonicalUserId)]
    }));

    const certificate = new acm.DnsValidatedCertificate(this, 'SiteCertificate', {
      domainName: DOMAIN_NAME,
      hostedZone: zone,
      region: 'us-east-1',
    });

    const distribution = new cloudfront.Distribution(this, 'SiteDistribution', {
      certificate: certificate,
      defaultRootObject: "index.html",
      domainNames: [DOMAIN_NAME],
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      errorResponses:[
        {
          httpStatus: 403,
          responseHttpStatus: 403,
          responsePagePath: '/error.html',
          ttl: Duration.minutes(30),
        }
      ],
      defaultBehavior: {
        origin: new cloudfrontOrigins.S3Origin(siteBucket, {originAccessIdentity: cloudfrontOAI}),
        compress: true,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      }
    })

    new route53.ARecord(this, 'SiteAliasRecord', {
      recordName: DOMAIN_NAME,
      target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution)),
      zone
    });

    new s3deploy.BucketDeployment(this, 'DeployWithInvalidation', {
      sources: [s3deploy.Source.asset('./src/web')],
      destinationBucket: siteBucket,
      distribution,
      distributionPaths: ['/*'],
    });

    const pipeline = new codepipeline.Pipeline(this, 'Pipeline', {
      crossAccountKeys: false,
    });

    const repositorySource = new codepipeline.Artifact();

    const sourceStage = new codepipelineActions.GitHubSourceAction({
      actionName: 'Checkout',
      output: repositorySource,
      owner: 'broadgg',
      repo: 'broadlify',
      branch: 'main',
      oauthToken: secretsmanager.Secret.fromSecretNameV2(this, 'token', 'githubOauthToken').secretValue,
      trigger: codepipelineActions.GitHubTrigger.WEBHOOK,
    });

    pipeline.addStage({
      stageName: 'Source',
      actions: [sourceStage],
    });

    const websiteOutput = new codepipeline.Artifact('website');
    const apiOutput = new codepipeline.Artifact('api');

    const buildStage = new codepipelineActions.CodeBuildAction({
      actionName: "Build",
      project: new codebuild.PipelineProject(this, "BuildWebsite", {
        projectName: "Website",
        buildSpec: codebuild.BuildSpec.fromSourceFilename(
          "./lib/buildspec.yml"
        ),
      }),
      input: repositorySource,
      outputs: [websiteOutput, apiOutput],
    });

    pipeline.addStage({
      stageName: 'Build',
      actions: [buildStage],
    });

    const websiteDeployStage = new codepipelineActions.S3DeployAction({
      actionName: "Website",
      input: websiteOutput,
      bucket: siteBucket,
    });

    const apiDeployStage = new codepipelineActions.S3DeployAction({
      actionName: "Api",
      input: apiOutput,
      bucket: apiBucket,
      extract: false,
      objectKey: 'source',
    });

    pipeline.addStage({
      stageName: "Deploy",
      actions: [websiteDeployStage, apiDeployStage],
    });

    // const greetingLambda = new lambda.Function(this, 'greetingLambda', {
    //   runtime: lambda.Runtime.NODEJS_14_X,
    //   code: lambda.Code.fromBucket(apiBucket, 'greeting.js'),
    //   handler: 'greeting.handler',
    // });
    
    // const api = new apiGateway.RestApi(this, 'api', {
    //   restApiName: 'api'
    // });
    
    // const apiIndex = api.root.addResource('index');
    // apiIndex.addMethod('GET', new apiGateway.LambdaIntegration(greetingLambda));
  }
}
