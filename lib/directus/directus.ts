import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as elasticbeanstalk from "aws-cdk-lib/aws-elasticbeanstalk";
import * as s3assets from "aws-cdk-lib/aws-s3-assets";
import * as path from "path";
import { Bucket } from "aws-cdk-lib/aws-s3";
import { Iam } from "./iam";
import * as fs from "fs";

export interface DirectusAppProps extends StackProps {
  readonly appName: string;
  readonly fileBucket: Bucket;
  readonly iam: Iam;
}

export class DirectusApp extends Stack {
  constructor(scope: Construct, id: string, props?: DirectusAppProps) {
    super(scope, id, props);
    const appName = props?.appName;

    const app = new elasticbeanstalk.CfnApplication(this, "Application", {
      applicationName: `${appName}-Directus-App`,
    });

    fs.appendFileSync(
      path.join(__dirname, "../res/directus/.env"),
      `
        STORAGE_LOCATIONS="s3"
        STORAGE_S3_KEY="${props?.fileBucket}"
        STORAGE_S3_SECRET=""
        STORAGE_S3_BUCKET="${props?.fileBucket.bucketName}"
        STORAGE_S3_REGION="eu-central-1"
        STORAGE_S3_ENDPOINT=""
      `
    );

    const elbZipArchive = new s3assets.Asset(this, "MyElbAppZip", {
      path: path.join(__dirname, "../res/directus/Archive.zip"),
    });

    const appVersionProps = new elasticbeanstalk.CfnApplicationVersion(
      this,
      "ApplicationVersion",
      {
        applicationName: `${appName}-Directus-App`,
        sourceBundle: {
          s3Bucket: elbZipArchive.s3BucketName,
          s3Key: elbZipArchive.s3ObjectKey,
        },
      }
    );

    const optionSettingProperties: elasticbeanstalk.CfnEnvironment.OptionSettingProperty[] =
      [
        {
          namespace: "aws:autoscaling:launchconfiguration",
          optionName: "InstanceType",
          value: "t2.medium",
        },
        {
          namespace: "aws:autoscaling:asg",
          optionName: "MinSize",
          value: "1",
        },
        {
          namespace: "aws:autoscaling:asg",
          optionName: "MaxSize",
          value: "1",
        },
        {
          namespace: "aws:autoscaling:launchconfiguration",
          optionName: "IamInstanceProfile",
          value: props?.iam.profileName,
        },
      ];

    const node = this.node;
    const platform = node.tryGetContext("platform");
    const env = new elasticbeanstalk.CfnEnvironment(this, "Environment", {
      environmentName: `${appName}-Directus-Env`,
      applicationName: `${appName}-Directus-App`,
      platformArn: platform,
      solutionStackName: "64bit Amazon Linux 2 v5.5.2 running Node.js 14",
      optionSettings: optionSettingProperties,
      versionLabel: appVersionProps.ref,
    });

    appVersionProps.addDependsOn(app);
    env.addDependsOn(app);
  }
}
