import { RemovalPolicy, Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as s3bucket from "aws-cdk-lib/aws-s3";
import {
  BucketAccessControl,
  BucketEncryption,
  ObjectOwnership,
} from "aws-cdk-lib/aws-s3";

export interface DirectusStorageProps extends StackProps {
  readonly appName: string;
}

export class DirectusStorage extends Stack {
  bucket: s3bucket.Bucket;

  constructor(scope: Construct, id: string, props?: DirectusStorageProps) {
    super(scope, id, props);
    const appName = props?.appName;

    this.bucket = new s3bucket.Bucket(this, "DirectusStorageBucket", {
      autoDeleteObjects: true,
      bucketName: `${appName}-directus-files`,
      removalPolicy: RemovalPolicy.DESTROY,
      objectOwnership: ObjectOwnership.BUCKET_OWNER_ENFORCED,
      versioned: false,
      encryption: BucketEncryption.UNENCRYPTED,
    });
  }
}
