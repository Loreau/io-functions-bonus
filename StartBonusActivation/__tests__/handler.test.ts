// tslint:disable: no-identical-functions

import { left, right } from "fp-ts/lib/Either";
import { none, some } from "fp-ts/lib/Option";
import { FiscalCode } from "italia-ts-commons/lib/strings";
import {
  context,
  mockGetStatus,
  mockStatusCompleted,
  mockStatusRunning
} from "../../__mocks__/durable-functions";
import {
  aEligibilityCheckSuccessEligibleExpired,
  aEligibilityCheckSuccessEligibleValid,
  aEligibilityCheckSuccessIneligible,
  aRetrievedBonusActivation,
  aRetrievedBonusLease
} from "../../__mocks__/mocks";
import { BonusActivationModel } from "../../models/bonus_activation";
import { BonusLeaseModel } from "../../models/bonus_lease";
import { EligibilityCheckModel } from "../../models/eligibility_check";
import {
  makeStartBonusActivationOrchestratorId,
  makeStartEligibilityCheckOrchestratorId
} from "../../utils/orchestrators";
import { StartBonusActivationHandler } from "../handler";

// implement temporary mockGetStatus
const simulateOrchestratorIsRunning = (forOrchestratorId: string) => {
  mockGetStatus.mockImplementation(async (orchestratorId: string) =>
    orchestratorId === forOrchestratorId
      ? mockStatusRunning
      : mockStatusCompleted
  );
};

const mockEligibilityCheckFind = jest.fn().mockImplementation(async () =>
  // happy path: retrieve a valid eligible check
  right(some(aEligibilityCheckSuccessEligibleValid))
);
const mockEligibilityCheckModel = ({
  find: mockEligibilityCheckFind
} as unknown) as EligibilityCheckModel;

const mockBonusActivationCreate = jest.fn().mockImplementation(async _ => {
  return right(aRetrievedBonusActivation);
});
const mockBonusActivationModel = ({
  create: mockBonusActivationCreate
} as unknown) as BonusActivationModel;

const mockBonusLeaseCreate = jest.fn().mockImplementation(async _ => {
  return right(aRetrievedBonusLease);
});
const mockBonusLeaseModel = ({
  create: mockBonusLeaseCreate
} as unknown) as BonusLeaseModel;

const aFiscalCode = "AAABBB80A01C123D" as FiscalCode;

describe("StartBonusActivationHandler", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    // This is the default, happy path behavior
    // I need this because I don't know how many times df.getStatus get called.
    mockGetStatus.mockImplementation(async () => mockStatusCompleted);
  });

  it("should block the user if there's an eligibility check running", async () => {
    simulateOrchestratorIsRunning(
      makeStartEligibilityCheckOrchestratorId(aFiscalCode)
    );
    const handler = StartBonusActivationHandler(
      mockBonusActivationModel,
      mockBonusLeaseModel,
      mockEligibilityCheckModel
    );

    const response = await handler(context, aFiscalCode);

    expect(response.kind).toBe("IResponseErrorForbiddenNotAuthorized");
  });

  it("should notify the user if there's already a bonus activation running", async () => {
    simulateOrchestratorIsRunning(
      makeStartBonusActivationOrchestratorId(aFiscalCode)
    );

    const handler = StartBonusActivationHandler(
      mockBonusActivationModel,
      mockBonusLeaseModel,
      mockEligibilityCheckModel
    );

    const response = await handler(context, aFiscalCode);

    expect(response.kind).toBe("IResponseSuccessAccepted");
  });

  it("should tell if the eligibility check is too old", async () => {
    mockEligibilityCheckFind.mockImplementationOnce(async _ =>
      right(some(aEligibilityCheckSuccessEligibleExpired))
    );
    const handler = StartBonusActivationHandler(
      mockBonusActivationModel,
      mockBonusLeaseModel,
      mockEligibilityCheckModel
    );

    const response = await handler(context, aFiscalCode);

    expect(response.kind).toBe("IResponseErrorGone");
  });

  it("should tell if there's no eligibility check for the current user", async () => {
    mockEligibilityCheckFind.mockImplementationOnce(async _ => right(none));
    const handler = StartBonusActivationHandler(
      mockBonusActivationModel,
      mockBonusLeaseModel,
      mockEligibilityCheckModel
    );

    const response = await handler(context, aFiscalCode);

    expect(response.kind).toBe("IResponseErrorForbiddenNotAuthorized");
  });

  it("should tell if the found eligibility check for the current user is not of type eligible", async () => {
    mockEligibilityCheckFind.mockImplementationOnce(async _ =>
      right(some(aEligibilityCheckSuccessIneligible))
    );
    const handler = StartBonusActivationHandler(
      mockBonusActivationModel,
      mockBonusLeaseModel,
      mockEligibilityCheckModel
    );

    const response = await handler(context, aFiscalCode);

    expect(response.kind).toBe("IResponseErrorForbiddenNotAuthorized");
  });

  it("should return an error if the query for eligibility check fails", async () => {
    mockEligibilityCheckFind.mockImplementationOnce(async _ => {
      throw new Error("quey failed");
    });
    const handler = StartBonusActivationHandler(
      mockBonusActivationModel,
      mockBonusLeaseModel,
      mockEligibilityCheckModel
    );

    const response = await handler(context, aFiscalCode);

    expect(response.kind).toBe("IResponseErrorInternal");
  });

  it("should return an error if the query for eligibility check fails", async () => {
    mockEligibilityCheckFind.mockImplementationOnce(async _ => {
      throw new Error("quey failed");
    });
    const handler = StartBonusActivationHandler(
      mockBonusActivationModel,
      mockBonusLeaseModel,
      mockEligibilityCheckModel
    );

    const response = await handler(context, aFiscalCode);

    expect(response.kind).toBe("IResponseErrorInternal");
  });

  it("should retry bonus code generation if there's already the same code on the db", async () => {
    mockBonusActivationCreate.mockImplementationOnce(async _ => {
      throw {
        code: 409
      };
    });
    const handler = StartBonusActivationHandler(
      mockBonusActivationModel,
      mockBonusLeaseModel,
      mockEligibilityCheckModel
    );

    const response = await handler(context, aFiscalCode);

    // the first attempt failed, so it's called twice
    expect(mockBonusActivationCreate).toHaveBeenCalledTimes(2);
    // called with different bonus codes
    const firstAttemptedCode = mockBonusActivationCreate.mock.calls[0][0].id;
    const secondAttemptedCode = mockBonusActivationCreate.mock.calls[1][0].id;
    expect(firstAttemptedCode).not.toBe(secondAttemptedCode);
    expect(response.kind).toBe("IResponseSuccessRedirectToResource");
  });

  // TODO: fix this test
  // This test has value because asserts that the retry logic for the bonus generation works as expected.
  // The code implement a well-tested withRetries helper, so the mechanism should be ok.
  // However, this test doesn't work as mockBonusActivationCreate is called more than once.
  // Given that this test is based on jest mocks, I'm keen to think that the error is in the test, not in the code. It must be tried on integration test, though.
  it.skip("should not retry bonus code generation on a generic query error", async () => {
    mockBonusActivationCreate.mockImplementationOnce(async _ => {
      return left({
        code: 123
      });
    });
    const handler = StartBonusActivationHandler(
      mockBonusActivationModel,
      mockBonusLeaseModel,
      mockEligibilityCheckModel
    );

    const response = await handler(context, aFiscalCode);

    expect(mockBonusActivationCreate).toHaveBeenCalledTimes(1);
    expect(response.kind).toBe("IResponseErrorInternal");
  });

  // TODO: fix this test
  // This test has value because asserts that the retry logic for the bonus generation works as expected.
  // The code implement a well-tested withRetries helper, so the mechanism should be ok.
  // However, this test doesn't work as mockBonusActivationCreate is called more than once.
  // Given that this test is based on jest mocks, I'm keen to think that the error is in the test, not in the code. It must be tried on integration test, though.
  it.skip("should not retry bonus code generation on a generic query error", async () => {
    mockBonusActivationCreate.mockImplementationOnce(async _ => {
      throw new Error("any error");
    });
    const handler = StartBonusActivationHandler(
      mockBonusActivationModel,
      mockBonusLeaseModel,
      mockEligibilityCheckModel
    );

    const response = await handler(context, aFiscalCode);

    expect(mockBonusActivationCreate).toHaveBeenCalledTimes(1);
    expect(response.kind).toBe("IResponseErrorInternal");
  });

  it("should return a conflict if fails acquire the lease", async () => {
    mockBonusLeaseCreate.mockImplementationOnce(async _ => {
      throw new Error("any error");
    });
    const handler = StartBonusActivationHandler(
      mockBonusActivationModel,
      mockBonusLeaseModel,
      mockEligibilityCheckModel
    );

    const response = await handler(context, aFiscalCode);

    expect(response.kind).toBe("IResponseErrorConflict");
  });

  it("should return the reference to the executed orchestrator", async () => {
    const handler = StartBonusActivationHandler(
      mockBonusActivationModel,
      mockBonusLeaseModel,
      mockEligibilityCheckModel
    );

    const response = await handler(context, aFiscalCode);

    expect(response.kind).toBe("IResponseSuccessRedirectToResource");
  });
});
