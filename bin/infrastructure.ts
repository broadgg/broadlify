#!/usr/bin/env node
import "source-map-support/register";

import * as cdk from "aws-cdk-lib";
import { Infrastructure } from "../lib/infrastructure";
import { Backend } from "../lib/backend";

class InfrastructureStack extends cdk.Stack {
  constructor(parent: cdk.App, name: string, props: cdk.StackProps) {
    super(parent, name, props);

    new Infrastructure(this, "Infrastructure");
    new Backend(this, "Backend");
  }
}

const app = new cdk.App();

new InfrastructureStack(app, "InfrastructureStack", {
  env: {
    account: app.node.tryGetContext("accountId"),
    region: "us-east-1",
  },
});

app.synth();
