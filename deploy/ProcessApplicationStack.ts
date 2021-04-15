#!/usr/bin/env node
/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable no-new */
import * as cdk from '@aws-cdk/core';
import * as lambda from '@aws-cdk/aws-lambda';
import * as lambdaNodejs from '@aws-cdk/aws-lambda-nodejs';
import path from 'path';
// import * as logs from '@aws-cdk/aws-logs';
import sfn = require('@aws-cdk/aws-stepfunctions');
import sfnTasks = require('@aws-cdk/aws-stepfunctions-tasks');

const functionEntry = path.join(__dirname, '..', 'src', 'functions', 'index.ts');

export default class ProcessApplicationStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string) {
    super(scope, id);

    // State machine functions

    const performIdentityCheckFunction = this.addFunction('PerformIdentityCheck');
    const aggregateIdentityResultsFunction = this.addFunction('AggregateIdentityResults');
    // const performAffordabilityCheckFunction = this.addFunction('PerformAffordabilityCheck');
    // const sendEmailFunction = this.addFunction('SendEmail');
    // const notifyUnderwriterFunction = this.addFunction('NotifyUnderwriter');

    // State machine

    // stateMachineType: sfn.StateMachineType.EXPRESS,
    // logs: {
    //   destination: new logs.LogGroup(this, 'ProcessApplicationLogGroup'),
    //   level: sfn.LogLevel.ALL,
    // },

    const processApplicationStateMachine = new sfn.StateMachine(
      this,
      'ProcessApplicationStateMachine',
      {
        definition: sfn.Chain.start(
          new sfn.Map(this, 'PerformIdentityChecks', {
            inputPath: '$.application',
            itemsPath: '$.applicants',
            resultPath: '$.identityResults',
          })
            .iterator(
              new sfnTasks.LambdaInvoke(this, 'PerformIdentityCheck', {
                lambdaFunction: performIdentityCheckFunction,
                payloadResponseOnly: true,
              })
            )
            .next(
              new sfnTasks.LambdaInvoke(this, 'AggregateIdentityResults', {
                lambdaFunction: aggregateIdentityResultsFunction,
                payloadResponseOnly: true,
                inputPath: '$.identityResults',
                resultPath: '$.overallIdentityResult',
              })
            )
            .next(
              new sfn.Choice(this, 'EvaluateIdentityResults')
                .when(
                  sfn.Condition.booleanEquals('$.overallIdentityResult', false),
                  new sfn.Pass(this, 'PerformDeclineTasks')
                )
                .otherwise(new sfn.Pass(this, 'Continue'))
            )
        ),
      }
    );

    // new sfn.Parallel(this, 'PerformDeclineTasks').branch(
    //   new sfnTasks.LambdaInvoke(this, 'SendDeclineEmail', {
    //     lambdaFunction: sendEmailFunction,
    //     // TODO 13Apr21: How do we specify parameters?
    //     payload: sfn.TaskInput.fromObject({
    //       emailType: 'Decline',
    //       'application.$': '$.application',
    //     }),
    //     outputPath: '$.Payload',
    //   })
    // )

    // TODO 12Apr21: What about common sub-states? E.g., if we wanted to jump to 'Decline' from multiple points.
    // https://docs.aws.amazon.com/cdk/api/latest/docs/aws-stepfunctions-readme.html#state-machine-fragments
    // TODO 12Apr21: Perhaps break the definition into multiple parts

    new cdk.CfnOutput(this, 'ProcessApplicationStateMachine.ARN', {
      value: processApplicationStateMachine.stateMachineArn,
    });
  }

  private addFunction(functionName: string): lambda.Function {
    return new lambdaNodejs.NodejsFunction(this, `${functionName}Function`, {
      entry: functionEntry,
      handler: `handle${functionName}`,
    });
  }
}
