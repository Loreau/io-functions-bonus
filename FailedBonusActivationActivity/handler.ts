import { Context } from "@azure/functions";
import { QueryError } from "documentdb";
import { Either, toError } from "fp-ts/lib/Either";
import { TaskEither, taskEither } from "fp-ts/lib/TaskEither";
import { fromEither, tryCatch } from "fp-ts/lib/TaskEither";
import * as t from "io-ts";
import { NonEmptyString } from "italia-ts-commons/lib/strings";
import { BonusActivationStatusEnum } from "../generated/models/BonusActivationStatus";
import { BonusActivationWithFamilyUID } from "../generated/models/BonusActivationWithFamilyUID";
import { BonusCode } from "../generated/models/BonusCode";
import { FamilyUID } from "../generated/models/FamilyUID";
import {
  BonusActivationModel,
  NewBonusActivation,
  RetrievedBonusActivation
} from "../models/bonus_activation";
import { BonusLeaseModel } from "../models/bonus_lease";
import { EligibilityCheckModel } from "../models/eligibility_check";

export const FailedBonusActivationInput = t.interface({
  bonusActivation: BonusActivationWithFamilyUID
});

export const FailedBonusActivationSuccess = t.interface({
  kind: t.literal("SUCCESS")
});
export type FailedBonusActivationSuccess = t.TypeOf<
  typeof FailedBonusActivationSuccess
>;

export const InvalidInputFailure = t.interface({
  kind: t.literal("INVALID_INPUT")
});
export type InvalidInputFailure = t.TypeOf<typeof InvalidInputFailure>;

export const UnhandledFailure = t.interface({
  kind: t.literal("UNHANDLED_FAILURE"),
  reason: t.string
});
export type UnhandledFailure = t.TypeOf<typeof UnhandledFailure>;

export const TransientFailure = t.interface({
  kind: t.literal("TRANSIENT")
});
export type TransientFailure = t.TypeOf<typeof TransientFailure>;

const FailedBonusActivationFailure = t.union(
  [InvalidInputFailure, UnhandledFailure, TransientFailure],
  "FailedBonusActivationFailure"
);
export type FailedBonusActivationFailure = t.TypeOf<
  typeof FailedBonusActivationFailure
>;

export const FailedBonusActivationResult = t.taggedUnion("kind", [
  FailedBonusActivationSuccess,
  FailedBonusActivationFailure
]);
export type FailedBonusActivationResult = t.TypeOf<
  typeof FailedBonusActivationResult
>;

type IFailedBonusActivationHandler = (
  context: Context,
  input: unknown
) => Promise<FailedBonusActivationResult>;

/**
 * Converts a Promise<Either> into a TaskEither
 * This is needed because our models return unconvenient type. Both left and rejection cases are handled as a TaskEither left
 * @param lazyPromise a lazy promise to convert
 *
 * @returns either the query result or a query failure
 */
const fromQueryEither = <R>(
  lazyPromise: () => Promise<Either<QueryError | Error, R>>
): TaskEither<Error, R> =>
  tryCatch(lazyPromise, toError).chain(errorOrResult =>
    fromEither(errorOrResult).mapLeft(toError)
  );

/**
 * Release the lock that was eventually acquired for this request. A release attempt on a lock that doesn't exist is considered successful.
 *
 * @param bonusLeaseModel an instance of BonusLeaseModel
 * @param familyMembers the family of the requesting user
 *
 * @returns either a conflict error or the unique hash id of the family
 */
const relaseLockForUserFamily = (
  bonusLeaseModel: BonusLeaseModel,
  familyUID: FamilyUID
): TaskEither<UnhandledFailure, FamilyUID> => {
  return fromQueryEither(() => bonusLeaseModel.deleteOneById(familyUID)).bimap(
    err =>
      UnhandledFailure.encode({
        kind: "UNHANDLED_FAILURE",
        reason: `Error releasing lock: ${err.message}`
      }),
    _ => familyUID
  );
};

const updateBonusAsFailed = (
  bonusActivationModel: BonusActivationModel,
  bonusActivation: BonusActivationWithFamilyUID
): TaskEither<UnhandledFailure, RetrievedBonusActivation> => {
  return fromQueryEither(() => {
    const bonusToUpdate: NewBonusActivation = {
      ...bonusActivation,
      id: bonusActivation.id as BonusCode & NonEmptyString,
      kind: "INewBonusActivation",
      status: BonusActivationStatusEnum.FAILED
    };
    return bonusActivationModel.createOrUpdate(
      bonusToUpdate,
      bonusActivation.id
    );
  }).mapLeft(err =>
    UnhandledFailure.encode({
      kind: "UNHANDLED_FAILURE",
      reason: err.message
    })
  );
};

const deleteEligibilityCheck = (
  eligibilityCheckModel: EligibilityCheckModel,
  bonusActivation: BonusActivationWithFamilyUID
): TaskEither<TransientFailure, BonusActivationWithFamilyUID> => {
  return fromQueryEither(() =>
    eligibilityCheckModel.deleteOneById(
      bonusActivation.id as BonusCode & NonEmptyString
    )
  )
    .mapLeft(_ =>
      // for now I consider this failures as transient, I'll ask a retry to the orchestrator
      TransientFailure.encode({ kind: "TRANSIENT" })
    )
    .map(_ => bonusActivation);
};

/**
 * Operations to be perfomed in case the bonus request was rejected by ADE
 *
 *
 * @returns either a success or a failure request
 * @throws when the response is considered a transient failure and thus is not considered a domain message
 */
export function FailedBonusActivationHandler(
  bonusActivationModel: BonusActivationModel,
  bonusLeaseModel: BonusLeaseModel,
  eligibilityCheckModel: EligibilityCheckModel
): IFailedBonusActivationHandler {
  return async (
    __: Context,
    input: unknown
  ): Promise<FailedBonusActivationResult> => {
    return taskEither
      .of<FailedBonusActivationFailure, void>(void 0)
      .chain(_ =>
        fromEither(FailedBonusActivationInput.decode(input))
          .mapLeft(() => InvalidInputFailure.encode({ kind: "INVALID_INPUT" }))
          .map(({ bonusActivation }) => bonusActivation)
      )
      .chain(bonusActivation =>
        deleteEligibilityCheck(eligibilityCheckModel, bonusActivation)
      )
      .chain(bonusActivation =>
        updateBonusAsFailed(bonusActivationModel, bonusActivation)
      )
      .chain(bonusActivation =>
        relaseLockForUserFamily(bonusLeaseModel, bonusActivation.familyUID)
      )
      .fold<FailedBonusActivationResult>(
        l => l,
        () => FailedBonusActivationSuccess.encode({ kind: "SUCCESS" })
      )
      .map(result => {
        if (TransientFailure.is(result)) {
          throw new Error("transient failure");
        }
        return result;
      })
      .run();
  };
}