const assert = require("node:assert/strict");
const { calculateFire } = require("./calculations.js");

const inputs = {
  currentAge: 64,
  retirementAge: 65,
  payoutYears: 30,
  desiredAnnualWithdrawal: 0,
  ratePensionBalance: 0,
  lifeAnnuityBalance: 1000000,
  ageSavingsBalance: 0,
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
  returnRate: 0.0322 / 0.847,
  lifeAnnuityPayoutRate: 0.0322,
  inflationRate: 0,
  withdrawalAfterTax: false,
};
const date = new Date(2025, 8, 5);
const result = calculateFire(inputs, date);
const rows = result.planRows.filter(row => row.phase === "Pension");
const [first, second] = rows;
function close(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 0.01, `${actual} != ${expected}`);
}

close(result.planRows[0].lifeAnnuityDepotValue, inputs.lifeAnnuityBalance);
close(first.lifeAnnuityDepotValue, result.lifeAnnuityBalanceAtRetirement);
close(first.lifeAnnuityDepotValue, 1032200);
// 65-year-old unisex cohort in 2026, using the published 2024 benchmark.
const survival = (
  Math.exp(-0.006292632011 * (1 - 0.01865843094) ** 2) +
  Math.exp(-0.009993137171 * (1 - 0.01838795131) ** 2)
) / 2;
close(second.lifeAnnuityDepotValue,
  (first.lifeAnnuityDepotValue - first.lifeAnnuityWithdrawal) *
    1.0322 / survival);
for (const row of rows) {
  assert.ok(row.lifeAnnuityDepotValue > 0);
  close(row.lifeAnnuityWithdrawal, result.lifeAnnuityAnnualIncome);
  close(row.totalDepotValue, row.lifeAnnuityDepotValue);
  close(row.averageReturnRate, inputs.returnRate);
  // The displayed reserve cannot be withdrawn a second time.
  close(row.totalBalance, 0);
  close(row.lifeAnnuity, 0);
}
assert.ok(result.finalRow.lifeAnnuityDepotValue > 0);
close(result.finalReserveAfterTax, 0);
close(result.finalRow.totalBalance, 0);

const inflated = calculateFire({ ...inputs, inflationRate: 0.02 }, date);
inflated.planRows.forEach((row, year) => {
  close(row.lifeAnnuityDepotValue * 1.02 ** year,
    result.planRows[year].lifeAnnuityDepotValue);
});
console.log("Life annuity depot tests passed");
