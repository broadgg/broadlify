import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as iam from "aws-cdk-lib/aws-iam";

export interface IamProps extends StackProps {
  readonly appName: string;
}

export class Iam extends Stack {
  role: iam.Role;
  profileName: string;

  constructor(scope: Construct, id: string, props?: IamProps) {
    super(scope, id, props);
    const appName = props?.appName;

    this.role = new iam.Role(this, `${appName}-aws-elasticbeanstalk-ec2-role`, {
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
    });

    const managedPolicy = iam.ManagedPolicy.fromAwsManagedPolicyName(
      "AWSElasticBeanstalkWebTier"
    );
    this.role.addManagedPolicy(managedPolicy);

    this.profileName = `${appName}-Directus-InstanceProfile`;
    new iam.CfnInstanceProfile(this, this.profileName, {
      instanceProfileName: this.profileName,
      roles: [this.role.roleName],
    });
  }
}
