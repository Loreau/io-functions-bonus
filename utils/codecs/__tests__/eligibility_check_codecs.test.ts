// tslint:disable: no-duplicate-string

import { isLeft, isRight } from "fp-ts/lib/Either";
import { EligibilityCheck as EligibilityCheckApi } from "../../../generated/definitions/EligibilityCheck";

import {
  EligibilityCheckFailure,
  ErrorEnum as EligibilityCheckFailureErrorEnum
} from "../../../generated/models/EligibilityCheckFailure";
import {
  EligibilityCheckSuccessEligible,
  StatusEnum as EligibilityCheckSuccessEligibleStatusEnum
} from "../../../generated/models/EligibilityCheckSuccessEligible";
import {
  EligibilityCheckSuccessIneligible,
  StatusEnum as EligibilityCheckSuccessIneligibleStatusEnum
} from "../../../generated/models/EligibilityCheckSuccessIneligible";

import {
  EligibilityCheckFailure as EligibilityCheckFailureApi,
  ErrorEnum as EligibilityCheckFailureErrorEnumApi
} from "../../../generated/definitions/EligibilityCheckFailure";
import {
  EligibilityCheckSuccessEligible as EligibilityCheckSuccessEligibleApi,
  StatusEnum as EligibilityCheckSuccessEligibleEnumApi
} from "../../../generated/definitions/EligibilityCheckSuccessEligible";
import {
  EligibilityCheckSuccessIneligible as EligibilityCheckSuccessIneligibleApi,
  StatusEnum as EligibilityCheckSuccessIneligibleEnumApi
} from "../../../generated/definitions/EligibilityCheckSuccessIneligible";
import { EligibilityCheck } from "../../../generated/models/EligibilityCheck";
import {
  ApiEligibilityCheckFromModel,
  ModelEligibilityCheckFromApi
} from "../eligibility_check_codecs";

import { FiscalCode, NonEmptyString } from "italia-ts-commons/lib/strings";
import { MaxBonusAmount } from "../../../generated/definitions/MaxBonusAmount";
import { MaxBonusTaxBenefit } from "../../../generated/definitions/MaxBonusTaxBenefit";

const aFiscalCode = "AAABBB80A01C123D" as FiscalCode;

const anElibigleApiObject: EligibilityCheckSuccessEligibleApi = {
  family_members: [
    {
      fiscal_code: aFiscalCode,
      name: "Mario" as NonEmptyString,
      surname: "Rossi" as NonEmptyString
    }
  ],
  id: (aFiscalCode as unknown) as NonEmptyString,
  max_amount: 200 as MaxBonusAmount,
  max_tax_benefit: 50 as MaxBonusTaxBenefit,
  status: EligibilityCheckSuccessEligibleEnumApi.ELIGIBLE,
  valid_before: new Date()
};

const anInelibigleApiObject: EligibilityCheckSuccessIneligibleApi = {
  id: (aFiscalCode as unknown) as NonEmptyString,
  status: EligibilityCheckSuccessIneligibleEnumApi.INELIGIBLE
};

const aFailureApiObject: EligibilityCheckFailureApi = {
  error: EligibilityCheckFailureErrorEnumApi.INTERNAL_ERROR,
  error_description: "lorem ipsum",
  id: (aFiscalCode as unknown) as NonEmptyString
};

const anEligibleDomainObject: EligibilityCheckSuccessEligible = {
  familyMembers: [
    {
      fiscalCode: aFiscalCode,
      name: "Mario" as NonEmptyString,
      surname: "Rossi" as NonEmptyString
    }
  ],
  id: (aFiscalCode as unknown) as NonEmptyString,
  maxAmount: 200 as MaxBonusAmount,
  maxTaxBenefit: 50 as MaxBonusTaxBenefit,
  status: EligibilityCheckSuccessEligibleStatusEnum.ELIGIBLE,
  validBefore: new Date()
};

const anIneligibleDomainObject: EligibilityCheckSuccessIneligible = {
  id: (aFiscalCode as unknown) as NonEmptyString,
  status: EligibilityCheckSuccessIneligibleStatusEnum.INELIGIBLE
};

const aFailureDomainObject: EligibilityCheckFailure = {
  error: EligibilityCheckFailureErrorEnum.INTERNAL_ERROR,
  errorDescription: "lorem ipsum",
  id: (aFiscalCode as unknown) as NonEmptyString
};

describe("ModelEligibilityCheckFromApi", () => {
  it("should not decode an invalid api object", () => {
    const apiObject = {};
    // @ts-ignore needed to test an unrepresentable type assignment
    const result = ModelEligibilityCheckFromApi.decode(apiObject);
    expect(isLeft(result)).toBeTruthy();
  });

  it.each`
    name                       | apiObject
    ${"failure api object"}    | ${aFailureApiObject}
    ${"eligible api object"}   | ${anElibigleApiObject}
    ${"ineligible api object"} | ${anInelibigleApiObject}
  `("should decode $name", ({ apiObject }) => {
    const result = ModelEligibilityCheckFromApi.decode(apiObject);
    if (isRight(result)) {
      expect(EligibilityCheck.is(result.value)).toBeTruthy();
    } else {
      fail("Valid api object must be decoded");
    }
  });

  it.each`
    name                       | apiObject
    ${"failure api object"}    | ${aFailureApiObject}
    ${"eligible api object"}   | ${anElibigleApiObject}
    ${"ineligible api object"} | ${anInelibigleApiObject}
  `("should reverse on $name", ({ apiObject }) => {
    ModelEligibilityCheckFromApi.decode(apiObject)
      .chain(obj => ApiEligibilityCheckFromModel.decode(obj))
      .fold(
        _ => {
          fail("Valid api object must be decoded");
        },
        value => {
          expect(value).toEqual(apiObject);
        }
      );
  });
});

describe("ApiEligibilityCheckFromModel", () => {
  it("should not decode an invalid domain object", () => {
    const invalidDomainObject = {};
    // @ts-ignore needed to test an unrepresentable type assignment
    const result = ApiEligibilityCheckFromModel.decode(invalidDomainObject);
    expect(isLeft(result)).toBeTruthy();
  });

  it.each`
    name                          | domainObject
    ${"failure domain object"}    | ${aFailureDomainObject}
    ${"eligible domain object"}   | ${anEligibleDomainObject}
    ${"ineligible domain object"} | ${anIneligibleDomainObject}
  `("should decode $name", ({ domainObject }) => {
    const result = ApiEligibilityCheckFromModel.decode(domainObject);
    if (isRight(result)) {
      expect(EligibilityCheckApi.is(result.value)).toBeTruthy();
    } else {
      fail("Valid domain object must be decoded");
    }
  });

  it.each`
    name                          | domainObject
    ${"failure domain object"}    | ${aFailureDomainObject}
    ${"eligible domain object"}   | ${anEligibleDomainObject}
    ${"ineligible domain object"} | ${anIneligibleDomainObject}
  `("should reverse on $name", ({ domainObject }) => {
    ApiEligibilityCheckFromModel.decode(domainObject)
      .chain(obj => ModelEligibilityCheckFromApi.decode(obj))
      .fold(
        _ => {
          fail("Valid domain object must be decoded");
        },
        value => {
          expect(value).toEqual(domainObject);
        }
      );
  });
});