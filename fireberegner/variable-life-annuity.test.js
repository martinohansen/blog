const assert = require("node:assert/strict");
const {
  calculateFire, optimizeAnnualContributionsAdaptive, RETURN_STRATEGY,
} = require("./calculations.js");

const date = new Date(2026, 8, 5);
const inputs = {
  currentAge: 64,
  retirementAge: 65,
  payoutYears: 20,
  desiredAnnualWithdrawal: 70000,
  ratePensionBalance: 0,
  lifeAnnuityBalance: 1000000,
  ageSavingsBalance: 50000,
  freeFundsBalance: 0,
  freeFundsCostBasis: 0,
  askBalance: 0,
  annualRatePensionContribution: 0,
  annualLifeAnnuityContribution: 0,
  annualAgeSavingsContribution: 0,
  annualFreeFundsContribution: 0,
  pensionTax: 0.153,
  pensionWithdrawalTax: 0.37,
  askTax: 0.17,
  returnRate: 0.07,
  inflationRate: 0.02,
  lifeAnnuityPayoutRate: 0.0322,
  withdrawalAfterTax: false,
};

function close(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 0.01, `${actual} != ${expected}`);
}

// Previously rejected at age 65 because level capacity limited the age
// savings withdrawal to 3,631 kr. instead of the required 5,605 kr.
const funded = calculateFire(inputs, date);
assert.equal(funded.isFullyFunded, true);
assert.equal(funded.fireRow.age, 65);
assert.equal(funded.firstShortfallDate, null);
const rows = funded.planRows.filter(row => row.phase === "Pension");
let ageSavings = rows[0].ageSavings;
for (const row of rows) {
  close(row.withdrawal, Math.max(inputs.desiredAnnualWithdrawal,
    row.lifeAnnuityWithdrawal));
  ageSavings = (ageSavings - Math.max(0,
    inputs.desiredAnnualWithdrawal - row.lifeAnnuityWithdrawal)) *
    (1 + inputs.returnRate * (1 - inputs.pensionTax)) /
    (1 + inputs.inflationRate);
  assert.ok(ageSavings >= 0);
}
close(funded.finalRow.ageSavings, ageSavings);
assert.ok(funded.finalRow.lifeAnnuityDepotValue > 0);

// Allowing a larger first withdrawal must not imply that later years work.
const insufficient = calculateFire({ ...inputs, ageSavingsBalance: 20000 }, date);
close(insufficient.planRows.find(row => row.phase === "Pension").withdrawal, 70000);
assert.equal(insufficient.isFullyFunded, false);
assert.equal(insufficient.fireRow, null);
assert.ok(insufficient.firstShortfallDate > rows[0].date);

// A rate pension keeps its payment limit; its balance is not a flexible fund.
const rateOnly = calculateFire({
  ...inputs, ageSavingsBalance: 0, ratePensionBalance: 50000,
}, date);
assert.equal(rateOnly.isFullyFunded, false);
assert.ok(rateOnly.planRows.find(row => row.phase === "Pension").withdrawal < 70000);

// Check all flexible account types with net withdrawals and actual tax.
for (const account of [
  { ageSavingsBalance: 50000 },
  { askBalance: 50000 },
  { freeFundsBalance: 50000, freeFundsCostBasis: 50000, freeFundsInventoryShare: 0 },
  { freeFundsBalance: 50000, freeFundsCostBasis: 50000, freeFundsInventoryShare: 1 },
]) {
  const result = calculateFire({
    ...inputs, ageSavingsBalance: 0, ...account,
    withdrawalAfterTax: true, desiredAnnualWithdrawal: 45000,
  }, date);
  assert.equal(result.isFullyFunded, true, JSON.stringify(account));
  for (const row of result.planRows.filter(row => row.phase === "Pension")) {
    close(row.netWithdrawal, Math.max(45000,
      row.lifeAnnuityWithdrawal * (1 - inputs.pensionWithdrawalTax)));
    close(row.withdrawal - row.totalWithdrawalTax, row.netWithdrawal);
  }
}

const declining = calculateFire({
  ...inputs, returnStrategy: RETURN_STRATEGY.declining,
  defensiveReturnRate: 0.02, returnDeclineYears: 1,
}, date);
assert.equal(declining.isFullyFunded, false);

const gainsAboveThreshold = calculateFire({
  ...inputs, ageSavingsBalance: 0, freeFundsBalance: 500000,
  freeFundsCostBasis: 0, withdrawalAfterTax: true,
  desiredAnnualWithdrawal: 150000,
}, date).planRows.find(row => row.phase === "Pension");
assert.ok(gainsAboveThreshold.realizedFreeFundsGain > 79400);
close(gainsAboveThreshold.netWithdrawal, 150000);
close(gainsAboveThreshold.withdrawalTax,
  79400 * 0.27 + (gainsAboveThreshold.realizedFreeFundsGain - 79400) * 0.42);

const optimized = optimizeAnnualContributionsAdaptive(inputs, date);
assert.equal(optimized.recommended.fireAge, 65);
close(optimized.recommended.annualNetCost, 0);
console.log("Variable life annuity withdrawal tests passed");
