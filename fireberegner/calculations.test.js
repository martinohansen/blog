const assert = require("node:assert/strict");
const {
  annualEndWithdrawalFromBalance,
  annualWithdrawalFromBalance,
  calculateFire,
  getAge,
  presentValueOfWithdrawals,
} = require("./calculations.js");

const asOfDate = new Date(2026, 7, 4);

assert.equal(getAge(new Date(1994, 3, 27), asOfDate), 32);
assert.equal(getAge(new Date(1994, 8, 27), asOfDate), 31);
assert.equal(presentValueOfWithdrawals(0, 10, 100000), 1000000);
assert.equal(annualWithdrawalFromBalance(1000000, 0, 10), 100000);
assert.equal(annualEndWithdrawalFromBalance(1000000, 0, 10), 100000);

const result = calculateFire(
  {
    birthDate: new Date(1994, 3, 27),
    retirementAge: 70,
    payoutYears: 15,
    desiredAnnualWithdrawal: 750000,
    ratePensionBalance: 730000,
    ageSavingsBalance: 45000,
    freeFundsBalance: 140000,
    askBalance: 200000,
    annualRatePensionContribution: 68700,
    annualAgeSavingsContribution: 9900,
    annualFreeFundsContribution: 60000,
    pensionTax: 0.153,
    askTax: 0.17,
    freeFundsTax: 0.27,
    returnRate: 0.085,
    inflationRate: 0.025,
  },
  asOfDate,
);

assert.equal(result.currentAge, 32);
assert.ok(Math.abs(result.realPensionReturn - 0.04584878) < 0.000001);
assert.ok(Math.abs(result.requiredAtRetirement - 8007862.02) < 1);
assert.ok(result.pensionStopRow);
assert.ok(result.fireRow);
assert.ok(result.fireRow.age <= 70);
assert.equal(result.rows[0].ratePension, 730000);
assert.equal(result.rows[1].ratePension, 730000 * (1 + result.realPensionReturn) + 68700);
assert.equal(result.planRows[0].phase, "Opsparing");
assert.equal(result.planRows.find((row) => row.age === result.fireRow.age).phase, "FIRE");
assert.equal(result.planRows.find((row) => row.age === 70).phase, "Pension");
assert.equal(result.finalRow.phase, "Slut");
assert.equal(result.finalRow.age, 85);
assert.equal(result.finalRow.withdrawal, 0);
assert.ok(result.planRows.some((row) => row.phase === "FIRE" && row.withdrawal > 0));
assert.ok(result.planRows.some((row) => row.phase === "Pension" && row.withdrawal > 0));
assert.equal(
  result.planRows.find((row) => row.age === result.pensionStopRow.age).contribution,
  60000,
);

const fixedNominalContributions = calculateFire(
  {
    birthDate: new Date(1994, 3, 27),
    retirementAge: 70,
    payoutYears: 15,
    desiredAnnualWithdrawal: 750000,
    ratePensionBalance: 730000,
    ageSavingsBalance: 45000,
    freeFundsBalance: 140000,
    askBalance: 200000,
    annualRatePensionContribution: 68700,
    annualAgeSavingsContribution: 9900,
    annualFreeFundsContribution: 60000,
    pensionTax: 0.153,
    askTax: 0.17,
    freeFundsTax: 0.27,
    returnRate: 0.085,
    inflationRate: 0.025,
    contributionsFollowInflation: false,
  },
  asOfDate,
);

assert.equal(fixedNominalContributions.planRows[0].contribution, 138600);
assert.ok(
  Math.abs(
    fixedNominalContributions.planRows[1].contribution - 138600 / 1.025,
  ) < 0.01,
);
assert.ok(
  fixedNominalContributions.rows[2].ratePension < result.rows[2].ratePension,
);

const standardInputs = {
  birthDate: new Date(1994, 3, 27),
  retirementAge: 70,
  payoutYears: 15,
  desiredAnnualWithdrawal: 300000,
  ratePensionBalance: 500000,
  ageSavingsBalance: 50000,
  freeFundsBalance: 250000,
  askBalance: 150000,
  annualRatePensionContribution: 60000,
  annualAgeSavingsContribution: 9400,
  annualFreeFundsContribution: 60000,
  pensionTax: 0.153,
  askTax: 0.17,
  freeFundsTax: 0.27,
  returnRate: 0.07,
  inflationRate: 0.02,
};

assert.throws(
  () => calculateFire({ ...standardInputs, retirementAge: 70.5 }, asOfDate),
  /Pensionsalderen skal være et helt tal/,
);
assert.throws(
  () => calculateFire({ ...standardInputs, payoutYears: 15.25 }, asOfDate),
  /positivt antal hele år/,
);
assert.throws(
  () => calculateFire({ ...standardInputs, freeFundsTax: 3 }, asOfDate),
  /Skattesatser skal være mellem 0 og 100 %/,
);
assert.throws(
  () => calculateFire({ ...standardInputs, pensionTax: 3 }, asOfDate),
  /Skattesatser skal være mellem 0 og 100 %/,
);

const zeroAssets = calculateFire(
  {
    ...standardInputs,
    retirementAge: 35,
    payoutYears: 2,
    desiredAnnualWithdrawal: 100,
    ratePensionBalance: 0,
    ageSavingsBalance: 0,
    freeFundsBalance: 0,
    askBalance: 0,
    annualRatePensionContribution: 0,
    annualAgeSavingsContribution: 0,
    annualFreeFundsContribution: 0,
    returnRate: 0,
    inflationRate: 0,
  },
  asOfDate,
);
assert.ok(
  zeroAssets.planRows
    .filter((row) => row.phase === "Pension")
    .every((row) => row.withdrawal === 0 && row.withdrawalShortfall),
);

const exactDepletion = calculateFire(
  {
    ...standardInputs,
    birthDate: new Date(1996, 7, 4),
    retirementAge: 35,
    payoutYears: 2,
    desiredAnnualWithdrawal: 100,
    ratePensionBalance: 200,
    ageSavingsBalance: 0,
    freeFundsBalance: 500,
    askBalance: 0,
    annualRatePensionContribution: 0,
    annualAgeSavingsContribution: 0,
    annualFreeFundsContribution: 0,
    pensionTax: 0,
    askTax: 0,
    freeFundsTax: 0,
    returnRate: 0,
    inflationRate: 0,
  },
  asOfDate,
);
assert.equal(exactDepletion.fireRow.age, 30);
assert.equal(
  exactDepletion.planRows.filter((row) => row.phase === "FIRE").length,
  5,
);
assert.equal(
  exactDepletion.planRows.filter((row) => row.phase === "Pension").length,
  2,
);
assert.equal(exactDepletion.finalRow.age, 37);
assert.equal(exactDepletion.finalRow.totalBalance, 0);

console.log("FIRE-beregnerens beregningstest bestod.");
