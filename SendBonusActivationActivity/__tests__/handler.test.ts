import { isRight, right } from "fp-ts/lib/Either";
import * as t from "io-ts";
import { context } from "../../__mocks__/durable-functions";
import {
  aBonusVacanzaBase,
  aBonusVacanzaInvalidRequestError,
  aBonusVacanzaTransientError
} from "../../__mocks__/mocks";
import { ADEClientInstance } from "../../clients/adeClient";
import {
  ADEServiceFailure,
  InvalidInputFailure,
  SendBonusActivationFailure,
  SendBonusActivationHandler,
  SendBonusActivationSuccess
} from "../handler";

describe("SendBonusActivationHandler", () => {
  it("should handle an invalid input", async () => {
    const mockADEClient = {
      richiestaBonus: jest.fn()
    } as ADEClientInstance;

    const handler = SendBonusActivationHandler(mockADEClient);

    const result = await handler(context, { foo: "bar" });

    expect(isRight(InvalidInputFailure.decode(result))).toBeTruthy();
  });

  it("should handle a success response", async () => {
    const mockADEClient = {
      richiestaBonus: jest.fn(() =>
        Promise.resolve(
          right({
            headers: {},
            status: 200,
            value: { result: aBonusVacanzaBase }
          })
        )
      )
    } as ADEClientInstance;

    const handler = SendBonusActivationHandler(mockADEClient);

    const result = await handler(context, aBonusVacanzaBase);

    expect(isRight(SendBonusActivationSuccess.decode(result))).toBeTruthy();
  });

  it("should handle an invalid request response", async () => {
    const mockADEClient = {
      richiestaBonus: jest.fn(() =>
        Promise.resolve(
          right({
            headers: {},
            status: 400,
            value: aBonusVacanzaInvalidRequestError
          })
        )
      )
    } as ADEClientInstance;

    const handler = SendBonusActivationHandler(mockADEClient);

    const result = await handler(context, aBonusVacanzaBase);

    SendBonusActivationFailure.decode(result)
      // tslint:disable-next-line: no-duplicate-string
      .orElse(_ => fail("Cannot decode result"))
      .map(value => {
        expect(value.reason).toEqual(aBonusVacanzaInvalidRequestError);
      });
  });

  it("should handle an unhandle error response payload", async () => {
    const mockADEClient = ({
      richiestaBonus: jest.fn(() =>
        Promise.resolve(
          right({
            headers: {},
            status: 123,
            value: { foo: "bar" }
          })
        )
      )
    } as unknown) as ADEClientInstance;

    const handler = SendBonusActivationHandler(mockADEClient);

    const result = await handler(context, aBonusVacanzaBase);
    SendBonusActivationFailure.decode(result)
      .orElse(_ => fail("Cannot decode result"))
      .map(value => {
        expect(value.reason).toEqual(
          JSON.stringify({
            headers: {},
            status: 123,
            value: { foo: "bar" }
          })
        );
      });
  });

  it("should handle a deconding error", async () => {
    const aFailingDecode = t.string.decode(10);
    const mockADEClient = ({
      richiestaBonus: jest.fn(() => Promise.resolve(aFailingDecode))
    } as unknown) as ADEClientInstance;

    const handler = SendBonusActivationHandler(mockADEClient);

    const result = await handler(context, aBonusVacanzaBase);
    SendBonusActivationFailure.decode(result)
      .orElse(_ => fail("Cannot decode result"))
      .map(value => {
        expect(value.reason).toEqual(expect.any(String));
      });
  });

  it("should throw on unhandled rejection", async () => {
    const mockADEClient = ({
      richiestaBonus: jest.fn(() => Promise.reject("error message"))
    } as unknown) as ADEClientInstance;

    const handler = SendBonusActivationHandler(mockADEClient);

    try {
      const _ = await handler(context, aBonusVacanzaBase);
      fail("Should have been thrown");
    } catch (err) {
      expect(ADEServiceFailure.decode(err).isRight()).toBe(true);
    }
  });

  it("should throw on transient error", async () => {
    const mockADEClient = ({
      richiestaBonus: jest.fn(() =>
        Promise.resolve(
          right({
            headers: {},
            status: 500,
            value: aBonusVacanzaTransientError
          })
        )
      )
    } as unknown) as ADEClientInstance;

    const handler = SendBonusActivationHandler(mockADEClient);

    try {
      const _ = await handler(context, aBonusVacanzaBase);
      fail("Should have been thrown");
    } catch (err) {
      expect(err).toEqual({
        headers: {},
        status: 500,
        value: aBonusVacanzaTransientError
      });
    }
  });
});
