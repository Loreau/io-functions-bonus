/**
 * Map API objects to domain objects
 */

import { rights } from "fp-ts/lib/Array";
import { Either, isLeft } from "fp-ts/lib/Either";
import * as NonEmptyArray from "fp-ts/lib/NonEmptyArray";
import { isNone } from "fp-ts/lib/Option";
import * as t from "io-ts";
import { readableReport } from "italia-ts-commons/lib/reporters";
import { FiscalCode, NonEmptyString } from "italia-ts-commons/lib/strings";
import { BonusVacanzaBase as ApiBonusVacanzaBase } from "../generated/ade/BonusVacanzaBase";
import { BonusActivation as ApiBonusActivation } from "../generated/definitions/BonusActivation";
import { BonusActivationItem } from "../generated/definitions/BonusActivationItem";
import {
  ConsultazioneSogliaIndicatoreResponse,
  EsitoEnum
} from "../generated/definitions/ConsultazioneSogliaIndicatoreResponse";
import { EligibilityCheck as ApiEligibilityCheck } from "../generated/definitions/EligibilityCheck";
import {
  EligibilityCheckFailure,
  ErrorEnum
} from "../generated/definitions/EligibilityCheckFailure";
import { StatusEnum as ErrorStatusEnum } from "../generated/definitions/EligibilityCheckFailure";
import {
  EligibilityCheckSuccessEligible,
  StatusEnum as EligibleStatus
} from "../generated/definitions/EligibilityCheckSuccessEligible";
import {
  EligibilityCheckSuccessIneligible,
  StatusEnum as IneligibleStatus
} from "../generated/definitions/EligibilityCheckSuccessIneligible";
import { FamilyMember } from "../generated/definitions/FamilyMember";
import { FamilyMembers } from "../generated/definitions/FamilyMembers";
import { MaxBonusAmount } from "../generated/definitions/MaxBonusAmount";
import { MaxBonusAmount150 } from "../generated/definitions/MaxBonusAmount150";
import { MaxBonusAmount250 } from "../generated/definitions/MaxBonusAmount250";
import { MaxBonusAmount500 } from "../generated/definitions/MaxBonusAmount500";
import { SiNoTypeEnum } from "../generated/definitions/SiNoType";
import { Timestamp } from "../generated/definitions/Timestamp";
import { BonusActivation } from "../generated/models/BonusActivation";
import { EligibilityCheck } from "../generated/models/EligibilityCheck";
import { FamilyMemberCount } from "../generated/models/FamilyMemberCount";
import { UserBonus } from "../models/user_bonus";
import { renameObjectKeys } from "./rename_keys";
import { camelCaseToSnakeCase, snakeCaseToCamelCase } from "./strings";

/**
 * Maps EligibilityCheck API object into an EligibilityCheck domain object
 */
export const toModelEligibilityCheck = (
  apiObj: ApiEligibilityCheck
): Either<t.Errors, EligibilityCheck> => {
  const camelCasedUntypedObj = renameObjectKeys(apiObj, k =>
    snakeCaseToCamelCase(k)
  );
  return EligibilityCheck.decode(camelCasedUntypedObj);
};

/**
 * Maps EligibilityCheck API object into an EligibilityCheck domain object
 */
export const toApiEligibilityCheck = (
  domainObj: EligibilityCheck
): Either<t.Errors, ApiEligibilityCheck> => {
  const snakeCasedUntypedObj = renameObjectKeys(domainObj, k =>
    camelCaseToSnakeCase(k)
  );
  return ApiEligibilityCheck.decode(snakeCasedUntypedObj);
};

/**
 * Maps BonusActivation API object into an BonusActivation domain object
 */
export const toModelBonusActivation = (
  apiObj: ApiBonusActivation
): Either<t.Errors, BonusActivation> => {
  const camelCasedUntypedObj = renameObjectKeys(apiObj, k =>
    snakeCaseToCamelCase(k)
  );
  return BonusActivation.decode(camelCasedUntypedObj);
};

/**
 * Maps BonusActivation API object into an BonusActivation domain object
 */
export const toApiBonusActivation = (
  domainObj: BonusActivation
): Either<t.Errors, ApiBonusActivation> => {
  const snakeCasedUntypedObj = renameObjectKeys(domainObj, k =>
    camelCaseToSnakeCase(k)
  );
  return ApiBonusActivation.decode(snakeCasedUntypedObj);
};

/**
 * Maps BonusActivation domain object into an ADE BonusVacanzaBase API object
 */
export const toApiBonusVacanzaBase = (
  domainObject: BonusActivation
): Either<t.Errors, ApiBonusVacanzaBase> => {
  return ApiBonusVacanzaBase.decode({
    codiceBuono: domainObject.id,
    codiceFiscaleDichiarante: domainObject.applicantFiscalCode,
    dataGenerazione: domainObject.createdAt.toISOString(),
    flagDifformitaIsee: domainObject.dsuRequest.hasDiscrepancies ? 1 : 0,
    importoMassimo: domainObject.dsuRequest.maxAmount,
    nucleoFamiliare: domainObject.dsuRequest.familyMembers.map(_ => ({
      codiceFiscale: _.fiscalCode
    }))
  });
};

/**
 * Maps UserBonus domain object to BonusActivationItem API object
 */
export const toApiUserBonus = (domainObj: UserBonus): BonusActivationItem => {
  return {
    id: domainObj.bonusId,
    is_applicant: domainObj.isApplicant
  };
};

/**
 * Returns the maximum bonus amount in Euros from the total number of family
 * members.
 */
function calculateMaxBonusAmountFromFamilyMemberCount(
  familyMemberCount: FamilyMemberCount
): MaxBonusAmount {
  if (familyMemberCount > 2) {
    return MaxBonusAmount500.decode({});
  }
  if (familyMemberCount === 2) {
    return MaxBonusAmount250.decode({});
  }
  if (familyMemberCount === 1) {
    return MaxBonusAmount150.decode({});
  }
  throw new Error(
    `FATAL: family member count is not greater than 0 [${familyMemberCount}]`
  );
}

export const toEligibilityCheckFromDSU = (
  data: ConsultazioneSogliaIndicatoreResponse,
  fiscalCode: FiscalCode,
  validBefore: Timestamp
): ApiEligibilityCheck => {
  const maybeFamilyMembers = NonEmptyArray.fromArray([
    ...(data.DatiIndicatore?.Componenti || [])
  ]);

  if (isNone(maybeFamilyMembers)) {
    return EligibilityCheckFailure.encode({
      error: ErrorEnum.INTERNAL_ERROR,
      error_description: `DatiIndicatore.Componenti is empty`,
      id: (fiscalCode as unknown) as NonEmptyString,
      status: ErrorStatusEnum.FAILURE
    });
  }
  const familyMembers = maybeFamilyMembers.value;

  const validatedFamilyMemberCount = FamilyMemberCount.decode(
    familyMembers.length()
  );

  if (isLeft(validatedFamilyMemberCount)) {
    return EligibilityCheckFailure.encode({
      error: ErrorEnum.INTERNAL_ERROR,
      error_description: `Family member count is out of range [${readableReport(
        validatedFamilyMemberCount.value
      )}]`,
      id: (fiscalCode as unknown) as NonEmptyString,
      status: ErrorStatusEnum.FAILURE
    });
  }
  const familyMemberCount = validatedFamilyMemberCount.value;

  const bonusValue = calculateMaxBonusAmountFromFamilyMemberCount(
    familyMemberCount
  );

  const validFamilyMembers: FamilyMembers = data.DatiIndicatore?.Componenti
    ? rights(
        data.DatiIndicatore.Componenti.map(c =>
          FamilyMember.decode({
            fiscal_code: c.CodiceFiscale,
            name: c.Nome,
            surname: c.Cognome
          })
        )
      )
    : [];

  if (data.Esito !== EsitoEnum.OK) {
    return EligibilityCheckFailure.encode({
      error:
        data.Esito === EsitoEnum.DATI_NON_TROVATI
          ? ErrorEnum.DATA_NOT_FOUND
          : data.Esito === EsitoEnum.RICHIESTA_INVALIDA
          ? ErrorEnum.INVALID_REQUEST
          : ErrorEnum.INTERNAL_ERROR,
      error_description: data.DescrizioneErrore || "Esito value is not OK",
      id: (fiscalCode as unknown) as NonEmptyString,
      status: ErrorStatusEnum.FAILURE
    });
  }

  if (data.DatiIndicatore?.SottoSoglia === SiNoTypeEnum.SI) {
    return (EligibilityCheckSuccessEligible.encode({
      dsu_request: {
        dsu_created_at: data.DatiIndicatore.DataPresentazioneDSU,
        dsu_protocol_id: (data.DatiIndicatore.ProtocolloDSU ||
          "") as NonEmptyString,
        family_members: validFamilyMembers,
        has_discrepancies:
          data.DatiIndicatore.PresenzaDifformita === SiNoTypeEnum.SI,
        isee_type: data.DatiIndicatore.TipoIndicatore,
        max_amount: bonusValue.max_amount,
        max_tax_benefit: bonusValue.max_tax_benefit,
        // tslint:disable-next-line: no-useless-cast
        request_id: data.IdRichiesta.toString() as NonEmptyString
      },
      id: (fiscalCode as unknown) as NonEmptyString,
      status: EligibleStatus.ELIGIBLE,
      valid_before: validBefore
    }) as unknown) as EligibilityCheckSuccessEligible;
  } else {
    return EligibilityCheckSuccessIneligible.encode({
      id: (fiscalCode as unknown) as NonEmptyString,
      status: IneligibleStatus.INELIGIBLE
    });
  }
};
