const assert = require("node:assert/strict");
const { encodePlan, decodePlan } = require("./plan-code.js");

const planInputs = {
  currentAge: 32,
  retirementAge: 70,
  payoutYears: 20,
  desiredAnnualWithdrawal: 300000,
  ratePensionBalance: 500000,
  lifeAnnuityBalance: 0,
  ratePensionNonDeductibleBasis: 12500,
  ageSavingsBalance: 50000,
  freeFundsBalance: 250000,
  freeFundsCostBasis: 175000,
  askBalance: 150000,
  annualRatePensionContribution: 60000,
  annualLifeAnnuityContribution: 0,
  annualAgeSavingsContribution: 9900,
  annualFreeFundsContribution: 50000,
  ageSavingsContributionLimit: 9900,
  pensionTax: 0.153,
  ratePensionContributionTaxRelief: 0.4,
  pensionWithdrawalTax: 0.37,
  askTax: 0.17,
  freeFundsInventoryShare: 0.25,
  returnRate: 0.07,
  inflationRate: 0.021,
  withdrawalAfterTax: true,
  contributionsFollowInflation: false,
  redirectPensionContributionsToFreeFunds: true,
};

function encodedPayload(payload) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function assertInvalid(code, pattern) {
  assert.throws(() => decodePlan(code), pattern);
}

const code = encodePlan({
  ...planInputs,
  optimizationLocks: { annualFreeFundsContribution: true },
  optimizationSecondaryObjective: "largest-reserve",
});

assert.match(code, /^[A-Za-z0-9_-]+$/);
assert.equal(code.includes("="), false);
assert.deepEqual(decodePlan(code), planInputs);
assert.deepEqual(decodePlan(`  ${code}\n`), planInputs);

const decodedPayload = JSON.parse(Buffer.from(code, "base64url").toString("utf8"));
assert.deepEqual(Object.keys(decodedPayload).sort(), ["calculator", "inputs"]);
assert.equal("optimizationLocks" in decodedPayload.inputs, false);
assert.equal("optimizationSecondaryObjective" in decodedPayload.inputs, false);

assertInvalid("", /Indsæt en kode/);
assertInvalid("ikke base64!", /ugyldigt format/);
assertInvalid(Buffer.from("ikke json", "utf8").toString("base64url"), /ugyldigt format/);
assertInvalid(
  encodedPayload({ calculator: "realkredit", inputs: planInputs }),
  /ikke oprettet af FIRE-beregneren/,
);
assertInvalid(
  encodedPayload({ calculator: "fire", inputs: { ...planInputs, currentAge: "32" } }),
  /ugyldige FIRE-input/,
);

const missingInput = { ...planInputs };
delete missingInput.inflationRate;
assertInvalid(
  encodedPayload({ calculator: "fire", inputs: missingInput }),
  /ikke alle FIRE-input/,
);
assertInvalid(
  encodedPayload({
    calculator: "fire",
    inputs: { ...planInputs, unexpectedInput: 1 },
  }),
  /ikke alle FIRE-input/,
);
assertInvalid(
  encodedPayload({ calculator: "fire", inputs: planInputs, version: 1 }),
  /ugyldigt format/,
);

assert.throws(
  () => encodePlan({ ...planInputs, returnRate: Number.NaN }),
  /ugyldige FIRE-input/,
);

console.log("Plan code tests passed");
