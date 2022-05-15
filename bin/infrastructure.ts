#!/usr/bin/env node
import "source-map-support/register";

import * as cdk from "aws-cdk-lib";
import { Infrastructure } from "../lib/infrastructure";
import { Iam } from "../lib/directus/iam";
import { DirectusStorage } from "../lib/directus/storage";
import { DirectusApp } from "../lib/directus/directus";

class InfrastructureStack extends cdk.Stack {
  constructor(parent: cdk.App, name: string, props: cdk.StackProps) {
    super(parent, name, props);

    new Infrastructure(this, "Infrastructure");
  }
}

const app = new cdk.App();

new InfrastructureStack(app, "InfrastructureStack", {
  env: {
    account: app.node.tryGetContext("accountId"),
    region: "us-east-1",
  },
});

const APP_NAME = "test";

const iam = new Iam(app, "DirectusIAM", { appName: APP_NAME });
const storage = new DirectusStorage(app, "DirectusStorage", {
  appName: APP_NAME,
});

storage.bucket.grantReadWrite(iam.role);
storage.bucket.grantDelete(iam.role);

const directusApp = new DirectusApp(app, "DirectusApp", {
  appName: APP_NAME,
  fileBucket: storage.bucket,
  iam,
});

app.synth();
