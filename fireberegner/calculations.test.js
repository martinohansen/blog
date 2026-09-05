const assert = require("node:assert/strict");
const {
  calculateFire,
  createAnnualContributionOptimizationSession,
  optimizeAnnualContributions,
  optimizeAnnualContributionsAdaptive,
  CONTRIBUTION_LIMITS,
  FREE_FUNDS_TAXATION,
  RETURN_STRATEGY,
  strategyReturnRate,
} = require("./calculations.js");
const {
  calculateLifeAnnuityMetrics,
} = require("./life-annuity.js");

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

const benchmarkLifeAnnuity = calculateLifeAnnuityMetrics({
  retirementAge: 65,
  retirementYear: 2026,
  realReturnRates: [0.03],
});
assertClose(benchmarkLifeAnnuity.conversionRate, 0.0608296361, 1e-9);
assertClose(benchmarkLifeAnnuity.expectedAgeAtDeath, 87.7226096, 1e-6);
const laterCohortLifeAnnuity = calculateLifeAnnuityMetrics({
  retirementAge: 65,
  retirementYear: 2066,
  realReturnRates: [0.03],
});
assert.ok(
  laterCohortLifeAnnuity.conversionRate <
    benchmarkLifeAnnuity.conversionRate,
);
const guaranteedLifeAnnuity = calculateLifeAnnuityMetrics({
  retirementAge: 65,
  retirementYear: 2026,
  realReturnRates: [0.03],
  guaranteeYears: 10,
});
assert.ok(
  guaranteedLifeAnnuity.conversionRate < benchmarkLifeAnnuity.conversionRate,
);

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
    assert.ok(row.lifeAnnuity >= 0);
    assert.ok(row.lifeAnnuityWithdrawal >= 0);
    assert.ok(row.totalWithdrawalTax >= 0);
    assertClose(
      row.totalWithdrawalTax,
      row.withdrawalTax + row.pensionWithdrawalTax,
    );
    assertClose(row.netWithdrawal, row.withdrawal - row.totalWithdrawalTax);
  });

  assert.ok(calculation.totalFreeFundsTax >= 0);
  assert.ok(calculation.effectiveFreeFundsWithdrawalTaxRate >= 0);
  assert.ok(calculation.effectiveFreeFundsWithdrawalTaxRate <= 0.42);
  calculation.planRows.forEach((row) => {
    assert.ok(row.ratePensionNonDeductibleBasis >= 0);
    assert.ok(row.taxFreeRatePensionWithdrawal >= 0);
    assert.ok(row.taxableRatePensionWithdrawal >= 0);
    assert.ok(
      row.taxFreeRatePensionWithdrawal + row.taxableRatePensionWithdrawal <=
        row.withdrawal + 0.01,
    );
  });
}

const standardInputs = {
  currentAge: 32,
  retirementAge: 70,
  payoutYears: 15,
  desiredAnnualWithdrawal: 300000,
  ratePensionBalance: 500000,
  lifeAnnuityBalance: 0,
  ageSavingsBalance: 50000,
  freeFundsBalance: 250000,
  freeFundsCostBasis: 250000,
  askBalance: 150000,
  annualRatePensionContribution: 60000,
  annualLifeAnnuityContribution: 0,
  annualAgeSavingsContribution: 9400,
  annualFreeFundsContribution: 60000,
  pensionTax: 0.153,
  pensionWithdrawalTax: 0.37,
  askTax: 0.17,
  returnRate: 0.07,
  inflationRate: 0.02,
  withdrawalAfterTax: false,
};

assertClose(
  strategyReturnRate(0.07, 0.03, RETURN_STRATEGY.declining, 10, 20),
  0.07,
  1e-12,
);
assertClose(
  strategyReturnRate(0.07, 0.03, RETURN_STRATEGY.declining, 15, 20),
  0.05,
  1e-12,
);
assertClose(
  strategyReturnRate(0.07, 0.03, RETURN_STRATEGY.declining, 20, 20),
  0.03,
  1e-12,
);
assertClose(
  strategyReturnRate(0.07, 0.03, RETURN_STRATEGY.declining, 40, 20),
  0.03,
  1e-12,
);
assertClose(
  strategyReturnRate(0.07, 0.03, RETURN_STRATEGY.riskTent, 30, 20),
  0.03 + (0.07 - 0.03) * (10 / 15),
  1e-12,
);
assertClose(
  strategyReturnRate(0.07, 0.03, RETURN_STRATEGY.riskTent, 40, 20),
  0.07,
  1e-12,
);
assertClose(
  strategyReturnRate(0.07, 0.03, RETURN_STRATEGY.declining, 19, 20, 0, 20),
  0.07,
  1e-12,
);
assertClose(
  strategyReturnRate(0.07, 0.03, RETURN_STRATEGY.declining, 20, 20, 0, 20),
  0.03,
  1e-12,
);
assertClose(
  strategyReturnRate(0.07, 0.03, RETURN_STRATEGY.riskTent, 20, 20, 10, 0),
  0.03,
  1e-12,
);
assertClose(
  strategyReturnRate(0.07, 0.03, RETURN_STRATEGY.riskTent, 21, 20, 10, 0),
  0.07,
  1e-12,
);
assertClose(
  strategyReturnRate(0.07, 0.03, RETURN_STRATEGY.riskTent, 18, 20, 4, 6),
  0.05,
  1e-12,
);
assertClose(
  strategyReturnRate(0.07, 0.03, RETURN_STRATEGY.riskTent, 23, 20, 4, 6),
  0.05,
  1e-12,
);
assertClose(
  strategyReturnRate(0.07, 0.03, RETURN_STRATEGY.riskTent, 26, 20, 4, 6),
  0.07,
  1e-12,
);
assertClose(
  strategyReturnRate(0.07, 0.03, RETURN_STRATEGY.declining, 19, 20, 1, 20),
  0.07,
  1e-12,
);
assert.ok(
  Number.isFinite(
    strategyReturnRate(
      0.07,
      0.03,
      RETURN_STRATEGY.riskTent,
      0,
      20,
      1000000,
      1000000,
    ),
  ),
);

const implicitFixedReturn = calculateFire(standardInputs, asOfDate, {
  includeBridgeCapacity: false,
});
const explicitFixedReturn = calculateFire(
  {
    ...standardInputs,
    returnStrategy: RETURN_STRATEGY.none,
    defensiveReturnRate: 0.04,
  },
  asOfDate,
  { includeBridgeCapacity: false },
);
assert.deepEqual(explicitFixedReturn, implicitFixedReturn);

assert.throws(
  () =>
    calculateFire(
      {
        ...standardInputs,
        returnStrategy: RETURN_STRATEGY.declining,
        defensiveReturnRate: -0.001,
      },
      asOfDate,
    ),
  /defensive afkast skal være mellem 0 % og det forventede afkast/,
);
assert.throws(
  () =>
    calculateFire(
      {
        ...standardInputs,
        returnStrategy: RETURN_STRATEGY.riskTent,
        defensiveReturnRate: standardInputs.returnRate + 0.001,
      },
      asOfDate,
    ),
  /defensive afkast skal være mellem 0 % og det forventede afkast/,
);
assert.throws(
  () =>
    calculateFire(
      { ...standardInputs, returnStrategy: "ukendt" },
      asOfDate,
    ),
  /gyldig afkaststrategi/,
);
assert.throws(
  () =>
    calculateFire(
      {
        ...standardInputs,
        returnStrategy: RETURN_STRATEGY.declining,
        defensiveReturnRate: 0.04,
        returnDeclineYears: -1,
      },
      asOfDate,
    ),
  /Nedtrapningsperioden skal være 0 eller flere hele år/,
);
assert.throws(
  () =>
    calculateFire(
      {
        ...standardInputs,
        returnStrategy: RETURN_STRATEGY.declining,
        defensiveReturnRate: 0.04,
        returnDeclineYears: 1.5,
      },
      asOfDate,
    ),
  /Nedtrapningsperioden skal være 0 eller flere hele år/,
);
assert.throws(
  () =>
    calculateFire(
      {
        ...standardInputs,
        returnStrategy: RETURN_STRATEGY.riskTent,
        defensiveReturnRate: 0.04,
        returnRecoveryYears: Number.NaN,
      },
      asOfDate,
    ),
  /Genoptrapningsperioden skal være 0 eller flere hele år/,
);
assert.doesNotThrow(() =>
  calculateFire(
    {
      ...standardInputs,
      returnStrategy: RETURN_STRATEGY.declining,
      defensiveReturnRate: 0.04,
      returnRecoveryYears: -1,
    },
    asOfDate,
    { includeBridgeCapacity: false },
  ),
);
assert.doesNotThrow(() =>
  calculateFire(
    {
      ...standardInputs,
      returnStrategy: RETURN_STRATEGY.declining,
      defensiveReturnRate: standardInputs.returnRate,
    },
    asOfDate,
    { includeBridgeCapacity: false },
  ),
);

const result = calculateFire(
  {
    ...standardInputs,
    desiredAnnualWithdrawal: 750000,
    ratePensionBalance: 730000,
    ageSavingsBalance: 45000,
    freeFundsBalance: 140000,
    freeFundsCostBasis: 140000,
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
  result.planRows.some((row) => row.phase === "Pension" && row.withdrawal > 0),
);
assertFiniteResult(result);

result.rows.forEach((milestone) => {
  const planRow = result.planRows.find((row) =>
    sameDay(row.date, milestone.date),
  );
  assert.ok(planRow);
  assertClose(planRow.ratePension, milestone.ratePension);
  assertClose(planRow.lifeAnnuity, milestone.lifeAnnuity);
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
  inflationAdjustedContributions.pensionTargetToday,
  inflationAdjustedContributions.rows[0].pensionTarget,
);
assertClose(inflationAdjustedContributions.planRows[1].contribution, 129400);
assertClose(
  fixedNominalContributions.planRows[1].contribution,
  129400 / Math.sqrt(1.02),
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
    calculateFire(
      {
        ...standardInputs,
        freeFundsCostBasis: standardInputs.freeFundsBalance + 1,
      },
      asOfDate,
    ),
  /Den samlede købspris må ikke være højere/,
);
assert.throws(
  () => calculateFire({ ...standardInputs, returnRate: -0.001 }, asOfDate),
  /forventede afkast skal være 0 % eller højere/,
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
assert.throws(
  () =>
    calculateFire(
      { ...standardInputs, freeFundsTaxation: "unsupported" },
      asOfDate,
    ),
  /realisations- eller lagerbeskatning/,
);

const lowAgeSavingsLimit = calculateFire(
  {
    ...standardInputs,
    annualRatePensionContribution: 68700,
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
const automaticallySplitRateContribution = calculateFire(
  {
    ...standardInputs,
    annualRatePensionContribution: 69700,
    ratePensionContributionTaxRelief: 0.37,
  },
  asOfDate,
);
assertClose(
  automaticallySplitRateContribution.annualDeductibleRatePensionContribution,
  68700,
);
assertClose(
  automaticallySplitRateContribution.annualNonDeductibleRatePensionContribution,
  1000,
);
assertClose(
  automaticallySplitRateContribution.annualNetContributionBudget,
  113681,
);
assert.equal(
  highAgeSavingsLimit.ageSavingsContributionLimit,
  CONTRIBUTION_LIMITS.ageSavingsHigh,
);
assert.equal(highAgeSavingsLimit.ageSavingsContributionLimitExceeded, false);

const zeroAssets = calculateFire(
  {
    ...standardInputs,
    retirementAge: 35,
    payoutYears: 2,
    desiredAnnualWithdrawal: 100,
    ratePensionBalance: 0,
    ageSavingsBalance: 0,
    freeFundsBalance: 0,
    freeFundsCostBasis: 0,
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
    freeFundsCostBasis: 500,
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
  assert.equal(row.date.getDate(), row.date.getFullYear() % 4 === 0 ? 29 : 28);
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
    freeFundsCostBasis: 1150,
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
    freeFundsCostBasis: 0,
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
assertClose(defaultRedirectAge31.freeFundsCostBasis, 214.2 / Math.sqrt(1.02));
assertClose(defaultRedirectAge31.contribution, 214.2);
assertClose(enabledRedirectAge31.ratePension, 0);
assertClose(enabledRedirectAge31.ageSavings, 1000);
assertClose(enabledRedirectAge31.freeFunds, 214.2);
assertClose(enabledRedirectAge31.freeFundsCostBasis, 214.2 / Math.sqrt(1.02));
assertClose(enabledRedirectAge31.contribution, 214.2);
assertClose(disabledRedirectAge31.ratePension, 0);
assertClose(disabledRedirectAge31.ageSavings, 1000);
assertClose(disabledRedirectAge31.freeFunds, 51);
assertClose(disabledRedirectAge31.freeFundsCostBasis, 51 / Math.sqrt(1.02));
assertClose(disabledRedirectAge31.contribution, 51);
assertClose(fixedNominalRedirectAge31.freeFunds, 214.2 / Math.sqrt(1.02));
assertClose(fixedNominalRedirectAge31.freeFundsCostBasis, 214.2 / 1.02);
assertClose(fixedNominalRedirectAge31.contribution, 214.2 / Math.sqrt(1.02));

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
    freeFundsCostBasis: 100,
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
assertClose(age31.ageSavings, 110 + 100 * Math.sqrt(1.1));
assertClose(age31.freeFunds, 110 + 200 * Math.sqrt(1.1));
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
    freeFundsCostBasis: 0,
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
    freeFundsCostBasis: 0,
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

[0, 0.05].map(calculateExactlyFundedPension).forEach((calculation) => {
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
    freeFundsCostBasis: 2000,
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

const bridgeCapacityInputs = {
  ...standardInputs,
  currentAge: 30,
  retirementAge: 32,
  payoutYears: 1,
  desiredAnnualWithdrawal: 100,
  ratePensionBalance: 0,
  ageSavingsBalance: 1000,
  freeFundsBalance: 1000,
  freeFundsCostBasis: 1000,
  askBalance: 0,
  annualRatePensionContribution: 0,
  annualAgeSavingsContribution: 0,
  annualFreeFundsContribution: 0,
  pensionTax: 0,
  pensionWithdrawalTax: 0,
  askTax: 0.17,
  returnRate: 0.1,
  inflationRate: 0,
  withdrawalAfterTax: true,
  freeFundsInventoryShare: 0,
};
const sustainableBridgeCapacity = calculateFire(bridgeCapacityInputs, asOfDate);
assert.equal(sustainableBridgeCapacity.fireRow.age, 30);
assertClose(sustainableBridgeCapacity.fireRow.possibleBridgeWithdrawal, 517.61);
assert.ok(
  sustainableBridgeCapacity.fireRow.possibleBridgeWithdrawal <
    1000 / (1 + 1 / 1.1),
);

const bridgeCapacityAboveLimit = calculateFire(
  {
    ...bridgeCapacityInputs,
    desiredAnnualWithdrawal:
      sustainableBridgeCapacity.fireRow.possibleBridgeWithdrawal + 0.01,
  },
  asOfDate,
);
assert.ok(bridgeCapacityAboveLimit.fireRow.age > 30);

const longBridgeCapacity = calculateFire(
  {
    ...bridgeCapacityInputs,
    retirementAge: 50,
    ageSavingsBalance: 1000000,
    freeFundsBalance: 1000000,
    freeFundsCostBasis: 1000000,
    returnRate: 0.07,
  },
  asOfDate,
);
assert.equal(longBridgeCapacity.fireRow.age, 30);
assertClose(longBridgeCapacity.fireRow.possibleBridgeWithdrawal, 79544.83);
assert.ok(longBridgeCapacity.fireRow.possibleBridgeWithdrawal < 88217.69);

const beforeTaxBridgeCapacity = calculateFire(
  { ...bridgeCapacityInputs, withdrawalAfterTax: false },
  asOfDate,
);
assertClose(
  beforeTaxBridgeCapacity.fireRow.possibleBridgeWithdrawal,
  1000 / (1 + 1 / 1.1),
);

const askBridgeCapacity = calculateFire(
  {
    ...bridgeCapacityInputs,
    freeFundsBalance: 0,
    freeFundsCostBasis: 0,
    askBalance: 1000,
  },
  asOfDate,
);
assertClose(
  askBridgeCapacity.fireRow.possibleBridgeWithdrawal,
  1000 / (1 + 1 / 1.083),
);

const inventoryBridgeCapacity = calculateFire(
  { ...bridgeCapacityInputs, freeFundsInventoryShare: 1 },
  asOfDate,
);
assertClose(
  inventoryBridgeCapacity.fireRow.possibleBridgeWithdrawal,
  1000 / (1 + 1 / 1.073),
);

const zeroYearBridgeCapacity = calculateFire(
  {
    ...bridgeCapacityInputs,
    retirementAge: 31,
    ageSavingsBalance: 100,
    freeFundsBalance: 0,
    freeFundsCostBasis: 0,
    returnRate: 0,
  },
  asOfDate,
);
assert.equal(zeroYearBridgeCapacity.fireRow.age, 31);
assert.equal(zeroYearBridgeCapacity.fireRow.possibleBridgeWithdrawal, 0);

const bridgeCapacityDisabled = calculateFire(bridgeCapacityInputs, asOfDate, {
  includeBridgeCapacity: false,
});
assert.equal(bridgeCapacityDisabled.fireRow.possibleBridgeWithdrawal, null);
assert.equal(
  bridgeCapacityDisabled.fireRow.age,
  sustainableBridgeCapacity.fireRow.age,
);
assert.equal(
  bridgeCapacityDisabled.isFullyFunded,
  sustainableBridgeCapacity.isFullyFunded,
);
assert.deepEqual(
  bridgeCapacityDisabled.planRows,
  sustainableBridgeCapacity.planRows,
);
assert.deepEqual(
  bridgeCapacityDisabled.rows.map((row) => ({
    ...row,
    possibleBridgeWithdrawal: null,
  })),
  sustainableBridgeCapacity.rows.map((row) => ({
    ...row,
    possibleBridgeWithdrawal: null,
  })),
);

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

const inventoryTaxInputs = {
  ...standardInputs,
  currentAge: 30,
  retirementAge: 31,
  payoutYears: 1,
  desiredAnnualWithdrawal: 2000000,
  ratePensionBalance: 0,
  ageSavingsBalance: 0,
  freeFundsBalance: 1000000,
  freeFundsCostBasis: 700000,
  askBalance: 0,
  annualRatePensionContribution: 0,
  annualAgeSavingsContribution: 0,
  annualFreeFundsContribution: 0,
  returnRate: 0.1,
  inflationRate: 0,
  freeFundsTaxation: FREE_FUNDS_TAXATION.inventory,
};

const mixedTaxBaseInputs = {
  ...standardInputs,
  currentAge: 30,
  retirementAge: 31,
  payoutYears: 1,
  desiredAnnualWithdrawal: 1000000,
  ratePensionBalance: 0,
  ageSavingsBalance: 0,
  freeFundsBalance: 100000,
  freeFundsCostBasis: 100000,
  askBalance: 0,
  annualRatePensionContribution: 0,
  annualAgeSavingsContribution: 0,
  annualFreeFundsContribution: 0,
  returnRate: 0.1,
  inflationRate: 0,
};
const fullyRealizationTaxed = calculateFire(
  { ...mixedTaxBaseInputs, freeFundsInventoryShare: 0 },
  asOfDate,
);
const evenlyMixedTaxed = calculateFire(
  { ...mixedTaxBaseInputs, freeFundsInventoryShare: 0.5 },
  asOfDate,
);
const fullyInventoryTaxed = calculateFire(
  { ...mixedTaxBaseInputs, freeFundsInventoryShare: 1 },
  asOfDate,
);
const mixedAge31 = evenlyMixedTaxed.planRows.find((row) => row.age === 31);

assert.equal(
  fullyRealizationTaxed.freeFundsTaxation,
  FREE_FUNDS_TAXATION.realization,
);
assert.equal(evenlyMixedTaxed.freeFundsTaxation, FREE_FUNDS_TAXATION.mixed);
assert.equal(
  fullyInventoryTaxed.freeFundsTaxation,
  FREE_FUNDS_TAXATION.inventory,
);
assertClose(
  fullyRealizationTaxed.planRows.find((row) => row.age === 31).freeFunds,
  110000,
);
assertClose(mixedAge31.freeFundsRealization, 55000);
assertClose(mixedAge31.freeFundsInventory, 53650);
assertClose(mixedAge31.freeFunds, 108650);
assertClose(evenlyMixedTaxed.planRows[0].annualFreeFundsTax, 1350);
assertClose(mixedAge31.freeFundsCostBasis, 50000);
assertClose(
  fullyInventoryTaxed.planRows.find((row) => row.age === 31).freeFunds,
  107300,
);

const mixedDrawdownTax = calculateFire(
  {
    ...mixedTaxBaseInputs,
    desiredAnnualWithdrawal: 100000,
    freeFundsBalance: 1000000,
    freeFundsCostBasis: 0,
    freeFundsInventoryShare: 0.5,
  },
  asOfDate,
);
const mixedDrawdownStart = mixedDrawdownTax.planRows.find(
  (row) => row.age === 30,
);
const mixedDrawdownAge31 = mixedDrawdownTax.planRows.find(
  (row) => row.age === 31,
);
assertClose(mixedDrawdownStart.withdrawalTax, 13500);
assertClose(mixedDrawdownStart.annualFreeFundsTax, 14490);
assertClose(mixedDrawdownAge31.freeFundsRealization, 495000);
assertClose(mixedDrawdownAge31.freeFundsInventory, 480510);
assertClose(mixedDrawdownAge31.freeFunds, 975510);

assert.throws(
  () =>
    calculateFire(
      { ...mixedTaxBaseInputs, freeFundsInventoryShare: -0.01 },
      asOfDate,
    ),
  /mellem 0 og 100 %/,
);
assert.throws(
  () =>
    calculateFire(
      { ...mixedTaxBaseInputs, freeFundsInventoryShare: 1.01 },
      asOfDate,
    ),
  /mellem 0 og 100 %/,
);

const inventoryTax = calculateFire(inventoryTaxInputs, asOfDate);
const inventoryWithdrawal = inventoryTax.planRows.find(
  (row) => row.withdrawal > 0,
);
assert.equal(inventoryTax.freeFundsTaxation, FREE_FUNDS_TAXATION.inventory);
assertClose(inventoryWithdrawal.freeFunds, 1069910);
assertClose(inventoryWithdrawal.withdrawalTax, 0);
assertClose(inventoryWithdrawal.realizedFreeFundsGain, 0);
assertClose(inventoryWithdrawal.freeFundsCostBasis, 0);
assertClose(inventoryTax.planRows[0].annualFreeFundsTax, 30090);
assertClose(inventoryWithdrawal.annualFreeFundsTax, 0);
assertClose(inventoryTax.totalFreeFundsTax, 30090);
assertClose(inventoryTax.totalFreeFundsTaxableGain, 100000);
assertClose(inventoryTax.effectiveFreeFundsTaxRate, 0.3009);

const inventoryTaxBelowThreshold = calculateFire(
  {
    ...inventoryTaxInputs,
    freeFundsBalance: 100000,
    desiredAnnualWithdrawal: 200000,
  },
  asOfDate,
);
assertClose(
  inventoryTaxBelowThreshold.planRows.find((row) => row.withdrawal > 0)
    .freeFunds,
  107300,
);
assertClose(inventoryTaxBelowThreshold.totalFreeFundsTax, 2700);
assertClose(inventoryTaxBelowThreshold.effectiveFreeFundsTaxRate, 0.27);

const inventoryTaxWithMidyearContribution = calculateFire(
  {
    ...inventoryTaxInputs,
    freeFundsBalance: 100000,
    annualFreeFundsContribution: 100000,
  },
  asOfDate,
);
const inventoryContributionGrowth = Math.sqrt(1.1);
const inventoryContributionTaxableGain =
  100000 * 0.1 + 100000 * (inventoryContributionGrowth - 1);
const inventoryContributionTax = inventoryContributionTaxableGain * 0.27;
const inventoryContributionRow =
  inventoryTaxWithMidyearContribution.planRows.find((row) => row.age === 31);
assertClose(
  inventoryTaxWithMidyearContribution.planRows[0].annualFreeFundsTax,
  inventoryContributionTax,
);
assertClose(
  inventoryContributionRow.freeFunds,
  100000 * 1.1 +
    100000 * inventoryContributionGrowth -
    inventoryContributionTax,
);

const progressiveInventoryCapacity = calculateFire(
  {
    ...standardInputs,
    currentAge: 30,
    retirementAge: 31,
    payoutYears: 9,
    desiredAnnualWithdrawal: 134000,
    ratePensionBalance: 0,
    ageSavingsBalance: 0,
    freeFundsBalance: 1000000,
    freeFundsCostBasis: 0,
    askBalance: 0,
    annualRatePensionContribution: 0,
    annualAgeSavingsContribution: 0,
    annualFreeFundsContribution: 0,
    returnRate: 0.1,
    inflationRate: 0,
    freeFundsTaxation: FREE_FUNDS_TAXATION.inventory,
  },
  asOfDate,
);
assert.equal(progressiveInventoryCapacity.fireRow.age, 30);
assert.equal(progressiveInventoryCapacity.isFullyFunded, true);

const inventoryAfterTaxTarget = calculateFire(
  {
    ...inventoryTaxInputs,
    freeFundsBalance: 200000,
    freeFundsCostBasis: 0,
    desiredAnnualWithdrawal: 100000,
    returnRate: 0,
    withdrawalAfterTax: true,
  },
  asOfDate,
);
const inventoryAfterTaxWithdrawal = inventoryAfterTaxTarget.planRows.find(
  (row) => row.withdrawal > 0,
);
assertClose(inventoryAfterTaxWithdrawal.withdrawal, 100000);
assertClose(inventoryAfterTaxWithdrawal.netWithdrawal, 100000);
assertClose(inventoryAfterTaxTarget.totalFreeFundsTax, 0);

const inventoryWithDifferentCostBasis = calculateFire(
  { ...inventoryTaxInputs, freeFundsCostBasis: 0 },
  asOfDate,
);
assertClose(
  inventoryWithDifferentCostBasis.finalRow.freeFunds,
  inventoryTax.finalRow.freeFunds,
);
assertClose(
  inventoryWithDifferentCostBasis.totalFreeFundsTax,
  inventoryTax.totalFreeFundsTax,
);

const defaultPensionTargets = calculateFire(
  {
    ...standardInputs,
    currentAge: 30,
    retirementAge: 70,
    payoutYears: 20,
    desiredAnnualWithdrawal: 300000,
    ratePensionBalance: 500000,
    ageSavingsBalance: 50000,
    annualRatePensionContribution: 60000,
    annualAgeSavingsContribution: 9900,
    annualFreeFundsContribution: 50000,
    returnRate: 0.07,
    inflationRate: 0.02,
    withdrawalAfterTax: true,
  },
  asOfDate,
);
assertClose(defaultPensionTargets.requiredAtRetirement, 6354262.08);
assertClose(defaultPensionTargets.pensionTargetToday, 1401125.69);

const futurePensionMixInputs = {
  ...standardInputs,
  currentAge: 30,
  retirementAge: 32,
  payoutYears: 10,
  desiredAnnualWithdrawal: 10,
  ratePensionBalance: 0,
  ageSavingsBalance: 0,
  freeFundsBalance: 0,
  freeFundsCostBasis: 0,
  askBalance: 0,
  annualFreeFundsContribution: 0,
  pensionTax: 0,
  pensionWithdrawalTax: 0.4,
  returnRate: 0,
  inflationRate: 0,
  withdrawalAfterTax: true,
};
const futureRateOnlyPension = calculateFire(
  {
    ...futurePensionMixInputs,
    annualRatePensionContribution: 200,
    annualAgeSavingsContribution: 0,
  },
  asOfDate,
);
const futureAgeSavingsOnlyPension = calculateFire(
  {
    ...futurePensionMixInputs,
    annualRatePensionContribution: 0,
    annualAgeSavingsContribution: 200,
  },
  asOfDate,
);
assertClose(futureRateOnlyPension.requiredAtRetirement, 100 / 0.6);
assertClose(futureRateOnlyPension.pensionTargetToday, 100 / 0.6);
assertClose(futureAgeSavingsOnlyPension.requiredAtRetirement, 100);
assertClose(futureAgeSavingsOnlyPension.pensionTargetToday, 100);

const beforeTaxRateOnlyTarget = calculateFire(
  {
    ...futurePensionMixInputs,
    annualRatePensionContribution: 200,
    annualAgeSavingsContribution: 0,
    withdrawalAfterTax: false,
  },
  asOfDate,
);
const beforeTaxAgeSavingsOnlyTarget = calculateFire(
  {
    ...futurePensionMixInputs,
    annualRatePensionContribution: 0,
    annualAgeSavingsContribution: 200,
    withdrawalAfterTax: false,
  },
  asOfDate,
);
assertClose(beforeTaxRateOnlyTarget.requiredAtRetirement, 100);
assertClose(
  beforeTaxRateOnlyTarget.requiredAtRetirement,
  beforeTaxAgeSavingsOnlyTarget.requiredAtRetirement,
);
assertClose(
  beforeTaxRateOnlyTarget.pensionTargetToday,
  beforeTaxAgeSavingsOnlyTarget.pensionTargetToday,
);

const zeroProjectedPension = calculateFire(
  {
    ...futurePensionMixInputs,
    annualRatePensionContribution: 0,
    annualAgeSavingsContribution: 0,
  },
  asOfDate,
);
assert.equal(zeroProjectedPension.requiredAtRetirement, null);
assert.equal(zeroProjectedPension.pensionTargetToday, null);

const zeroWithdrawalWithNoProjectedPension = calculateFire(
  {
    ...futurePensionMixInputs,
    desiredAnnualWithdrawal: 0,
    annualRatePensionContribution: 0,
    annualAgeSavingsContribution: 0,
  },
  asOfDate,
);
assert.equal(zeroWithdrawalWithNoProjectedPension.requiredAtRetirement, 0);
assert.equal(zeroWithdrawalWithNoProjectedPension.pensionTargetToday, 0);

const fullyTaxedFutureRatePension = calculateFire(
  {
    ...futurePensionMixInputs,
    annualRatePensionContribution: 200,
    annualAgeSavingsContribution: 0,
    pensionWithdrawalTax: 1,
  },
  asOfDate,
);
assert.equal(fullyTaxedFutureRatePension.requiredAtRetirement, null);
assert.equal(fullyTaxedFutureRatePension.pensionTargetToday, null);
assert.ok(fullyTaxedFutureRatePension.planRows.length > 0);

const fullyTaxedBeforeTaxRatePension = calculateFire(
  {
    ...futurePensionMixInputs,
    annualRatePensionContribution: 200,
    annualAgeSavingsContribution: 0,
    pensionWithdrawalTax: 1,
    withdrawalAfterTax: false,
  },
  asOfDate,
);
assertClose(fullyTaxedBeforeTaxRatePension.requiredAtRetirement, 100);
assertClose(fullyTaxedBeforeTaxRatePension.pensionTargetToday, 100);

const zeroProjectedBeforeTaxPension = calculateFire(
  {
    ...futurePensionMixInputs,
    annualRatePensionContribution: 0,
    annualAgeSavingsContribution: 0,
    withdrawalAfterTax: false,
  },
  asOfDate,
);
assertClose(zeroProjectedBeforeTaxPension.requiredAtRetirement, 100);
assertClose(zeroProjectedBeforeTaxPension.pensionTargetToday, 100);

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

const afterTaxAgeSavings = calculateFire(
  {
    ...standardInputs,
    currentAge: 30,
    retirementAge: 31,
    payoutYears: 10,
    desiredAnnualWithdrawal: 100,
    ratePensionBalance: 0,
    lifeAnnuityBalance: 0,
    ageSavingsBalance: 1000,
    freeFundsBalance: 0,
    freeFundsCostBasis: 0,
    askBalance: 0,
    annualRatePensionContribution: 0,
    annualLifeAnnuityContribution: 0,
    annualAgeSavingsContribution: 0,
    annualFreeFundsContribution: 0,
    pensionWithdrawalTax: 0.4,
    returnRate: 0,
    inflationRate: 0,
    withdrawalAfterTax: true,
  },
  asOfDate,
);
const firstAgeSavingsWithdrawal = afterTaxAgeSavings.planRows.find(
  (row) => row.phase === "Pension" && row.withdrawal > 0,
);
assert.equal(afterTaxAgeSavings.isFullyFunded, true);
assertClose(firstAgeSavingsWithdrawal.withdrawal, 100);
assertClose(firstAgeSavingsWithdrawal.pensionWithdrawalTax, 0);
assertClose(firstAgeSavingsWithdrawal.netWithdrawal, 100);

const afterTaxReserve = calculateFire(
  {
    ...standardInputs,
    currentAge: 30,
    retirementAge: 31,
    payoutYears: 10,
    desiredAnnualWithdrawal: 0,
    ratePensionBalance: 100,
    lifeAnnuityBalance: 100,
    ageSavingsBalance: 100,
    freeFundsBalance: 100,
    freeFundsCostBasis: 40,
    askBalance: 100,
    annualRatePensionContribution: 0,
    annualLifeAnnuityContribution: 0,
    annualAgeSavingsContribution: 0,
    annualFreeFundsContribution: 0,
    pensionWithdrawalTax: 0.4,
    returnRate: 0,
    inflationRate: 0,
    withdrawalAfterTax: true,
  },
  asOfDate,
);
assertClose(afterTaxReserve.finalRow.totalBalance, 400);
assertClose(afterTaxReserve.finalReserveAfterTax, 343.8);

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

const lifeAnnuityBaselineInputs = {
  ...standardInputs,
  lifeAnnuityPayoutRate: 0,
  currentAge: 64,
  retirementAge: 65,
  payoutYears: 10,
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
  pensionWithdrawalTax: 0.4,
  returnRate: 0,
  inflationRate: 0,
  withdrawalAfterTax: true,
};
const lifeAnnuityBaseline = calculateFire(
  lifeAnnuityBaselineInputs,
  asOfDate,
);
const expectedNetLifeAnnuityIncome =
  lifeAnnuityBaseline.lifeAnnuityAnnualIncome * 0.6;
const afterTaxLifeAnnuity = calculateFire(
  {
    ...lifeAnnuityBaselineInputs,
    desiredAnnualWithdrawal: expectedNetLifeAnnuityIncome,
  },
  asOfDate,
);
const firstLifeAnnuityWithdrawal = afterTaxLifeAnnuity.planRows.find(
  (row) => row.phase === "Pension" && row.withdrawal > 0,
);
assert.equal(afterTaxLifeAnnuity.fireRow.age, 65);
assert.equal(afterTaxLifeAnnuity.isFullyFunded, true);
assertClose(firstLifeAnnuityWithdrawal.lifeAnnuity, 0);
assertClose(
  firstLifeAnnuityWithdrawal.lifeAnnuityWithdrawal,
  afterTaxLifeAnnuity.lifeAnnuityAnnualIncome,
);
assertClose(
  firstLifeAnnuityWithdrawal.withdrawal,
  afterTaxLifeAnnuity.lifeAnnuityAnnualIncome,
);
assertClose(
  firstLifeAnnuityWithdrawal.pensionWithdrawalTax,
  afterTaxLifeAnnuity.lifeAnnuityAnnualIncome * 0.4,
);
assertClose(firstLifeAnnuityWithdrawal.netWithdrawal, expectedNetLifeAnnuityIncome);
assertClose(afterTaxLifeAnnuity.requiredAtRetirement, 1000000);
assertClose(afterTaxLifeAnnuity.finalRow.lifeAnnuity, 0);
afterTaxLifeAnnuity.planRows
  .filter((row) => row.phase === "Pension")
  .forEach((row) =>
    assertClose(
      row.lifeAnnuityWithdrawal,
      afterTaxLifeAnnuity.lifeAnnuityAnnualIncome,
    ),
  );
assert.ok(afterTaxLifeAnnuity.lifeAnnuityExpectedAgeAtDeath > 65);
assert.ok(afterTaxLifeAnnuity.lifeAnnuityConversionRate > 0);
assert.ok(afterTaxLifeAnnuity.lifeAnnuityConversionRate < 1);

// A nominal payout rate must not imply inflation protection. Matching the
// investment return after PAL keeps nominal payments level for survivors.
const nominalLifeInputs = {
  ...lifeAnnuityBaselineInputs,
  lifeAnnuityPayoutRate: 0.0322,
  returnRate: 0.0322 / (1 - lifeAnnuityBaselineInputs.pensionTax),
  inflationRate: 0.02,
  payoutYears: 45,
};
const nominalLife = calculateFire(nominalLifeInputs, asOfDate);
const nominalRows = nominalLife.planRows.filter(row => row.phase === "Pension");
nominalRows.forEach((row, period) => {
  assertClose(row.lifeAnnuityWithdrawal * Math.pow(1.02, period),
    nominalLife.lifeAnnuityAnnualIncome);
});
assert.ok(nominalRows.at(-1).age > nominalLife.lifeAnnuityExpectedAgeAtDeath);
assert.ok(nominalRows.at(-1).lifeAnnuityWithdrawal > 0);
const fallingLife = calculateFire({
  ...nominalLifeInputs,
  returnRate: 0,
  inflationRate: 0,
  desiredAnnualWithdrawal: nominalLife.lifeAnnuityAnnualIncome,
}, asOfDate);
assert.equal(fallingLife.isFullyFunded, false);
const fallingRows = fallingLife.planRows.filter(row => row.phase === "Pension");
assert.ok(fallingRows.at(-1).lifeAnnuityWithdrawal < fallingRows[0].lifeAnnuityWithdrawal);
const higherReturnLife = calculateFire({ ...nominalLifeInputs, returnRate: 0.07 }, asOfDate);
assertClose(higherReturnLife.lifeAnnuityConversionRate, nominalLife.lifeAnnuityConversionRate);
assert.ok(higherReturnLife.planRows.filter(row => row.phase === "Pension").at(-1).lifeAnnuityWithdrawal >
  higherReturnLife.lifeAnnuityAnnualIncome);
assert.throws(() => calculateFire({ ...nominalLifeInputs, lifeAnnuityPayoutRate: -1 }, asOfDate), /udbetalingsrente/);
const variableLifeTarget = calculateFire({
  ...lifeAnnuityBaselineInputs,
  lifeAnnuityPayoutRate: 0.0322,
  ageSavingsBalance: 100000,
  desiredAnnualWithdrawal: 40000,
}, asOfDate);
const requiredFlexiblePension = variableLifeTarget.planRows
  .filter(row => row.phase === "Pension")
  .reduce((sum, row) => sum + Math.max(0, 40000 - row.lifeAnnuityWithdrawal * 0.6), 0);
assertClose(variableLifeTarget.requiredAtRetirement,
  variableLifeTarget.lifeAnnuityBalanceAtRetirement + requiredFlexiblePension);
for (const returnRate of [0, 0.02, 0.07]) {
  for (const desiredAnnualWithdrawal of [10000, 40000, 100000]) {
    const inputs = {
      ...lifeAnnuityBaselineInputs,
      lifeAnnuityPayoutRate: 0.0322,
      inflationRate: 0.02,
      returnRate,
      ageSavingsBalance: 10000000,
      desiredAnnualWithdrawal,
    };
    const result = calculateFire(inputs, asOfDate);
    let discount = 1;
    let required = result.lifeAnnuityBalanceAtRetirement;
    for (const row of result.planRows.filter(row => row.phase === "Pension")) {
      required += Math.max(0, desiredAnnualWithdrawal -
        row.lifeAnnuityWithdrawal * 0.6) / discount;
      discount *= (1 + row.pensionReturnRate * (1 - inputs.pensionTax)) /
        (1 + inputs.inflationRate);
    }
    assertClose(result.requiredAtRetirement, required);
  }
}

const mixedTaxablePension = calculateFire(
  {
    ...standardInputs,
    currentAge: 30,
    retirementAge: 31,
    payoutYears: 10,
    desiredAnnualWithdrawal: 64,
    ratePensionBalance: 500,
    ratePensionNonDeductibleBasis: 100,
    lifeAnnuityBalance: 500,
    ageSavingsBalance: 0,
    freeFundsBalance: 0,
    freeFundsCostBasis: 0,
    askBalance: 0,
    annualRatePensionContribution: 0,
    annualLifeAnnuityContribution: 0,
    annualAgeSavingsContribution: 0,
    annualFreeFundsContribution: 0,
    pensionWithdrawalTax: 0.4,
    returnRate: 0,
    inflationRate: 0,
    withdrawalAfterTax: true,
  },
  asOfDate,
);
const firstMixedTaxablePensionWithdrawal = mixedTaxablePension.planRows.find(
  (row) => row.phase === "Pension" && row.withdrawal > 0,
);
assertClose(
  firstMixedTaxablePensionWithdrawal.lifeAnnuityWithdrawal,
  mixedTaxablePension.lifeAnnuityAnnualIncome,
);
assertClose(
  firstMixedTaxablePensionWithdrawal.taxFreeRatePensionWithdrawal,
  10,
);
assertClose(
  firstMixedTaxablePensionWithdrawal.pensionWithdrawalTax,
  (firstMixedTaxablePensionWithdrawal.taxableRatePensionWithdrawal +
    mixedTaxablePension.lifeAnnuityAnnualIncome) *
    0.4,
);
assert.equal(firstMixedTaxablePensionWithdrawal.withdrawalShortfall, true);

const lifeAnnuityTaxBelowRateAllowance = calculateFire(
  {
    lifeAnnuityPayoutRate: 0,
    ...standardInputs,
    currentAge: 30,
    retirementAge: 31,
    payoutYears: 10,
    desiredAnnualWithdrawal: 50,
    ratePensionBalance: 1000,
    ratePensionNonDeductibleBasis: 1000,
    lifeAnnuityBalance: 9000,
    ageSavingsBalance: 0,
    freeFundsBalance: 0,
    freeFundsCostBasis: 0,
    askBalance: 0,
    annualRatePensionContribution: 0,
    annualLifeAnnuityContribution: 0,
    annualAgeSavingsContribution: 0,
    annualFreeFundsContribution: 0,
    pensionWithdrawalTax: 0.4,
    returnRate: 0,
    inflationRate: 0,
    withdrawalAfterTax: true,
  },
  asOfDate,
);
const firstWithdrawalBelowRateAllowance =
  lifeAnnuityTaxBelowRateAllowance.planRows.find(
    (row) => row.phase === "Pension" && row.withdrawal > 0,
  );
assertClose(
  firstWithdrawalBelowRateAllowance.lifeAnnuityWithdrawal,
  lifeAnnuityTaxBelowRateAllowance.lifeAnnuityAnnualIncome,
);
assertClose(
  firstWithdrawalBelowRateAllowance.pensionWithdrawalTax,
  lifeAnnuityTaxBelowRateAllowance.lifeAnnuityAnnualIncome * 0.4,
);
assert.ok(firstWithdrawalBelowRateAllowance.netWithdrawal > 50);
assertClose(lifeAnnuityTaxBelowRateAllowance.requiredAtRetirement, 9000);
assertClose(lifeAnnuityTaxBelowRateAllowance.finalRow.ratePension, 1000);
assert.equal(lifeAnnuityTaxBelowRateAllowance.isFullyFunded, true);
assert.equal(
  lifeAnnuityTaxBelowRateAllowance.planRows.some(
    (row) => row.withdrawalShortfall,
  ),
  false,
);

const lifeAnnuityContribution = calculateFire(
  {
    ...standardInputs,
    currentAge: 30,
    retirementAge: 31,
    payoutYears: 10,
    desiredAnnualWithdrawal: 1000,
    ratePensionBalance: 0,
    lifeAnnuityBalance: 0,
    ageSavingsBalance: 0,
    freeFundsBalance: 0,
    freeFundsCostBasis: 0,
    askBalance: 0,
    annualRatePensionContribution: 0,
    annualLifeAnnuityContribution: 100,
    annualAgeSavingsContribution: 0,
    annualFreeFundsContribution: 0,
    ratePensionContributionTaxRelief: 0.4,
    returnRate: 0,
    inflationRate: 0,
    withdrawalAfterTax: false,
    redirectPensionContributionsToFreeFunds: false,
  },
  asOfDate,
);
const lifeAnnuityRetirementRow = lifeAnnuityContribution.planRows.find(
  (row) => row.age === 31,
);
assertClose(lifeAnnuityRetirementRow.lifeAnnuity, 0);
assertClose(lifeAnnuityContribution.lifeAnnuityBalanceAtRetirement, 100);
assertClose(
  lifeAnnuityContribution.lifeAnnuityAnnualIncome,
  100 / lifeAnnuityContribution.lifeAnnuityFactor,
);
assertClose(lifeAnnuityContribution.annualNetContributionBudget, 60);

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
    calculateFire({ ...standardInputs, retirementAge: 100000000 }, asOfDate),
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

function optimizeInPartitions(inputs, calculationDate, partitionCount) {
  const sessions = Array.from({ length: partitionCount }, () =>
    createAnnualContributionOptimizationSession(inputs, calculationDate),
  );
  const fullBudgetResults = sessions.map((session, partitionIndex) =>
    session.evaluateFullBudgetPartition(partitionIndex, partitionCount),
  );
  const finiteFireTimes = fullBudgetResults
    .map((result) => result.best?.fireTime)
    .filter((fireTime) => Number.isFinite(fireTime));
  const results =
    finiteFireTimes.length === 0
      ? fullBudgetResults
      : sessions.map((session, partitionIndex) =>
          session.evaluateCheapestPartition(
            Math.min(...finiteFireTimes),
            partitionIndex,
            partitionCount,
          ),
        );

  return sessions[0].finalize(
    results.map((result) => result.best).filter(Boolean),
    results.reduce(
      (total, result) => total + result.evaluatedCandidates,
      0,
    ),
  );
}

const shortParallelOptimizationInputs = {
  ...optimizationInputs,
  currentAge: 69,
  retirementAge: 70,
  payoutYears: 10,
  desiredAnnualWithdrawal: 100000,
  optimizationLocks: {
    annualRatePensionContribution: true,
    annualLifeAnnuityContribution: true,
  },
};
const shortSynchronousOptimization = optimizeAnnualContributions(
  shortParallelOptimizationInputs,
  asOfDate,
);
const shortParallelOptimization = optimizeInPartitions(
  shortParallelOptimizationInputs,
  asOfDate,
  4,
);
assert.equal(
  shortParallelOptimization.status,
  shortSynchronousOptimization.status,
);
assert.deepEqual(
  shortParallelOptimization.current,
  shortSynchronousOptimization.current,
);
assert.deepEqual(
  shortParallelOptimization.recommended,
  shortSynchronousOptimization.recommended,
);
assert.throws(
  () =>
    createAnnualContributionOptimizationSession(
      shortParallelOptimizationInputs,
      asOfDate,
    ).evaluateFullBudgetPartition(4, 4),
  /partition er ugyldig/,
);

function netContributionBudget(contributions, taxRelief) {
  const deductibleRatePensionContribution = Math.min(
    contributions.annualRatePensionContribution,
    CONTRIBUTION_LIMITS.ratePension,
  );
  const nonDeductibleRatePensionContribution = Math.max(
    0,
    contributions.annualRatePensionContribution -
      deductibleRatePensionContribution,
  );
  const lifeAnnuityContribution =
    contributions.annualLifeAnnuityContribution ?? 0;
  const deductibleLifeAnnuityContribution = Math.min(
    lifeAnnuityContribution,
    CONTRIBUTION_LIMITS.lifeAnnuity,
  );
  const nonDeductibleLifeAnnuityContribution = Math.max(
    0,
    lifeAnnuityContribution - deductibleLifeAnnuityContribution,
  );
  return (
    deductibleRatePensionContribution * (1 - taxRelief) +
    nonDeductibleRatePensionContribution +
    deductibleLifeAnnuityContribution * (1 - taxRelief) +
    nonDeductibleLifeAnnuityContribution +
    contributions.annualAgeSavingsContribution +
    contributions.annualFreeFundsContribution
  );
}
const unchangedOptimizationInputs = { ...optimizationInputs };
const optimizedContributions = optimizeAnnualContributions(
  optimizationInputs,
  asOfDate,
);
const adaptiveOptimizedContributions = optimizeAnnualContributionsAdaptive(
  optimizationInputs,
  asOfDate,
);

assert.equal(
  adaptiveOptimizedContributions.status,
  optimizedContributions.status,
);
assert.deepEqual(
  adaptiveOptimizedContributions.current,
  optimizedContributions.current,
);
assert.deepEqual(
  adaptiveOptimizedContributions.recommended,
  optimizedContributions.recommended,
);
assert.equal(
  adaptiveOptimizedContributions.searchMethod,
  "adaptive-coarse-to-fine",
);
assert.ok(
  adaptiveOptimizedContributions.evaluatedCandidates <
    optimizedContributions.evaluatedCandidates,
);

const providedPlanInputs = {
  ...standardInputs,
  currentAge: 32,
  retirementAge: 70,
  payoutYears: 20,
  desiredAnnualWithdrawal: 500000,
  ratePensionBalance: 750000,
  ageSavingsBalance: 50000,
  freeFundsBalance: 300000,
  freeFundsCostBasis: 270000,
  askBalance: 200000,
  annualRatePensionContribution: 68700,
  annualLifeAnnuityContribution: 62000,
  annualAgeSavingsContribution: 3000,
  annualFreeFundsContribution: 51000,
  ageSavingsContributionLimit: 9900,
  ratePensionContributionTaxRelief: 0.4,
  freeFundsInventoryShare: 0,
  returnRate: 0.085,
  inflationRate: 0.025,
  defensiveReturnRate: 0.04,
  returnDeclineYears: 10,
  returnRecoveryYears: 15,
  returnStrategy: RETURN_STRATEGY.riskTent,
  withdrawalAfterTax: true,
  contributionsFollowInflation: true,
  redirectPensionContributionsToFreeFunds: true,
};

const lifeAnnuitySplitOptimizationInputs = {
  ...standardInputs,
  currentAge: 64,
  retirementAge: 65,
  payoutYears: 30,
  desiredAnnualWithdrawal: 2500,
  ratePensionBalance: 0,
  lifeAnnuityBalance: 0,
  ageSavingsBalance: 0,
  freeFundsBalance: 0,
  freeFundsCostBasis: 0,
  askBalance: 0,
  annualRatePensionContribution: 0,
  annualLifeAnnuityContribution: 0,
  annualAgeSavingsContribution: 0,
  annualFreeFundsContribution: 50000,
  ratePensionContributionTaxRelief: 0.37,
  returnRate: 0.02,
  inflationRate: 0.02,
  withdrawalAfterTax: false,
  freeFundsInventoryShare: 0,
  returnStrategy: RETURN_STRATEGY.none,
};
const lifeAnnuitySplitOptimization = optimizeAnnualContributions(
  lifeAnnuitySplitOptimizationInputs,
  asOfDate,
);
assert.equal(lifeAnnuitySplitOptimization.recommended.fireAge, 65);
assert.ok(
  lifeAnnuitySplitOptimization.recommended.annualLifeAnnuityContribution >
    lifeAnnuitySplitOptimization.recommended.annualRatePensionContribution,
);
assert.ok(
  lifeAnnuitySplitOptimization.recommended.annualRatePensionContribution <
    CONTRIBUTION_LIMITS.ratePension,
);
// Annual payments now decline when returns trail the payout rate. The plan
// must still improve on the original 50,000 kr. budget and be fully funded.
assert.ok(lifeAnnuitySplitOptimization.recommended.annualNetCost < 50000);
assert.equal(calculateFire({
  ...lifeAnnuitySplitOptimizationInputs,
  ...lifeAnnuitySplitOptimization.recommended,
}, asOfDate).isFullyFunded, true);

const exhaustiveProvidedPlan = optimizeAnnualContributions(
  providedPlanInputs,
  asOfDate,
);
const adaptiveProvidedPlan = optimizeAnnualContributionsAdaptive(
  providedPlanInputs,
  asOfDate,
);
assert.equal(adaptiveProvidedPlan.status, exhaustiveProvidedPlan.status);
assert.deepEqual(
  adaptiveProvidedPlan.recommended,
  exhaustiveProvidedPlan.recommended,
);
assert.ok(
  adaptiveProvidedPlan.evaluatedCandidates * 4 <
    exhaustiveProvidedPlan.evaluatedCandidates,
);

assert.deepEqual(optimizationInputs, unchangedOptimizationInputs);
assert.ok(
  ["improved", "lower-cost", "larger-reserve", "current-optimal"].includes(
    optimizedContributions.status,
  ),
);
assert.equal(optimizedContributions.precision, 1000);
assert.equal(optimizedContributions.searchMethod, "exhaustive-grid");
assert.ok(optimizedContributions.evaluatedCandidates > 0);
assert.deepEqual(optimizedContributions.limits, {
  ratePension: CONTRIBUTION_LIMITS.ratePension,
  lifeAnnuity: CONTRIBUTION_LIMITS.lifeAnnuity,
  ageSavings: CONTRIBUTION_LIMITS.ageSavings,
});
assert.ok(optimizedContributions.recommended);
assert.ok(
  optimizedContributions.recommended.fireAge <=
    optimizedContributions.current.fireAge,
);
if (
  optimizedContributions.recommended.fireDate.getTime() ===
  optimizedContributions.current.fireDate.getTime()
) {
  assert.ok(
    optimizedContributions.recommended.annualNetCost <=
      optimizedContributions.current.annualNetCost,
  );
}
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
  optimizedContributions.recommended.annualNetCost,
);
assert.ok(
  optimizedContributions.recommended.annualNetCost <=
    optimizedContributions.annualNetBudget,
);
assert.ok(
  optimizedContributions.recommended.annualAgeSavingsContribution <=
    CONTRIBUTION_LIMITS.ageSavings,
);

const fixedLifeAnnuityOptimization = optimizeAnnualContributions(
  {
    ...optimizationInputs,
    lifeAnnuityBalance: 100000,
    annualLifeAnnuityContribution: 12000,
    optimizationLocks: {
      annualLifeAnnuityContribution: true,
    },
  },
  asOfDate,
);
assertClose(
  fixedLifeAnnuityOptimization.annualNetBudget,
  optimizedContributions.annualNetBudget +
    12000 * (1 - optimizationInputs.ratePensionContributionTaxRelief),
);
assert.ok(
  fixedLifeAnnuityOptimization.recommended.annualLifeAnnuityContribution <=
    CONTRIBUTION_LIMITS.lifeAnnuity,
);
assert.equal(
  fixedLifeAnnuityOptimization.recommended.annualLifeAnnuityContribution,
  12000,
);
assert.equal(
  fixedLifeAnnuityOptimization.lockedContributions
    .annualLifeAnnuityContribution,
  true,
);
assert.ok(fixedLifeAnnuityOptimization.recommended.annualPensionTaxSaving >= 0);
assertClose(
  fixedLifeAnnuityOptimization.current.annualPensionTaxSaving,
  (optimizationInputs.annualRatePensionContribution + 12000) *
    optimizationInputs.ratePensionContributionTaxRelief,
);

const allContributionsLocked = optimizeAnnualContributions(
  {
    ...optimizationInputs,
    optimizationLocks: {
      annualRatePensionContribution: true,
      annualLifeAnnuityContribution: true,
      annualAgeSavingsContribution: true,
      annualFreeFundsContribution: true,
    },
  },
  asOfDate,
);
assert.equal(allContributionsLocked.status, "current-optimal");
assert.equal(allContributionsLocked.evaluatedCandidates, 1);
assert.deepEqual(
  allContributionsLocked.recommended,
  allContributionsLocked.current,
);
assert.deepEqual(allContributionsLocked.lockedContributions, {
  annualRatePensionContribution: true,
  annualLifeAnnuityContribution: true,
  annualAgeSavingsContribution: true,
  annualFreeFundsContribution: true,
});

const taxLeveragedOptimization = optimizeAnnualContributions(
  {
    ...standardInputs,
    currentAge: 25,
    retirementAge: 50,
    payoutYears: 20,
    desiredAnnualWithdrawal: 250000,
    ratePensionBalance: 0,
    lifeAnnuityBalance: 0,
    ageSavingsBalance: 0,
    freeFundsBalance: 100000,
    freeFundsCostBasis: 100000,
    askBalance: 0,
    annualRatePensionContribution: 0,
    annualLifeAnnuityContribution: 0,
    annualAgeSavingsContribution: 0,
    annualFreeFundsContribution: 100000,
    ratePensionContributionTaxRelief: 0.52,
    pensionWithdrawalTax: 0.37,
    withdrawalAfterTax: true,
  },
  asOfDate,
);
assert.ok(
  taxLeveragedOptimization.recommended.annualLifeAnnuityContribution > 0,
);
assert.ok(
  taxLeveragedOptimization.recommended.annualLifeAnnuityContribution <=
    CONTRIBUTION_LIMITS.lifeAnnuity,
);
assert.ok(taxLeveragedOptimization.recommended.annualPensionTaxSaving > 0);
const interiorTaxLeveragedCandidate = calculateFire(
  {
    ...standardInputs,
    currentAge: 25,
    retirementAge: 50,
    payoutYears: 20,
    desiredAnnualWithdrawal: 250000,
    ratePensionBalance: 0,
    lifeAnnuityBalance: 0,
    ageSavingsBalance: 0,
    freeFundsBalance: 100000,
    freeFundsCostBasis: 100000,
    askBalance: 0,
    annualRatePensionContribution: CONTRIBUTION_LIMITS.ratePension,
    annualLifeAnnuityContribution: 30000,
    annualAgeSavingsContribution: 0,
    annualFreeFundsContribution:
      100000 -
      (CONTRIBUTION_LIMITS.ratePension + 30000) * (1 - 0.52),
    ratePensionContributionTaxRelief: 0.52,
    pensionWithdrawalTax: 0.37,
    withdrawalAfterTax: true,
  },
  asOfDate,
  { includeBridgeCapacity: false },
);
assert.ok(
  taxLeveragedOptimization.recommended.fireAge <=
    interiorTaxLeveragedCandidate.fireRow.age,
);
assertClose(
  netContributionBudget(
    taxLeveragedOptimization.recommended,
    0.52,
  ),
  taxLeveragedOptimization.recommended.annualNetCost,
);
assert.ok(
  taxLeveragedOptimization.recommended.annualNetCost <=
    taxLeveragedOptimization.annualNetBudget,
);

const repeatedOptimization = optimizeAnnualContributions(
  {
    ...optimizationInputs,
    annualRatePensionContribution:
      optimizedContributions.recommended.annualRatePensionContribution,
    annualLifeAnnuityContribution:
      optimizedContributions.recommended.annualLifeAnnuityContribution,
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
    annualRatePensionContribution: 68700,
    annualAgeSavingsContribution: 20000,
    annualFreeFundsContribution: 0,
  },
  asOfDate,
);
assert.equal(overLimitOptimization.status, "limits-applied");
assert.ok(
  overLimitOptimization.recommended.annualAgeSavingsContribution <=
    CONTRIBUTION_LIMITS.ageSavings,
);
assertClose(
  netContributionBudget(
    overLimitOptimization.recommended,
    optimizationInputs.ratePensionContributionTaxRelief,
  ),
  overLimitOptimization.recommended.annualNetCost,
);
assertClose(overLimitOptimization.recommended.annualNetCost, 63200);

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

const independentPensionSplitInputs = {
  ...standardInputs,
  currentAge: 25,
  retirementAge: 50,
  payoutYears: 20,
  desiredAnnualWithdrawal: 200000,
  ratePensionBalance: 200000,
  ageSavingsBalance: 0,
  freeFundsBalance: 100000,
  freeFundsCostBasis: 100000,
  askBalance: 0,
  annualRatePensionContribution: 60000,
  annualAgeSavingsContribution: 0,
  annualFreeFundsContribution: 0,
  ratePensionContributionTaxRelief: 0.1,
  pensionWithdrawalTax: 0.5,
  returnRate: 0.1,
  inflationRate: 0.02,
  withdrawalAfterTax: true,
  freeFundsTaxation: FREE_FUNDS_TAXATION.realization,
};
const independentPensionSplit = optimizeAnnualContributions(
  independentPensionSplitInputs,
  asOfDate,
);
assert.equal(independentPensionSplit.recommended.fireAge, 45);
assertClose(
  netContributionBudget(
    independentPensionSplit.recommended,
    independentPensionSplitInputs.ratePensionContributionTaxRelief,
  ),
  independentPensionSplit.recommended.annualNetCost,
);

const ratioConstrainedPensionSplit = calculateFire(
  {
    ...independentPensionSplitInputs,
    annualRatePensionContribution: 19000,
    annualAgeSavingsContribution: 0,
    annualFreeFundsContribution: 36900,
  },
  asOfDate,
);
assert.equal(ratioConstrainedPensionSplit.fireRow.age, 46);

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

const optimizedFireTime = optimizedContributions.recommended.fireDate.getTime();
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
  const ageSavingsContribution = pensionContribution - ratePensionContribution;
  const annualFreeFundsContribution =
    optimizedContributions.annualNetBudget -
    netContributionBudget(
      {
        annualRatePensionContribution: ratePensionContribution,
        annualAgeSavingsContribution: 0,
        annualFreeFundsContribution: 0,
      },
      optimizationInputs.ratePensionContributionTaxRelief,
    ) -
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
    { includeBridgeCapacity: false },
  );

  if (candidate.fireRow) {
    assert.ok(optimizedFireTime <= candidate.fireRow.date.getTime());
  }
}

const nonDeductibleAccumulationInputs = {
  ...standardInputs,
  currentAge: 30,
  retirementAge: 31,
  payoutYears: 10,
  desiredAnnualWithdrawal: 1000000000,
  ratePensionBalance: 100,
  ratePensionNonDeductibleBasis: 20,
  ageSavingsBalance: 0,
  freeFundsBalance: 0,
  freeFundsCostBasis: 0,
  askBalance: 0,
  annualRatePensionContribution: CONTRIBUTION_LIMITS.ratePension + 100,
  annualAgeSavingsContribution: 0,
  annualFreeFundsContribution: 0,
  pensionTax: 0,
  pensionWithdrawalTax: 0.5,
  ratePensionContributionTaxRelief: 1,
  askTax: 0,
  returnRate: 0,
  inflationRate: 0.1,
  withdrawalAfterTax: true,
  redirectPensionContributionsToFreeFunds: false,
};
const inflationLinkedNonDeductible = calculateFire(
  {
    ...nonDeductibleAccumulationInputs,
    contributionsFollowInflation: true,
  },
  asOfDate,
  { includeBridgeCapacity: false },
);
const fixedNominalNonDeductible = calculateFire(
  {
    ...nonDeductibleAccumulationInputs,
    contributionsFollowInflation: false,
  },
  asOfDate,
  { includeBridgeCapacity: false },
);
const inflationLinkedRetirement = inflationLinkedNonDeductible.planRows.find(
  (row) => row.age === 31,
);
const fixedNominalRetirement = fixedNominalNonDeductible.planRows.find(
  (row) => row.age === 31,
);
assertClose(
  inflationLinkedRetirement.ratePensionNonDeductibleBasis,
  20 / 1.1 + 100 / Math.sqrt(1.1),
);
assertClose(fixedNominalRetirement.ratePensionNonDeductibleBasis, 120 / 1.1);
assertClose(inflationLinkedNonDeductible.annualNetContributionBudget, 100);

const nonDeductiblePayoutInputs = {
  ...nonDeductibleAccumulationInputs,
  desiredAnnualWithdrawal: 70,
  ratePensionBalance: 1000,
  ratePensionNonDeductibleBasis: 400,
  annualRatePensionContribution: 0,
  inflationRate: 0,
};
const nonDeductiblePayout = calculateFire(nonDeductiblePayoutInputs, asOfDate, {
  includeBridgeCapacity: false,
});
const nonDeductiblePayoutRows = nonDeductiblePayout.planRows.filter(
  (row) => row.phase === "Pension" && row.withdrawal > 0,
);
assert.equal(nonDeductiblePayoutRows.length, 10);
nonDeductiblePayoutRows.forEach((row, index) => {
  assertClose(row.withdrawal, 100);
  assertClose(row.taxFreeRatePensionWithdrawal, 40);
  assertClose(row.taxableRatePensionWithdrawal, 60);
  assertClose(row.pensionWithdrawalTax, 30);
  assertClose(row.netWithdrawal, 70);
  assertClose(row.ratePensionNonDeductibleBasis, 400 - index * 40);
});
assertClose(nonDeductiblePayout.totalPensionWithdrawalTax, 300);
assertClose(nonDeductiblePayout.finalRow.ratePension, 0);
assertClose(nonDeductiblePayout.finalRow.ratePensionNonDeductibleBasis, 0);
assertClose(nonDeductiblePayout.requiredAtRetirement, 1000);

const inflationVaryingAllowanceInputs = {
  ...nonDeductiblePayoutInputs,
  desiredAnnualWithdrawal: 70,
  ratePensionBalance: 1000,
  ratePensionNonDeductibleBasis: 400,
  pensionTax: 0,
  returnRate: 0.12,
  inflationRate: 0.1,
};
const inflationVaryingAllowance = calculateFire(
  inflationVaryingAllowanceInputs,
  asOfDate,
  { includeBridgeCapacity: false },
);
const inflationRetirementRow = inflationVaryingAllowance.planRows.find(
  (row) => row.age === inflationVaryingAllowanceInputs.retirementAge,
);
const inflationRateShare =
  inflationRetirementRow.ratePension /
  (inflationRetirementRow.ratePension + inflationRetirementRow.ageSavings);
const firstRealTaxFreeAllowance =
  inflationRetirementRow.ratePensionNonDeductibleBasis /
  inflationVaryingAllowanceInputs.payoutYears;
let independentlySummedPensionTarget = 0;
for (
  let period = 0;
  period < inflationVaryingAllowanceInputs.payoutYears;
  period += 1
) {
  const realTaxFreeAllowance =
    firstRealTaxFreeAllowance /
    Math.pow(1 + inflationVaryingAllowanceInputs.inflationRate, period);
  const grossWithdrawal =
    (inflationVaryingAllowanceInputs.desiredAnnualWithdrawal -
      inflationVaryingAllowanceInputs.pensionWithdrawalTax *
        realTaxFreeAllowance) /
    (1 -
      inflationVaryingAllowanceInputs.pensionWithdrawalTax *
        inflationRateShare);
  independentlySummedPensionTarget +=
    grossWithdrawal /
    Math.pow(1 + inflationVaryingAllowance.realPensionReturn, period);
}
assertClose(
  inflationVaryingAllowance.requiredAtRetirement,
  independentlySummedPensionTarget,
);
assert.ok(
  inflationVaryingAllowance.requiredAtRetirement >
    ((inflationVaryingAllowanceInputs.desiredAnnualWithdrawal -
      inflationVaryingAllowanceInputs.pensionWithdrawalTax *
        firstRealTaxFreeAllowance) /
      (1 -
        inflationVaryingAllowanceInputs.pensionWithdrawalTax *
          inflationRateShare)) *
      inflationVaryingAllowanceInputs.payoutYears,
);

const exactInflationBasisCoast = calculateFire(
  {
    ...inflationVaryingAllowanceInputs,
    ratePensionBalance:
      independentlySummedPensionTarget /
      (1 + inflationVaryingAllowance.realPensionReturn),
  },
  asOfDate,
  { includeBridgeCapacity: false },
);
assert.equal(exactInflationBasisCoast.pensionCoastRow.age, 30);
assert.equal(exactInflationBasisCoast.isFullyFunded, true);
assertClose(exactInflationBasisCoast.finalRow.ratePension, 0, 0.02);
const exactInflationPayoutRows = exactInflationBasisCoast.planRows.filter(
  (row) => row.phase === "Pension" && row.withdrawal > 0,
);
assert.ok(
  exactInflationPayoutRows[1].taxFreeRatePensionWithdrawal <
    exactInflationPayoutRows[0].taxFreeRatePensionWithdrawal,
);

const beforeTaxNonDeductiblePayout = calculateFire(
  {
    ...nonDeductiblePayoutInputs,
    desiredAnnualWithdrawal: 100,
    withdrawalAfterTax: false,
  },
  asOfDate,
  { includeBridgeCapacity: false },
);
const firstBeforeTaxNonDeductiblePayout =
  beforeTaxNonDeductiblePayout.planRows.find((row) => row.phase === "Pension");
assertClose(firstBeforeTaxNonDeductiblePayout.withdrawal, 100);
assertClose(firstBeforeTaxNonDeductiblePayout.taxFreeRatePensionWithdrawal, 40);
assertClose(firstBeforeTaxNonDeductiblePayout.taxableRatePensionWithdrawal, 60);
assertClose(firstBeforeTaxNonDeductiblePayout.pensionWithdrawalTax, 30);
assertClose(firstBeforeTaxNonDeductiblePayout.netWithdrawal, 70);
assertClose(beforeTaxNonDeductiblePayout.requiredAtRetirement, 1000);

const nonDeductiblePalGrowth = calculateFire(
  {
    ...nonDeductibleAccumulationInputs,
    ratePensionNonDeductibleBasis: 20,
    pensionTax: 0.2,
    returnRate: 0.1,
    inflationRate: 0,
  },
  asOfDate,
  { includeBridgeCapacity: false },
);
const nonDeductiblePalRetirement = nonDeductiblePalGrowth.planRows.find(
  (row) => row.age === 31,
);
assertClose(
  nonDeductiblePalRetirement.ratePension,
  100 * 1.08 + (CONTRIBUTION_LIMITS.ratePension + 100) * Math.sqrt(1.08),
);
assertClose(nonDeductiblePalRetirement.ratePensionNonDeductibleBasis, 120);

const zeroPensionTaxWithBasis = calculateFire(
  {
    ...nonDeductiblePayoutInputs,
    desiredAnnualWithdrawal: 100,
    pensionWithdrawalTax: 0,
  },
  asOfDate,
  { includeBridgeCapacity: false },
);
assertClose(zeroPensionTaxWithBasis.totalPensionWithdrawalTax, 0);
assert.equal(zeroPensionTaxWithBasis.isFullyFunded, true);

const fullPensionTaxWithBasis = calculateFire(
  {
    ...nonDeductiblePayoutInputs,
    desiredAnnualWithdrawal: 41,
    pensionWithdrawalTax: 1,
  },
  asOfDate,
  { includeBridgeCapacity: false },
);
const firstFullTaxPayout = fullPensionTaxWithBasis.planRows.find(
  (row) => row.phase === "Pension",
);
assert.equal(fullPensionTaxWithBasis.requiredAtRetirement, null);
assert.equal(fullPensionTaxWithBasis.isFullyFunded, false);
assertClose(firstFullTaxPayout.taxFreeRatePensionWithdrawal, 40);
assertClose(firstFullTaxPayout.taxableRatePensionWithdrawal, 60);
assertClose(firstFullTaxPayout.pensionWithdrawalTax, 60);
assertClose(firstFullTaxPayout.netWithdrawal, 40);

const ageSavingsExcessRedirect = calculateFire(
  {
    ...nonDeductibleAccumulationInputs,
    payoutYears: 1,
    ratePensionBalance: 0,
    ratePensionNonDeductibleBasis: 0,
    annualRatePensionContribution: 0,
    annualAgeSavingsContribution: 12000,
    inflationRate: 0,
  },
  asOfDate,
  { includeBridgeCapacity: false },
);
const ageSavingsRedirectRetirement = ageSavingsExcessRedirect.planRows.find(
  (row) => row.age === 31,
);
assertClose(ageSavingsRedirectRetirement.ageSavings, 9900);
assertClose(ageSavingsRedirectRetirement.freeFunds, 2100);
assertClose(
  ageSavingsExcessRedirect.annualAgeSavingsContributionRedirected,
  2100,
);
assertClose(
  ageSavingsExcessRedirect.effectiveAnnualAgeSavingsContribution,
  9900,
);
assertClose(ageSavingsExcessRedirect.annualNetContributionBudget, 12000);

const highAgeSavingsExcessRedirect = calculateFire(
  {
    ...nonDeductibleAccumulationInputs,
    payoutYears: 1,
    ratePensionBalance: 0,
    ratePensionNonDeductibleBasis: 0,
    annualRatePensionContribution: 0,
    annualAgeSavingsContribution: 65000,
    ageSavingsContributionLimit: CONTRIBUTION_LIMITS.ageSavingsHigh,
    inflationRate: 0,
  },
  asOfDate,
  { includeBridgeCapacity: false },
);
const highAgeSavingsRedirectRetirement =
  highAgeSavingsExcessRedirect.planRows.find((row) => row.age === 31);
assertClose(highAgeSavingsRedirectRetirement.ageSavings, 64200);
assertClose(highAgeSavingsRedirectRetirement.freeFunds, 800);
assertClose(
  highAgeSavingsExcessRedirect.annualAgeSavingsContributionRedirected,
  800,
);

const redirectedAfterCoast = calculateFire(
  {
    ...nonDeductibleAccumulationInputs,
    retirementAge: 35,
    ratePensionBalance: 1000000000,
    ratePensionNonDeductibleBasis: 0,
    annualRatePensionContribution: CONTRIBUTION_LIMITS.ratePension + 20,
    annualAgeSavingsContribution: 12000,
    annualFreeFundsContribution: 30,
    desiredAnnualWithdrawal: 100,
    inflationRate: 0,
    withdrawalAfterTax: false,
    redirectPensionContributionsToFreeFunds: true,
  },
  asOfDate,
  { includeBridgeCapacity: false },
);
assert.equal(redirectedAfterCoast.pensionCoastRow.age, 30);
const firstPostCoastRow = redirectedAfterCoast.planRows.find(
  (row) => row.age === 31,
);
assertClose(firstPostCoastRow.freeFunds, 12050);
assertClose(firstPostCoastRow.ageSavings, 0);
assertClose(firstPostCoastRow.ratePensionNonDeductibleBasis, 0);
assertClose(redirectedAfterCoast.annualNetContributionBudget, 12050);

const fireBasisInputs = {
  ...nonDeductibleAccumulationInputs,
  retirementAge: 40,
  desiredAnnualWithdrawal: 100,
  ratePensionBalance: 1100,
  ratePensionNonDeductibleBasis: 0,
  freeFundsBalance: 200,
  freeFundsCostBasis: 200,
  annualRatePensionContribution: 0,
  annualFreeFundsContribution: 50,
  inflationRate: 0,
};
const taxableFirePension = calculateFire(fireBasisInputs, asOfDate, {
  includeBridgeCapacity: false,
});
const taxFreeBasisFirePension = calculateFire(
  { ...fireBasisInputs, ratePensionNonDeductibleBasis: 1100 },
  asOfDate,
  { includeBridgeCapacity: false },
);
assert.equal(taxableFirePension.pensionCoastRow, null);
assert.equal(taxFreeBasisFirePension.pensionCoastRow.age, 30);
assert.equal(taxableFirePension.fireRow.age, 39);
assert.equal(taxFreeBasisFirePension.fireRow.age, 36);

const combinedRateOptimization = optimizeAnnualContributions(
  {
    ...optimizationInputs,
    annualRatePensionContribution: CONTRIBUTION_LIMITS.ratePension + 5000,
  },
  asOfDate,
);
assertClose(
  combinedRateOptimization.annualNetBudget,
  netContributionBudget(
    {
      ...optimizationInputs,
      annualRatePensionContribution: CONTRIBUTION_LIMITS.ratePension + 5000,
    },
    optimizationInputs.ratePensionContributionTaxRelief,
  ),
);
assertClose(
  combinedRateOptimization.current.annualRatePensionContribution,
  CONTRIBUTION_LIMITS.ratePension + 5000,
);
assert.ok(
  combinedRateOptimization.recommended.fireAge <=
    combinedRateOptimization.current.fireAge,
);
assertClose(
  combinedRateOptimization.limits.ratePension,
  CONTRIBUTION_LIMITS.ratePension,
);
assertClose(
  netContributionBudget(
    combinedRateOptimization.recommended,
    optimizationInputs.ratePensionContributionTaxRelief,
  ),
  combinedRateOptimization.recommended.annualNetCost,
);

const variableStrategyInputs = {
  currentAge: 40,
  retirementAge: 50,
  payoutYears: 20,
  desiredAnnualWithdrawal: 200000,
  ratePensionBalance: 2000000,
  lifeAnnuityBalance: 0,
  ageSavingsBalance: 0,
  freeFundsBalance: 500000,
  freeFundsCostBasis: 500000,
  askBalance: 0,
  annualRatePensionContribution: 0,
  annualLifeAnnuityContribution: 0,
  annualAgeSavingsContribution: 0,
  annualFreeFundsContribution: 100000,
  pensionTax: 0.153,
  pensionWithdrawalTax: 0.37,
  askTax: 0.17,
  returnRate: 0.07,
  defensiveReturnRate: 0.03,
  returnStrategy: RETURN_STRATEGY.riskTent,
  returnDeclineYears: 10,
  returnRecoveryYears: 20,
  inflationRate: 0.02,
  withdrawalAfterTax: false,
};
const fireWithinTenYears = calculateFire(variableStrategyInputs, asOfDate, {
  includeBridgeCapacity: false,
});
assert.equal(fireWithinTenYears.fireRow.age, 48);
assert.deepEqual(fireWithinTenYears.returnAnchors, {
  freeFunds: 48,
  pension: 50,
});
assertClose(
  fireWithinTenYears.realPensionReturn,
  (1 + 0.07 * (1 - variableStrategyInputs.pensionTax)) / 1.02 - 1,
  1e-12,
);
assertClose(
  fireWithinTenYears.defensiveRealPensionReturn,
  (1 + 0.03 * (1 - variableStrategyInputs.pensionTax)) / 1.02 - 1,
  1e-12,
);
assert.ok(
  fireWithinTenYears.planRows.some((row) => row.withdrawal > 0),
);
assert.equal(fireWithinTenYears.isFullyFunded, true);
const fireStartProfileRow = fireWithinTenYears.planRows.find(
  (row) => row.age === fireWithinTenYears.fireRow.age,
);
assertClose(fireStartProfileRow.freeFundsReturnRate, 0.03, 1e-12);
assertClose(
  fireStartProfileRow.pensionReturnRate,
  strategyReturnRate(0.07, 0.03, RETURN_STRATEGY.riskTent, 8, 10, 10, 20),
  1e-12,
);
const fireStartPensionBalance =
  fireStartProfileRow.ratePension +
  fireStartProfileRow.lifeAnnuity +
  fireStartProfileRow.ageSavings;
const fireStartFreeBalance =
  fireStartProfileRow.freeFunds + fireStartProfileRow.ask;
assertClose(
  fireStartProfileRow.averageReturnRate,
  (fireStartPensionBalance * fireStartProfileRow.pensionReturnRate +
    fireStartFreeBalance * fireStartProfileRow.freeFundsReturnRate) /
    fireStartProfileRow.totalBalance,
  1e-12,
);
assert.ok(
  fireWithinTenYears.planRows
    .slice(0, -1)
    .every(
      (row) =>
        Number.isFinite(row.pensionReturnRate) &&
        Number.isFinite(row.freeFundsReturnRate),
    ),
);
assert.equal(fireWithinTenYears.finalRow.pensionReturnRate, null);
assert.equal(fireWithinTenYears.finalRow.freeFundsReturnRate, null);
assert.equal(fireWithinTenYears.finalRow.averageReturnRate, null);

const customReturnPeriods = calculateFire(
  {
    ...variableStrategyInputs,
    returnDeclineYears: 4,
    returnRecoveryYears: 6,
  },
  asOfDate,
  { includeBridgeCapacity: false },
);
assert.equal(customReturnPeriods.returnDeclineYears, 4);
assert.equal(customReturnPeriods.returnRecoveryYears, 6);
assert.equal(
  customReturnPeriods.returnAnchors.freeFunds,
  customReturnPeriods.fireRow?.age ?? variableStrategyInputs.retirementAge,
);

const noFireBeforeRetirement = calculateFire(
  {
    ...variableStrategyInputs,
    freeFundsBalance: 0,
    freeFundsCostBasis: 0,
  },
  asOfDate,
  { includeBridgeCapacity: false },
);
assert.equal(noFireBeforeRetirement.fireRow.age, 50);
assert.deepEqual(noFireBeforeRetirement.returnAnchors, {
  freeFunds: 50,
  pension: 50,
});

const fireNow = calculateFire(
  {
    ...variableStrategyInputs,
    desiredAnnualWithdrawal: 100000,
    ratePensionBalance: 5000000,
    freeFundsBalance: 5000000,
    freeFundsCostBasis: 5000000,
    annualFreeFundsContribution: 0,
  },
  asOfDate,
  { includeBridgeCapacity: false },
);
assert.equal(fireNow.fireRow.age, 40);
assert.deepEqual(fireNow.returnAnchors, { freeFunds: 40, pension: 50 });

const decliningReturn = calculateFire(
  {
    ...variableStrategyInputs,
    returnStrategy: RETURN_STRATEGY.declining,
    freeFundsInventoryShare: 0.5,
    withdrawalAfterTax: true,
  },
  asOfDate,
  { includeBridgeCapacity: false },
);
assertFiniteResult(decliningReturn);
assert.equal(decliningReturn.returnStrategy, RETURN_STRATEGY.declining);
assert.ok(decliningReturn.requiredAtRetirement > 0);
assert.ok(decliningReturn.totalPensionWithdrawalTax > 0);
assert.ok(decliningReturn.totalFreeFundsTax >= 0);

for (const strategy of [
  RETURN_STRATEGY.declining,
  RETURN_STRATEGY.riskTent,
]) {
  const lockedOptimization = optimizeAnnualContributions(
    {
      ...variableStrategyInputs,
      returnStrategy: strategy,
      returnDeclineYears: 4,
      returnRecoveryYears: 6,
      optimizationLocks: {
        annualRatePensionContribution: true,
        annualLifeAnnuityContribution: true,
        annualAgeSavingsContribution: true,
        annualFreeFundsContribution: true,
      },
    },
    asOfDate,
  );
  assert.equal(
    lockedOptimization.current.fireAge,
    calculateFire(
      {
        ...variableStrategyInputs,
        returnStrategy: strategy,
        returnDeclineYears: 4,
        returnRecoveryYears: 6,
      },
      asOfDate,
      { includeBridgeCapacity: false },
    ).fireRow.age,
  );
  assert.ok(lockedOptimization.recommended);
}

let randomState = 0x51f15e;
function random() {
  randomState = (1664525 * randomState + 1013904223) >>> 0;
  return randomState / 0x100000000;
}

function randomBetween(minimum, maximum) {
  return minimum + random() * (maximum - minimum);
}

const randomizedScenarioCount = Number(
  process.env.FIRE_RANDOM_SCENARIOS ?? 2000,
);
for (let scenario = 0; scenario < randomizedScenarioCount; scenario += 1) {
  const currentAge = Math.floor(randomBetween(18, 71));
  const retirementAge = currentAge + Math.floor(randomBetween(1, 51));
  const ratePensionBalance = randomBetween(0, 5000000);
  const freeFundsBalance = randomBetween(0, 5000000);
  const annualRatePensionContribution = randomBetween(
    0,
    CONTRIBUTION_LIMITS.ratePension + 80000,
  );
  const randomized = calculateFire(
    {
      currentAge,
      retirementAge,
      payoutYears: Math.floor(randomBetween(10, 31)),
      desiredAnnualWithdrawal: randomBetween(0, 1000000),
      ratePensionBalance,
      lifeAnnuityBalance: randomBetween(0, 5000000),
      ratePensionNonDeductibleBasis: randomBetween(0, ratePensionBalance * 1.5),
      ageSavingsBalance: randomBetween(0, 1000000),
      freeFundsBalance,
      freeFundsCostBasis: randomBetween(0, freeFundsBalance),
      askBalance: randomBetween(0, 2000000),
      annualRatePensionContribution,
      annualLifeAnnuityContribution: randomBetween(0, 100000),
      annualAgeSavingsContribution: randomBetween(0, 50000),
      annualFreeFundsContribution: randomBetween(0, 250000),
      pensionTax: randomBetween(0, 0.5),
      ratePensionContributionTaxRelief: randomBetween(0, 0.6),
      pensionWithdrawalTax: randomBetween(0, 0.6),
      askTax: randomBetween(0, 0.5),
      returnRate: randomBetween(0, 0.3),
      inflationRate: randomBetween(-0.1, 0.15),
      withdrawalAfterTax: random() >= 0.5,
      contributionsFollowInflation: random() >= 0.5,
      redirectPensionContributionsToFreeFunds: random() >= 0.5,
    },
    asOfDate,
    { includeBridgeCapacity: false },
  );

  assertFiniteResult(randomized);
  randomized.rows.forEach((milestone) => {
    const planRow = randomized.planRows.find(
      (row) => row.age === milestone.age,
    );
    assert.ok(planRow);
    assertClose(planRow.ratePension, milestone.ratePension);
    assertClose(planRow.lifeAnnuity, milestone.lifeAnnuity);
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
    assert.ok(randomized.planRows.some((row) => row.withdrawalShortfall));
  }
}

console.log("FIRE-beregnerens årlige beregningstest bestod.");
