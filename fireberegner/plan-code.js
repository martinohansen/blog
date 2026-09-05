(function (root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  root.FirePlanCode = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const NUMBER_FIELDS = Object.freeze([
    "currentAge",
    "retirementAge",
    "payoutYears",
    "desiredAnnualWithdrawal",
    "ratePensionBalance",
    "lifeAnnuityBalance",
    "ratePensionNonDeductibleBasis",
    "ageSavingsBalance",
    "freeFundsBalance",
    "freeFundsCostBasis",
    "askBalance",
    "annualRatePensionContribution",
    "annualLifeAnnuityContribution",
    "annualAgeSavingsContribution",
    "annualFreeFundsContribution",
    "ageSavingsContributionLimit",
    "pensionTax",
    "ratePensionContributionTaxRelief",
    "pensionWithdrawalTax",
    "askTax",
    "freeFundsInventoryShare",
    "returnRate",
    "inflationRate",
    "lifeAnnuityPayoutRate",
    "defensiveReturnRate",
    "returnDeclineYears",
    "returnRecoveryYears",
  ]);
  const STRING_FIELDS = Object.freeze(["returnStrategy"]);
  const BOOLEAN_FIELDS = Object.freeze([
    "withdrawalAfterTax",
    "contributionsFollowInflation",
    "redirectPensionContributionsToFreeFunds",
  ]);
  const INPUT_FIELDS = Object.freeze([
    ...NUMBER_FIELDS,
    ...STRING_FIELDS,
    ...BOOLEAN_FIELDS,
  ]);

  function invalidFormat() {
    return new Error("Koden har et ugyldigt format.");
  }

  function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function hasExactKeys(value, expectedKeys) {
    if (!isPlainObject(value)) {
      return false;
    }

    const keys = Object.keys(value).sort();
    const expected = [...expectedKeys].sort();
    return (
      keys.length === expected.length &&
      keys.every((key, index) => key === expected[index])
    );
  }

  function utf8Bytes(value) {
    if (typeof TextEncoder === "function") {
      return new TextEncoder().encode(value);
    }
    if (typeof Buffer !== "undefined") {
      return Uint8Array.from(Buffer.from(value, "utf8"));
    }
    throw invalidFormat();
  }

  function utf8Text(bytes) {
    if (typeof TextDecoder === "function") {
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    }
    if (typeof Buffer !== "undefined") {
      return Buffer.from(bytes).toString("utf8");
    }
    throw invalidFormat();
  }

  function bytesToBase64Url(bytes) {
    let base64;

    if (typeof btoa === "function") {
      let binary = "";
      bytes.forEach((byte) => {
        binary += String.fromCharCode(byte);
      });
      base64 = btoa(binary);
    } else if (typeof Buffer !== "undefined") {
      base64 = Buffer.from(bytes).toString("base64");
    } else {
      throw invalidFormat();
    }

    return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  function base64UrlToBytes(code) {
    if (!/^[A-Za-z0-9_-]+$/.test(code) || code.length % 4 === 1) {
      throw invalidFormat();
    }

    const padding = "=".repeat((4 - (code.length % 4)) % 4);
    const base64 = code.replace(/-/g, "+").replace(/_/g, "/") + padding;
    let bytes;

    try {
      if (typeof atob === "function") {
        const binary = atob(base64);
        bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
      } else if (typeof Buffer !== "undefined") {
        bytes = Uint8Array.from(Buffer.from(base64, "base64"));
      } else {
        throw invalidFormat();
      }
    } catch (_error) {
      throw invalidFormat();
    }

    if (bytesToBase64Url(bytes) !== code) {
      throw invalidFormat();
    }

    return bytes;
  }

  function validatedInputs(inputs) {
    if (
      isPlainObject(inputs) &&
      !Object.hasOwn(inputs, "lifeAnnuityPayoutRate")
    ) {
      inputs = { ...inputs, lifeAnnuityPayoutRate: 0.0322 };
    }
    if (!hasExactKeys(inputs, INPUT_FIELDS)) {
      throw new Error("Koden indeholder ikke alle FIRE-input.");
    }

    const invalidNumber = NUMBER_FIELDS.some(
      (field) =>
        typeof inputs[field] !== "number" || !Number.isFinite(inputs[field]),
    );
    const invalidBoolean = BOOLEAN_FIELDS.some(
      (field) => typeof inputs[field] !== "boolean",
    );
    const invalidStrategy = !["none", "declining", "riskTent"].includes(
      inputs.returnStrategy,
    );

    if (invalidNumber || invalidBoolean || invalidStrategy) {
      throw new Error("Koden indeholder ugyldige FIRE-input.");
    }

    return Object.fromEntries(
      INPUT_FIELDS.map((field) => [field, inputs[field]]),
    );
  }

  function encodePlan(inputs) {
    const selectedInputs = Object.fromEntries(
      INPUT_FIELDS.map((field) => [field, inputs?.[field]]),
    );
    const payload = {
      calculator: "fire",
      inputs: validatedInputs(selectedInputs),
    };

    return bytesToBase64Url(utf8Bytes(JSON.stringify(payload)));
  }

  function decodePlan(value) {
    const code = String(value ?? "").trim();
    let payload;

    if (!code) {
      throw new Error("Indsæt en kode, før du indlæser input.");
    }

    try {
      payload = JSON.parse(utf8Text(base64UrlToBytes(code)));
    } catch (error) {
      if (error.message.startsWith("Koden ") || error.message.startsWith("Indsæt ")) {
        throw error;
      }
      throw invalidFormat();
    }

    if (!hasExactKeys(payload, ["calculator", "inputs"])) {
      throw invalidFormat();
    }
    if (payload.calculator !== "fire") {
      throw new Error("Koden er ikke oprettet af FIRE-beregneren.");
    }

    return validatedInputs(payload.inputs);
  }

  return { encodePlan, decodePlan };
});
