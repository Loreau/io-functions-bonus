import {
  IOrchestrationFunctionContext,
  Task,
  TaskSet
} from "durable-functions/lib/src/classes";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import { readableReport } from "italia-ts-commons/lib/reporters";
import { FiscalCode } from "italia-ts-commons/lib/strings";
import { SendBonusActivationFailure } from "../SendBonusActivationActivity/handler";

export const OrchestratorInput = t.interface({
  familyUID: t.string,
  fiscalCode: FiscalCode
});

export type OrchestratorInput = t.TypeOf<typeof OrchestratorInput>;

export const handler = function*(
  context: IOrchestrationFunctionContext
): Generator<TaskSet | Task> {
  const logPrefix = `StartBonusActivationOrchestrator`;
  // Get and decode orchestrator input
  const input = context.df.getInput();
  const errorOrStartBonusActivationOrchestratorInput = OrchestratorInput.decode(
    input
  );
  if (isLeft(errorOrStartBonusActivationOrchestratorInput)) {
    context.log.error(`${logPrefix}|Error decoding input`);
    context.log.verbose(
      `${logPrefix}|Error decoding input|ERROR=${readableReport(
        errorOrStartBonusActivationOrchestratorInput.value
      )}`
    );
    return false;
  }
  const undecodedSendBonusActivation = yield context.df.callActivityWithRetry(
    "SendBonusActivationActivity",
    {
      backoffCoefficient: 1.5,
      firstRetryIntervalInMilliseconds: 1000,
      maxNumberOfAttempts: 10,
      maxRetryIntervalInMilliseconds: 3600 * 100,
      retryTimeoutInMilliseconds: 3600 * 1000
    },
    errorOrStartBonusActivationOrchestratorInput.value
  );
  if (SendBonusActivationFailure.is(undecodedSendBonusActivation)) {
    yield context.df.callActivity(
      "FailedBonusActivationActivity",
      errorOrStartBonusActivationOrchestratorInput.value
    );
  } else {
    yield context.df.callActivity(
      "SuccessBonusActivationActivity",
      errorOrStartBonusActivationOrchestratorInput.value
    );
  }
  yield context.df.callActivity(
    "UnlockBonusActivationActivity",
    errorOrStartBonusActivationOrchestratorInput.value.familyUID
  );
  return true;
};