import * as iam from "aws-cdk-lib/aws-iam";
import * as elasticbeanstalk from "aws-cdk-lib/aws-elasticbeanstalk";
import * as s3assets from "aws-cdk-lib/aws-s3-assets";
import * as path from "path";
import { Construct } from "constructs";

export class Backend extends Construct {
  constructor(scope: Construct, name: string) {
    super(scope, name);

    const role = new iam.Role(this, `${name}-aws-elasticbeanstalk-ec2-role`, {
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
    });

    const managedPolicy = iam.ManagedPolicy.fromAwsManagedPolicyName(
      "AWSElasticBeanstalkWebTier"
    );
    role.addManagedPolicy(managedPolicy);

    const profileName = `${name}-Directus-InstanceProfile`;
    new iam.CfnInstanceProfile(this, profileName, {
      instanceProfileName: profileName,
      roles: [role.roleName],
    });

    const app = new elasticbeanstalk.CfnApplication(this, "Application", {
      applicationName: `${name}-Directus-App`,
    });

    const elbZipArchive = new s3assets.Asset(this, "MyElbAppZip", {
      path: path.join(__dirname, "../../src/directus-bare/Archive.zip"),
    });

    const appVersionProps = new elasticbeanstalk.CfnApplicationVersion(
      this,
      "ApplicationVersion",
      {
        applicationName: `${name}-Directus-App`,
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
          value: profileName,
        },
      ];

    const node = this.node;
    const platform = node.tryGetContext("platform");
    const env = new elasticbeanstalk.CfnEnvironment(this, "Environment", {
      environmentName: `${name}-Directus-Env`,
      applicationName: `${name}-Directus-App`,
      platformArn: platform,
      solutionStackName: "64bit Amazon Linux 2 v5.5.2 running Node.js 14",
      optionSettings: optionSettingProperties,
      versionLabel: appVersionProps.ref,
    });

    appVersionProps.addDependsOn(app);
    env.addDependsOn(app);
  }
}
