const assert = require("node:assert/strict");
const {
  calculateFire,
  optimizeAnnualContributions,
  CONTRIBUTION_LIMITS,
} = require("./calculations.js");

const asOfDate = new Date(2026, 7, 4);

function sameDay(first, second) {
  return (
    first.getFullYear() === second.getFullYear() &&
    first.getMonth() === second.getMonth() &&
    first.getDate() === second.getDate()
  );
}

function assertClose(actual, expected, tolerance = 0.01) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${actual} differs from ${expected}`,
  );
}

function assertFiniteResult(calculation) {
  Object.values(calculation)
    .filter((value) => typeof value === "number")
    .forEach((value) => assert.ok(Number.isFinite(value)));

  calculation.planRows.forEach((row) => {
    Object.values(row)
      .filter((value) => typeof value === "number")
      .forEach((value) => assert.ok(Number.isFinite(value)));
    assert.ok(Number.isInteger(row.age));
    assert.ok(Number.isFinite(row.date.getTime()));
    assert.equal("exactAge" in row, false);
    assert.ok(row.freeFundsCostBasis >= 0);
    assert.ok(row.withdrawalTax >= 0);
    assert.ok(row.withdrawalTax <= row.freeFundsWithdrawal);
    assert.ok(row.pensionWithdrawalTax >= 0);
    assert.ok(row.totalWithdrawalTax >= 0);
    assertClose(
      row.totalWithdrawalTax,
      row.withdrawalTax + row.pensionWithdrawalTax,
    );
    assertClose(
      row.netWithdrawal,
      row.withdrawal - row.totalWithdrawalTax,
    );
  });

  assert.ok(calculation.totalFreeFundsTax >= 0);
  assert.ok(calculation.effectiveFreeFundsWithdrawalTaxRate >= 0);
  assert.ok(calculation.effectiveFreeFundsWithdrawalTaxRate <= 0.42);
}

const standardInputs = {
  currentAge: 32,
  retirementAge: 70,
  payoutYears: 15,
  desiredAnnualWithdrawal: 300000,
  ratePensionBalance: 500000,
  ageSavingsBalance: 50000,
  freeFundsBalance: 250000,
  freeFundsCostBasis: 250000,
  askBalance: 150000,
  annualRatePensionContribution: 60000,
  annualAgeSavingsContribution: 9400,
  annualFreeFundsContribution: 60000,
  pensionTax: 0.153,
  pensionWithdrawalTax: 0.37,
  askTax: 0.17,
  returnRate: 0.07,
  inflationRate: 0.02,
  withdrawalAfterTax: false,
};

const result = calculateFire(
  {
    ...standardInputs,
    desiredAnnualWithdrawal: 750000,
    ratePensionBalance: 730000,
    ageSavingsBalance: 45000,
    freeFundsBalance: 140000,
    askBalance: 200000,
    annualRatePensionContribution: 68700,
    annualAgeSavingsContribution: 9900,
    returnRate: 0.085,
    inflationRate: 0.025,
  },
  asOfDate,
);

assert.equal(result.currentAge, 32);
assert.equal(result.yearsToRetirement, 38);
assert.ok(Math.abs(result.realPensionReturn - 0.04584878) < 0.000001);
assert.ok(Number.isFinite(result.requiredAtRetirement));
assert.equal(result.pensionCoastRow.age, 45);
assert.equal(result.pensionStopRow.age, 45);
assert.equal(result.fireRow.age, 59);
assert.equal(result.isFullyFunded, true);
assert.equal(result.firstShortfallDate, null);
assert.equal(result.planRows[0].phase, "Opsparing");
assert.equal(
  result.planRows.find((row) => sameDay(row.date, result.fireRow.date)).phase,
  "FIRE",
);
assert.equal(
  result.planRows.find((row) => sameDay(row.date, result.retirementDate)).phase,
  "Pension",
);
assert.equal(result.finalRow.phase, "Slut");
assert.equal(result.finalRow.withdrawal, 0);
assert.ok(
  result.planRows.some((row) => row.phase === "FIRE" && row.withdrawal > 0),
);
assert.ok(
  result.planRows.some(
    (row) => row.phase === "Pension" && row.withdrawal > 0,
  ),
);
assertFiniteResult(result);

result.rows.forEach((milestone) => {
  const planRow = result.planRows.find((row) =>
    sameDay(row.date, milestone.date),
  );
  assert.ok(planRow);
  assertClose(planRow.ratePension, milestone.ratePension);
  assertClose(planRow.ageSavings, milestone.ageSavings);
  assertClose(planRow.freeFunds, milestone.freeFunds);
  assertClose(planRow.freeFundsCostBasis, milestone.freeFundsCostBasis);
  assertClose(planRow.ask, milestone.ask);
});

result.planRows.forEach((row, index) => {
  assert.equal(row.age, result.currentAge + index);
  assert.equal(row.date.getMonth(), asOfDate.getMonth());
  assert.equal(row.date.getDate(), asOfDate.getDate());
});

const inflationAdjustedContributions = calculateFire(standardInputs, asOfDate);
const fixedNominalContributions = calculateFire(
  { ...standardInputs, contributionsFollowInflation: false },
  asOfDate,
);
assertClose(
  inflationAdjustedContributions.planRows[1].contribution,
  129400,
);
assertClose(
  fixedNominalContributions.planRows[1].contribution,
  129400 / 1.02,
);
assert.ok(
  fixedNominalContributions.planRows[1].contribution <
    inflationAdjustedContributions.planRows[1].contribution,
);

assert.throws(
  () => calculateFire({ ...standardInputs, currentAge: 32.5 }, asOfDate),
  /nuværende alder skal være et helt tal/,
);
assert.throws(
  () => calculateFire({ ...standardInputs, retirementAge: 70.5 }, asOfDate),
  /Pensionsalderen skal være et helt tal/,
);
assert.throws(
  () => calculateFire({ ...standardInputs, retirementAge: 32 }, asOfDate),
  /højere end din nuværende alder/,
);
assert.throws(
  () => calculateFire({ ...standardInputs, payoutYears: 15.25 }, asOfDate),
  /positivt antal hele år/,
);
assert.throws(
  () => calculateFire({ ...standardInputs, payoutYears: 9 }, asOfDate),
  /Ratepension skal udbetales over mellem 10 og 30 hele år/,
);
assert.throws(
  () => calculateFire({ ...standardInputs, payoutYears: 31 }, asOfDate),
  /Ratepension skal udbetales over mellem 10 og 30 hele år/,
);
assert.throws(
  () => calculateFire({ ...standardInputs, freeFundsCostBasis: -1 }, asOfDate),
  /Beløb skal være 0 eller højere/,
);
assert.throws(
  () =>
    calculateFire({ ...standardInputs, pensionWithdrawalTax: 1.01 }, asOfDate),
  /Skattesatser skal være mellem 0 og 100 %/,
);
assert.throws(
  () =>
    calculateFire(
      { ...standardInputs, ratePensionContributionTaxRelief: 1.01 },
      asOfDate,
    ),
  /Skattesatser skal være mellem 0 og 100 %/,
);
assert.throws(
  () =>
    calculateFire(
      { ...standardInputs, ageSavingsContributionLimit: 12345 },
      asOfDate,
    ),
  /gældende 2026-loft/,
);

const lowAgeSavingsLimit = calculateFire(
  {
    ...standardInputs,
    annualRatePensionContribution: 68701,
    annualAgeSavingsContribution: 10000,
  },
  asOfDate,
);
const highAgeSavingsLimit = calculateFire(
  {
    ...standardInputs,
    annualAgeSavingsContribution: 60000,
    ageSavingsContributionLimit: CONTRIBUTION_LIMITS.ageSavingsHigh,
  },
  asOfDate,
);
assert.equal(
  lowAgeSavingsLimit.ageSavingsContributionLimit,
  CONTRIBUTION_LIMITS.ageSavings,
);
assert.equal(lowAgeSavingsLimit.ageSavingsContributionLimitExceeded, true);
assert.equal(
  lowAgeSavingsLimit.ratePensionContributionLimit,
  CONTRIBUTION_LIMITS.ratePension,
);
assert.equal(lowAgeSavingsLimit.ratePensionContributionLimitExceeded, true);
assert.equal(
  highAgeSavingsLimit.ageSavingsContributionLimit,
  CONTRIBUTION_LIMITS.ageSavingsHigh,
);
assert.equal(highAgeSavingsLimit.ageSavingsContributionLimitExceeded, false);
assert.equal(highAgeSavingsLimit.ratePensionContributionLimitExceeded, false);

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
assert.equal(zeroAssets.fireRow, null);
assert.equal(zeroAssets.isFullyFunded, false);
assert.ok(sameDay(zeroAssets.firstShortfallDate, zeroAssets.retirementDate));
assert.ok(
  zeroAssets.planRows
    .filter((row) => row.phase === "Pension")
    .every((row) => row.withdrawal === 0 && row.withdrawalShortfall),
);

const exactDepletion = calculateFire(
  {
    ...standardInputs,
    currentAge: 30,
    retirementAge: 35,
    payoutYears: 2,
    desiredAnnualWithdrawal: 100,
    ratePensionBalance: 0,
    ageSavingsBalance: 200,
    freeFundsBalance: 500,
    askBalance: 0,
    annualRatePensionContribution: 0,
    annualAgeSavingsContribution: 0,
    annualFreeFundsContribution: 0,
    pensionTax: 0,
    askTax: 0,
    returnRate: 0,
    inflationRate: 0,
  },
  asOfDate,
);
assert.ok(sameDay(exactDepletion.fireRow.date, asOfDate));
assert.ok(
  sameDay(exactDepletion.pensionCoastRow.date, exactDepletion.fireRow.date),
);
assert.ok(
  sameDay(exactDepletion.pensionStopRow.date, exactDepletion.fireRow.date),
);
assert.equal(exactDepletion.isFullyFunded, true);
assertClose(exactDepletion.finalRow.totalBalance, 0, 1e-7);

const leapCalculation = calculateFire(
  {
    ...standardInputs,
    currentAge: 30,
    retirementAge: 31,
    payoutYears: 2,
    ratePensionBalance: 0,
    annualRatePensionContribution: 0,
  },
  new Date(2024, 1, 29),
);
assert.ok(sameDay(leapCalculation.retirementDate, new Date(2025, 1, 28)));
assert.ok(sameDay(leapCalculation.finalDate, new Date(2027, 1, 28)));
leapCalculation.planRows.forEach((row) => {
  assert.equal(row.date.getMonth(), 1);
  assert.equal(
    row.date.getDate(),
    row.date.getFullYear() % 4 === 0 ? 29 : 28,
  );
});

const annualFire = calculateFire(
  {
    ...standardInputs,
    currentAge: 30,
    retirementAge: 40,
    payoutYears: 2,
    desiredAnnualWithdrawal: 100,
    ratePensionBalance: 0,
    ageSavingsBalance: 0,
    freeFundsBalance: 1150,
    askBalance: 0,
    annualRatePensionContribution: 0,
    annualAgeSavingsContribution: 0,
    annualFreeFundsContribution: 0,
    pensionTax: 0,
    askTax: 0,
    returnRate: 0,
    inflationRate: 0,
  },
  asOfDate,
);
assert.equal(annualFire.fireRow.age, 31);
assert.ok(sameDay(annualFire.fireRow.date, new Date(2027, 7, 4)));
assert.equal(annualFire.isFullyFunded, true);
assert.equal(
  annualFire.planRows.filter((row) => row.withdrawalShortfall).length,
  0,
);

const annualPensionStop = calculateFire(
  {
    ...standardInputs,
    currentAge: 30,
    retirementAge: 40,
    payoutYears: 10,
    desiredAnnualWithdrawal: 100,
    ratePensionBalance: 0,
    ageSavingsBalance: 0,
    freeFundsBalance: 0,
    askBalance: 0,
    annualRatePensionContribution: 150,
    annualAgeSavingsContribution: 0,
    annualFreeFundsContribution: 0,
    pensionTax: 0,
    askTax: 0,
    returnRate: 0,
    inflationRate: 0,
    redirectPensionContributionsToFreeFunds: false,
  },
  asOfDate,
);
assert.equal(annualPensionStop.pensionCoastRow.age, 37);
assert.equal(annualPensionStop.pensionStopRow.age, 37);
assertClose(annualPensionStop.pensionCoastRow.ratePension, 1050);
assertClose(annualPensionStop.finalRow.totalBalance, 50);

const pensionRedirectInputs = {
  ...standardInputs,
  currentAge: 30,
  retirementAge: 40,
  payoutYears: 10,
  desiredAnnualWithdrawal: 100,
  ratePensionBalance: 0,
  ageSavingsBalance: 1000,
  freeFundsBalance: 0,
  freeFundsCostBasis: 0,
  askBalance: 0,
  annualRatePensionContribution: 102,
  annualAgeSavingsContribution: 102,
  annualFreeFundsContribution: 51,
  ratePensionContributionTaxRelief: 0.4,
  pensionTax: 0,
  askTax: 0,
  returnRate: 0.02,
  inflationRate: 0.02,
};
const defaultPensionRedirect = calculateFire(pensionRedirectInputs, asOfDate);
const enabledPensionRedirect = calculateFire(
  {
    ...pensionRedirectInputs,
    redirectPensionContributionsToFreeFunds: true,
  },
  asOfDate,
);
const disabledPensionRedirect = calculateFire(
  {
    ...pensionRedirectInputs,
    redirectPensionContributionsToFreeFunds: false,
  },
  asOfDate,
);
const fixedNominalPensionRedirect = calculateFire(
  {
    ...pensionRedirectInputs,
    contributionsFollowInflation: false,
  },
  asOfDate,
);
const defaultRedirectAge31 = defaultPensionRedirect.planRows.find(
  (row) => row.age === 31,
);
const enabledRedirectAge31 = enabledPensionRedirect.planRows.find(
  (row) => row.age === 31,
);
const disabledRedirectAge31 = disabledPensionRedirect.planRows.find(
  (row) => row.age === 31,
);
const fixedNominalRedirectAge31 = fixedNominalPensionRedirect.planRows.find(
  (row) => row.age === 31,
);

assert.equal(defaultPensionRedirect.pensionStopRow.age, 30);
assert.equal(enabledPensionRedirect.pensionStopRow.age, 30);
assertClose(defaultRedirectAge31.freeFunds, enabledRedirectAge31.freeFunds);
assertClose(defaultRedirectAge31.freeFundsCostBasis, 214.2);
assertClose(defaultRedirectAge31.contribution, 214.2);
assertClose(enabledRedirectAge31.ratePension, 0);
assertClose(enabledRedirectAge31.ageSavings, 1000);
assertClose(enabledRedirectAge31.freeFunds, 214.2);
assertClose(enabledRedirectAge31.freeFundsCostBasis, 214.2);
assertClose(enabledRedirectAge31.contribution, 214.2);
assertClose(disabledRedirectAge31.ratePension, 0);
assertClose(disabledRedirectAge31.ageSavings, 1000);
assertClose(disabledRedirectAge31.freeFunds, 51);
assertClose(disabledRedirectAge31.freeFundsCostBasis, 51);
assertClose(disabledRedirectAge31.contribution, 51);
assertClose(fixedNominalRedirectAge31.freeFunds, 210);
assertClose(fixedNominalRedirectAge31.freeFundsCostBasis, 210);
assertClose(fixedNominalRedirectAge31.contribution, 210);

const noTaxReliefRedirect = calculateFire(
  { ...pensionRedirectInputs, ratePensionContributionTaxRelief: 0 },
  asOfDate,
);
const fullTaxReliefRedirect = calculateFire(
  {
    ...pensionRedirectInputs,
    annualAgeSavingsContribution: 0,
    ratePensionContributionTaxRelief: 1,
  },
  asOfDate,
);
assertClose(
  noTaxReliefRedirect.planRows.find((row) => row.age === 31).freeFunds,
  255,
);
assertClose(
  fullTaxReliefRedirect.planRows.find((row) => row.age === 31).freeFunds,
  51,
);

const redirectNearFire = calculateFire(
  {
    ...pensionRedirectInputs,
    ageSavingsBalance: 0,
    annualRatePensionContribution: 150,
    annualAgeSavingsContribution: 50,
    annualFreeFundsContribution: 10,
    returnRate: 0,
    inflationRate: 0,
  },
  asOfDate,
);
const redirectNearFireAge36 = redirectNearFire.planRows.find(
  (row) => row.age === 36,
);
assert.equal(redirectNearFire.pensionStopRow.age, 35);
assert.equal(redirectNearFire.fireRow.age, 37);
assertClose(redirectNearFireAge36.ratePension, 750);
assertClose(redirectNearFireAge36.ageSavings, 250);
assertClose(redirectNearFireAge36.freeFunds, 200);
assertClose(redirectNearFireAge36.freeFundsCostBasis, 200);
assertClose(redirectNearFireAge36.contribution, 150);
assert.ok(
  redirectNearFire.planRows
    .filter((row) => row.age > redirectNearFire.fireRow.age)
    .every((row) => row.contribution === 0),
);

const zeroPensionRedirect = calculateFire(
  {
    ...pensionRedirectInputs,
    annualRatePensionContribution: 0,
    annualAgeSavingsContribution: 0,
    annualFreeFundsContribution: 0,
  },
  asOfDate,
);
const zeroRedirectAge31 = zeroPensionRedirect.planRows.find(
  (row) => row.age === 31,
);
assert.equal(zeroPensionRedirect.pensionStopRow.age, 30);
assertClose(zeroRedirectAge31.freeFunds, 0);
assertClose(zeroRedirectAge31.freeFundsCostBasis, 0);
assertClose(zeroRedirectAge31.contribution, 0);

const annualTransitions = calculateFire(
  {
    ...standardInputs,
    currentAge: 30,
    retirementAge: 32,
    payoutYears: 2,
    desiredAnnualWithdrawal: 10000,
    ratePensionBalance: 0,
    ageSavingsBalance: 100,
    freeFundsBalance: 100,
    askBalance: 0,
    annualRatePensionContribution: 0,
    annualAgeSavingsContribution: 100,
    annualFreeFundsContribution: 200,
    pensionTax: 0,
    askTax: 0,
    returnRate: 0.1,
    inflationRate: 0,
  },
  asOfDate,
);
const age31 = annualTransitions.planRows.find((row) => row.age === 31);
assertClose(age31.ageSavings, 210);
assertClose(age31.freeFunds, 310);
assertClose(age31.contribution, 300);

const startOfYearWithdrawals = calculateFire(
  {
    ...standardInputs,
    currentAge: 30,
    retirementAge: 31,
    payoutYears: 2,
    desiredAnnualWithdrawal: 100,
    ratePensionBalance: 0,
    ageSavingsBalance: 200,
    freeFundsBalance: 0,
    askBalance: 0,
    annualRatePensionContribution: 0,
    annualAgeSavingsContribution: 0,
    annualFreeFundsContribution: 0,
    pensionTax: 0,
    askTax: 0,
    returnRate: 0,
    inflationRate: 0,
  },
  asOfDate,
);
const firstPensionYear = startOfYearWithdrawals.planRows.find(
  (row) => row.age === 31,
);
const secondPensionYear = startOfYearWithdrawals.planRows.find(
  (row) => row.age === 32,
);
assertClose(firstPensionYear.ageSavings, 200);
assertClose(firstPensionYear.withdrawal, 100);
assertClose(secondPensionYear.ageSavings, 100);
assertClose(secondPensionYear.withdrawal, 100);
assertClose(startOfYearWithdrawals.finalRow.totalBalance, 0);

function calculateExactlyFundedPension(returnRate) {
  const baseInputs = {
    ...standardInputs,
    currentAge: 32,
    retirementAge: 70,
    payoutYears: 10,
    desiredAnnualWithdrawal: 100,
    ratePensionBalance: 0,
    ageSavingsBalance: 0,
    freeFundsBalance: 0,
    askBalance: 0,
    annualRatePensionContribution: 0,
    annualAgeSavingsContribution: 0,
    annualFreeFundsContribution: 0,
    pensionTax: 0,
    askTax: 0,
    returnRate,
    inflationRate: 0,
  };
  const empty = calculateFire(baseInputs, asOfDate);
  const ageSavingsBalance =
    empty.requiredAtRetirement /
    Math.pow(1 + returnRate, empty.yearsToRetirement);
  return calculateFire({ ...baseInputs, ageSavingsBalance }, asOfDate);
}

[0, 0.05, -0.02].map(calculateExactlyFundedPension).forEach((calculation) => {
  assert.ok(calculation.pensionCoastRow);
  assert.equal(calculation.isFullyFunded, true);
  assert.equal(
    calculation.planRows.filter((row) => row.withdrawalShortfall).length,
    0,
  );
  assert.ok(calculation.finalRow.totalBalance < 1e-5);
});

const freeFundedFire = calculateFire(
  {
    ...standardInputs,
    currentAge: 30,
    retirementAge: 40,
    payoutYears: 10,
    desiredAnnualWithdrawal: 100,
    ratePensionBalance: 1,
    ageSavingsBalance: 0,
    freeFundsBalance: 2000,
    askBalance: 0,
    annualRatePensionContribution: 10,
    annualAgeSavingsContribution: 0,
    annualFreeFundsContribution: 0,
    pensionTax: 0,
    askTax: 0,
    returnRate: 0,
    inflationRate: 0,
  },
  asOfDate,
);
assert.ok(sameDay(freeFundedFire.fireRow.date, asOfDate));
assert.ok(
  sameDay(freeFundedFire.pensionStopRow.date, freeFundedFire.fireRow.date),
);
assert.equal(freeFundedFire.pensionCoastRow, null);
assert.equal(freeFundedFire.planRows[0].contribution, 0);

const repeatedPartialSales = calculateFire(
  {
    ...standardInputs,
    currentAge: 30,
    retirementAge: 31,
    payoutYears: 1,
    desiredAnnualWithdrawal: 100,
    ratePensionBalance: 0,
    ageSavingsBalance: 0,
    freeFundsBalance: 200,
    freeFundsCostBasis: 80,
    askBalance: 0,
    annualRatePensionContribution: 0,
    annualAgeSavingsContribution: 0,
    annualFreeFundsContribution: 0,
    returnRate: 0,
    inflationRate: 0,
  },
  asOfDate,
);
const repeatedSaleRows = repeatedPartialSales.planRows.filter(
  (row) => row.withdrawal > 0,
);
assert.equal(repeatedSaleRows.length, 2);
repeatedSaleRows.forEach((row) => {
  assertClose(row.freeFundsWithdrawal, 100);
  assertClose(row.realizedFreeFundsGain, 60);
  assertClose(row.withdrawalTax, 16.2);
  assertClose(row.netWithdrawal, 83.8);
});
assertClose(repeatedSaleRows[0].freeFundsCostBasis, 80);
assertClose(repeatedSaleRows[1].freeFundsCostBasis, 40);
assertClose(repeatedPartialSales.finalRow.freeFundsCostBasis, 0);
assertClose(repeatedPartialSales.totalFreeFundsTax, 32.4);
assertClose(repeatedPartialSales.effectiveFreeFundsWithdrawalTaxRate, 0.162);

const netTargetInputs = {
  ...standardInputs,
  currentAge: 30,
  retirementAge: 31,
  payoutYears: 1,
  desiredAnnualWithdrawal: 300000,
  ratePensionBalance: 0,
  ageSavingsBalance: 0,
  freeFundsBalance: 1000000,
  freeFundsCostBasis: 400000,
  askBalance: 0,
  annualRatePensionContribution: 0,
  annualAgeSavingsContribution: 0,
  annualFreeFundsContribution: 0,
  returnRate: 0,
  inflationRate: 0,
};
const grossTargetCalculation = calculateFire(netTargetInputs, asOfDate);
const netTargetCalculation = calculateFire(
  { ...netTargetInputs, withdrawalAfterTax: true },
  asOfDate,
);
const firstNetTargetWithdrawal = netTargetCalculation.planRows.find(
  (row) => row.withdrawal > 0,
);
assertClose(firstNetTargetWithdrawal.withdrawal, 385147.0588235294);
assertClose(firstNetTargetWithdrawal.withdrawalTax, 85147.0588235294);
assertClose(firstNetTargetWithdrawal.netWithdrawal, 300000);
assertClose(
  firstNetTargetWithdrawal.effectiveFreeFundsWithdrawalTaxRate,
  firstNetTargetWithdrawal.withdrawalTax /
    firstNetTargetWithdrawal.freeFundsWithdrawal,
);
assert.ok(
  netTargetCalculation.finalRow.freeFunds <
    grossTargetCalculation.finalRow.freeFunds,
);

const insufficientNetTarget = calculateFire(
  {
    ...netTargetInputs,
    freeFundsBalance: 200000,
    freeFundsCostBasis: 80000,
    withdrawalAfterTax: true,
  },
  asOfDate,
);
assert.equal(insufficientNetTarget.isFullyFunded, false);
assert.ok(
  insufficientNetTarget.planRows.some(
    (row) => row.withdrawal > 0 && row.netWithdrawal < 300000,
  ),
);

const progressiveTax = calculateFire(
  {
    ...standardInputs,
    currentAge: 30,
    retirementAge: 31,
    payoutYears: 1,
    desiredAnnualWithdrawal: 200000,
    ratePensionBalance: 0,
    ageSavingsBalance: 0,
    freeFundsBalance: 200000,
    freeFundsCostBasis: 100000,
    askBalance: 0,
    annualRatePensionContribution: 0,
    annualAgeSavingsContribution: 0,
    annualFreeFundsContribution: 0,
    returnRate: 0,
    inflationRate: 0,
  },
  asOfDate,
);
const progressiveTaxRow = progressiveTax.planRows.find(
  (row) => row.withdrawal > 0,
);
assertClose(progressiveTaxRow.realizedFreeFundsGain, 100000);
assertClose(progressiveTaxRow.withdrawalTax, 30090);
assertClose(progressiveTaxRow.netWithdrawal, 169910);

const thresholdTax = calculateFire(
  {
    ...standardInputs,
    currentAge: 30,
    retirementAge: 31,
    payoutYears: 1,
    desiredAnnualWithdrawal: 158800,
    ratePensionBalance: 0,
    ageSavingsBalance: 0,
    freeFundsBalance: 158800,
    freeFundsCostBasis: 79400,
    askBalance: 0,
    annualRatePensionContribution: 0,
    annualAgeSavingsContribution: 0,
    annualFreeFundsContribution: 0,
    returnRate: 0,
    inflationRate: 0,
  },
  asOfDate,
);
assertClose(
  thresholdTax.planRows.find((row) => row.withdrawal > 0).withdrawalTax,
  21438,
);

const noGainSale = calculateFire(
  {
    ...standardInputs,
    currentAge: 30,
    retirementAge: 31,
    payoutYears: 1,
    desiredAnnualWithdrawal: 100,
    ratePensionBalance: 0,
    ageSavingsBalance: 0,
    freeFundsBalance: 100,
    freeFundsCostBasis: 100,
    askBalance: 0,
    annualRatePensionContribution: 0,
    annualAgeSavingsContribution: 0,
    annualFreeFundsContribution: 0,
    returnRate: 0,
    inflationRate: 0,
  },
  asOfDate,
);
assert.equal(noGainSale.totalFreeFundsTax, 0);

const lossSale = calculateFire(
  {
    ...standardInputs,
    currentAge: 30,
    retirementAge: 31,
    payoutYears: 1,
    desiredAnnualWithdrawal: 50,
    ratePensionBalance: 0,
    ageSavingsBalance: 0,
    freeFundsBalance: 100,
    freeFundsCostBasis: 200,
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
  lossSale.planRows
    .filter((row) => row.withdrawal > 0)
    .every(
      (row) => row.realizedFreeFundsGain < 0 && row.withdrawalTax === 0,
    ),
);
assertClose(lossSale.finalRow.freeFundsCostBasis, 0);

const contributionCostBasis = calculateFire(
  {
    ...standardInputs,
    currentAge: 30,
    retirementAge: 32,
    payoutYears: 1,
    desiredAnnualWithdrawal: 10000,
    ratePensionBalance: 0,
    ageSavingsBalance: 0,
    freeFundsBalance: 100,
    freeFundsCostBasis: 100,
    askBalance: 0,
    annualRatePensionContribution: 0,
    annualAgeSavingsContribution: 0,
    annualFreeFundsContribution: 100,
    returnRate: 0,
    inflationRate: 0,
  },
  asOfDate,
);
assertClose(
  contributionCostBasis.planRows.find((row) => row.age === 31)
    .freeFundsCostBasis,
  200,
);

const inflationAdjustedCostBasis = calculateFire(
  {
    ...standardInputs,
    currentAge: 30,
    retirementAge: 31,
    payoutYears: 1,
    desiredAnnualWithdrawal: 105,
    ratePensionBalance: 0,
    ageSavingsBalance: 0,
    freeFundsBalance: 100,
    freeFundsCostBasis: 100,
    askBalance: 0,
    annualRatePensionContribution: 0,
    annualAgeSavingsContribution: 0,
    annualFreeFundsContribution: 0,
    returnRate: 0.1,
    inflationRate: 0.02,
  },
  asOfDate,
);
const inflationAdjustedSale = inflationAdjustedCostBasis.planRows.find(
  (row) => row.withdrawal > 0,
);
assertClose(inflationAdjustedSale.freeFundsCostBasis, 100 / 1.02);
assertClose(inflationAdjustedSale.realizedFreeFundsGain, 9.54545454545456);
assertClose(inflationAdjustedSale.withdrawalTax, 2.57727272727273);

const afterTaxPension = calculateFire(
  {
    ...standardInputs,
    currentAge: 30,
    retirementAge: 31,
    payoutYears: 10,
    desiredAnnualWithdrawal: 100,
    ratePensionBalance: 5000 / 3,
    ageSavingsBalance: 0,
    freeFundsBalance: 0,
    freeFundsCostBasis: 0,
    askBalance: 0,
    annualRatePensionContribution: 0,
    annualAgeSavingsContribution: 0,
    annualFreeFundsContribution: 0,
    pensionWithdrawalTax: 0.4,
    returnRate: 0,
    inflationRate: 0,
    withdrawalAfterTax: true,
  },
  asOfDate,
);
const firstAfterTaxPensionWithdrawal = afterTaxPension.planRows.find(
  (row) => row.phase === "Pension" && row.withdrawal > 0,
);
assert.equal(afterTaxPension.fireRow.age, 31);
assert.equal(afterTaxPension.isFullyFunded, true);
assertClose(firstAfterTaxPensionWithdrawal.withdrawal, 500 / 3);
assertClose(firstAfterTaxPensionWithdrawal.pensionWithdrawalTax, 200 / 3);
assertClose(firstAfterTaxPensionWithdrawal.totalWithdrawalTax, 200 / 3);
assertClose(firstAfterTaxPensionWithdrawal.netWithdrawal, 100);
assertClose(afterTaxPension.requiredAtRetirement, 5000 / 3);
assertClose(afterTaxPension.finalRow.totalBalance, 0);

const beforeTaxPension = calculateFire(
  {
    ...standardInputs,
    currentAge: 30,
    retirementAge: 31,
    payoutYears: 10,
    desiredAnnualWithdrawal: 100,
    ratePensionBalance: 1000,
    ageSavingsBalance: 0,
    freeFundsBalance: 0,
    freeFundsCostBasis: 0,
    askBalance: 0,
    annualRatePensionContribution: 0,
    annualAgeSavingsContribution: 0,
    annualFreeFundsContribution: 0,
    pensionWithdrawalTax: 0.4,
    returnRate: 0,
    inflationRate: 0,
    withdrawalAfterTax: false,
  },
  asOfDate,
);
const firstBeforeTaxPensionWithdrawal = beforeTaxPension.planRows.find(
  (row) => row.phase === "Pension" && row.withdrawal > 0,
);
assertClose(firstBeforeTaxPensionWithdrawal.withdrawal, 100);
assertClose(firstBeforeTaxPensionWithdrawal.pensionWithdrawalTax, 40);
assertClose(firstBeforeTaxPensionWithdrawal.netWithdrawal, 60);
assertClose(beforeTaxPension.finalRow.totalBalance, 0);

const askOnlyWithdrawals = calculateFire(
  {
    ...standardInputs,
    currentAge: 30,
    retirementAge: 31,
    payoutYears: 1,
    desiredAnnualWithdrawal: 50,
    ratePensionBalance: 0,
    ageSavingsBalance: 0,
    freeFundsBalance: 0,
    freeFundsCostBasis: 0,
    askBalance: 100,
    annualRatePensionContribution: 0,
    annualAgeSavingsContribution: 0,
    annualFreeFundsContribution: 0,
    returnRate: 0.1,
    inflationRate: 0,
  },
  asOfDate,
);
assertClose(askOnlyWithdrawals.planRows[0].ask, 100);
assertClose(askOnlyWithdrawals.realAskReturn, 0.083);
assert.ok(
  askOnlyWithdrawals.planRows.every(
    (row) => row.freeFundsWithdrawal === 0 && row.withdrawalTax === 0,
  ),
);
const askOnlyNetWithdrawals = calculateFire(
  {
    ...standardInputs,
    currentAge: 30,
    retirementAge: 31,
    payoutYears: 1,
    desiredAnnualWithdrawal: 50,
    ratePensionBalance: 0,
    ageSavingsBalance: 0,
    freeFundsBalance: 0,
    freeFundsCostBasis: 0,
    askBalance: 100,
    annualRatePensionContribution: 0,
    annualAgeSavingsContribution: 0,
    annualFreeFundsContribution: 0,
    returnRate: 0,
    inflationRate: 0,
    withdrawalAfterTax: true,
  },
  asOfDate,
);
assert.ok(
  askOnlyNetWithdrawals.planRows
    .filter((row) => row.withdrawal > 0)
    .every(
      (row) =>
        row.withdrawalTax === 0 &&
        Math.abs(row.netWithdrawal - row.withdrawal) <= 0.01,
    ),
);

assert.throws(
  () =>
    calculateFire(
      {
        ...standardInputs,
        returnRate: 1e20,
        inflationRate: 0,
        desiredAnnualWithdrawal: 1,
      },
      asOfDate,
    ),
  /tal, der er for store/,
);
assert.throws(
  () =>
    calculateFire(
      { ...standardInputs, retirementAge: 100000000 },
      asOfDate,
    ),
  /tal, der er for store/,
);

const optimizationInputs = {
  ...standardInputs,
  currentAge: 36,
  retirementAge: 70,
  payoutYears: 20,
  annualRatePensionContribution: 60000,
  annualAgeSavingsContribution: 9900,
  annualFreeFundsContribution: 50000,
  ratePensionContributionTaxRelief: 0.37,
};
function netContributionBudget(contributions, taxRelief) {
  return (
    contributions.annualRatePensionContribution * (1 - taxRelief) +
    contributions.annualAgeSavingsContribution +
    contributions.annualFreeFundsContribution
  );
}
const unchangedOptimizationInputs = { ...optimizationInputs };
const optimizedContributions = optimizeAnnualContributions(
  optimizationInputs,
  asOfDate,
);

assert.deepEqual(optimizationInputs, unchangedOptimizationInputs);
assert.ok(
  ["improved", "current-optimal"].includes(optimizedContributions.status),
);
assert.equal(optimizedContributions.precision, 1000);
assert.deepEqual(optimizedContributions.limits, {
  ratePension: CONTRIBUTION_LIMITS.ratePension,
  ageSavings: CONTRIBUTION_LIMITS.ageSavings,
});
assert.ok(optimizedContributions.recommended);
assert.ok(
  optimizedContributions.recommended.fireAge <=
    optimizedContributions.current.fireAge,
);
assertClose(
  optimizedContributions.annualNetBudget,
  netContributionBudget(
    optimizationInputs,
    optimizationInputs.ratePensionContributionTaxRelief,
  ),
);
assertClose(
  netContributionBudget(
    optimizedContributions.recommended,
    optimizationInputs.ratePensionContributionTaxRelief,
  ),
  optimizedContributions.annualNetBudget,
);
assert.ok(
  optimizedContributions.recommended.annualRatePensionContribution <=
    CONTRIBUTION_LIMITS.ratePension,
);
assert.ok(
  optimizedContributions.recommended.annualAgeSavingsContribution <=
    CONTRIBUTION_LIMITS.ageSavings,
);

const repeatedOptimization = optimizeAnnualContributions(
  {
    ...optimizationInputs,
    annualRatePensionContribution:
      optimizedContributions.recommended.annualRatePensionContribution,
    annualAgeSavingsContribution:
      optimizedContributions.recommended.annualAgeSavingsContribution,
    annualFreeFundsContribution:
      optimizedContributions.recommended.annualFreeFundsContribution,
  },
  asOfDate,
);
assert.equal(repeatedOptimization.status, "current-optimal");
assert.deepEqual(
  repeatedOptimization.recommended,
  repeatedOptimization.current,
);

const overLimitOptimization = optimizeAnnualContributions(
  {
    ...optimizationInputs,
    annualRatePensionContribution: 100000,
    annualAgeSavingsContribution: 20000,
    annualFreeFundsContribution: 0,
  },
  asOfDate,
);
assert.equal(overLimitOptimization.status, "limits-applied");
assert.ok(
  overLimitOptimization.recommended.annualRatePensionContribution <=
    CONTRIBUTION_LIMITS.ratePension,
);
assert.ok(
  overLimitOptimization.recommended.annualAgeSavingsContribution <=
    CONTRIBUTION_LIMITS.ageSavings,
);
assertClose(
  netContributionBudget(
    overLimitOptimization.recommended,
    optimizationInputs.ratePensionContributionTaxRelief,
  ),
  83000,
);

const highLimitOptimization = optimizeAnnualContributions(
  {
    ...optimizationInputs,
    annualRatePensionContribution: 0,
    annualAgeSavingsContribution: 60000,
    annualFreeFundsContribution: 50000,
    ageSavingsContributionLimit: CONTRIBUTION_LIMITS.ageSavingsHigh,
  },
  asOfDate,
);
assert.equal(
  highLimitOptimization.limits.ageSavings,
  CONTRIBUTION_LIMITS.ageSavingsHigh,
);
assert.notEqual(highLimitOptimization.status, "limits-applied");
assert.ok(
  highLimitOptimization.recommended.annualAgeSavingsContribution <=
    CONTRIBUTION_LIMITS.ageSavingsHigh,
);

const impossibleOptimization = optimizeAnnualContributions(
  {
    ...standardInputs,
    currentAge: 30,
    retirementAge: 35,
    payoutYears: 10,
    desiredAnnualWithdrawal: 100000,
    ratePensionBalance: 0,
    ageSavingsBalance: 0,
    freeFundsBalance: 0,
    freeFundsCostBasis: 0,
    askBalance: 0,
    annualRatePensionContribution: 0,
    annualAgeSavingsContribution: 0,
    annualFreeFundsContribution: 0,
  },
  asOfDate,
);
assert.equal(impossibleOptimization.status, "unachievable");
assert.equal(impossibleOptimization.recommended, null);

[true, false].forEach((redirectPensionContributionsToFreeFunds) => {
  const redirectOptimization = optimizeAnnualContributions(
    {
      ...optimizationInputs,
      redirectPensionContributionsToFreeFunds,
    },
    asOfDate,
  );

  assert.ok(
    redirectOptimization.status === "unachievable" ||
      redirectOptimization.recommended.fireAge <=
        redirectOptimization.current.fireAge,
  );
});

const optimizedFireTime =
  optimizedContributions.recommended.fireDate.getTime();
for (
  let pensionContribution = 0;
  pensionContribution <=
  CONTRIBUTION_LIMITS.ratePension + CONTRIBUTION_LIMITS.ageSavings;
  pensionContribution += optimizedContributions.precision
) {
  const minimumRatePension = Math.max(
    0,
    pensionContribution - CONTRIBUTION_LIMITS.ageSavings,
  );
  const maximumRatePension = Math.min(
    CONTRIBUTION_LIMITS.ratePension,
    pensionContribution,
  );
  const ratePensionContribution = Math.min(
    maximumRatePension,
    Math.max(
      minimumRatePension,
      Math.round(
        pensionContribution *
          (optimizationInputs.annualRatePensionContribution /
            (optimizationInputs.annualRatePensionContribution +
              optimizationInputs.annualAgeSavingsContribution)),
      ),
    ),
  );
  const ageSavingsContribution =
    pensionContribution - ratePensionContribution;
  const annualFreeFundsContribution =
    optimizedContributions.annualNetBudget -
    ratePensionContribution *
      (1 - optimizationInputs.ratePensionContributionTaxRelief) -
    ageSavingsContribution;

  if (annualFreeFundsContribution < 0) {
    continue;
  }

  const candidate = calculateFire(
    {
      ...optimizationInputs,
      annualRatePensionContribution: ratePensionContribution,
      annualAgeSavingsContribution: ageSavingsContribution,
      annualFreeFundsContribution,
    },
    asOfDate,
  );

  if (candidate.fireRow) {
    assert.ok(optimizedFireTime <= candidate.fireRow.date.getTime());
  }
}

let randomState = 0x51f15e;
function random() {
  randomState = (1664525 * randomState + 1013904223) >>> 0;
  return randomState / 0x100000000;
}

function randomBetween(minimum, maximum) {
  return minimum + random() * (maximum - minimum);
}

for (let scenario = 0; scenario < 2000; scenario += 1) {
  const currentAge = Math.floor(randomBetween(18, 71));
  const retirementAge = currentAge + Math.floor(randomBetween(1, 51));
  const randomized = calculateFire(
    {
      currentAge,
      retirementAge,
      payoutYears: Math.floor(randomBetween(10, 31)),
      desiredAnnualWithdrawal: randomBetween(0, 1000000),
      ratePensionBalance: randomBetween(0, 5000000),
      ageSavingsBalance: randomBetween(0, 1000000),
      freeFundsBalance: randomBetween(0, 5000000),
      freeFundsCostBasis: randomBetween(0, 7500000),
      askBalance: randomBetween(0, 2000000),
      annualRatePensionContribution: randomBetween(0, 150000),
      annualAgeSavingsContribution: randomBetween(0, 50000),
      annualFreeFundsContribution: randomBetween(0, 250000),
      pensionTax: randomBetween(0, 0.5),
      ratePensionContributionTaxRelief: randomBetween(0, 0.6),
      pensionWithdrawalTax: randomBetween(0, 0.6),
      askTax: randomBetween(0, 0.5),
      returnRate: randomBetween(-0.2, 0.3),
      inflationRate: randomBetween(-0.1, 0.15),
      withdrawalAfterTax: random() >= 0.5,
      contributionsFollowInflation: random() >= 0.5,
      redirectPensionContributionsToFreeFunds: random() >= 0.5,
    },
    asOfDate,
  );

  assertFiniteResult(randomized);
  randomized.rows.forEach((milestone) => {
    const planRow = randomized.planRows.find(
      (row) => row.age === milestone.age,
    );
    assert.ok(planRow);
    assertClose(planRow.ratePension, milestone.ratePension);
    assertClose(planRow.ageSavings, milestone.ageSavings);
    assertClose(planRow.freeFunds, milestone.freeFunds);
    assertClose(planRow.freeFundsCostBasis, milestone.freeFundsCostBasis);
    assertClose(planRow.ask, milestone.ask);
  });

  if (randomized.isFullyFunded) {
    assert.equal(randomized.firstShortfallDate, null);
    assert.equal(
      randomized.planRows.filter((row) => row.withdrawalShortfall).length,
      0,
    );
  } else {
    assert.ok(randomized.firstShortfallDate);
    assert.ok(
      randomized.planRows.some((row) => row.withdrawalShortfall),
    );
  }
}

console.log("FIRE-beregnerens årlige beregningstest bestod.");
