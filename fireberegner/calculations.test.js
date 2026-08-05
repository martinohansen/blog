const assert = require("node:assert/strict");
const { calculateFire } = require("./calculations.js");

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
  });
}

const standardInputs = {
  currentAge: 32,
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
assert.equal(result.fireRow.age, 64);
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
  () => calculateFire({ ...standardInputs, freeFundsTax: 3 }, asOfDate),
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
    freeFundsTax: 0,
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
    freeFundsTax: 0,
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
    freeFundsTax: 0,
    returnRate: 0,
    inflationRate: 0,
  },
  asOfDate,
);
assert.equal(annualPensionStop.pensionCoastRow.age, 37);
assert.equal(annualPensionStop.pensionStopRow.age, 37);
assertClose(annualPensionStop.pensionCoastRow.ratePension, 1050);
assertClose(annualPensionStop.finalRow.totalBalance, 50);

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
    freeFundsTax: 0,
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
    freeFundsTax: 0,
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
    freeFundsTax: 0,
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
    freeFundsTax: 0,
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
      askBalance: randomBetween(0, 2000000),
      annualRatePensionContribution: randomBetween(0, 150000),
      annualAgeSavingsContribution: randomBetween(0, 50000),
      annualFreeFundsContribution: randomBetween(0, 250000),
      pensionTax: randomBetween(0, 0.5),
      askTax: randomBetween(0, 0.5),
      freeFundsTax: randomBetween(0, 0.5),
      returnRate: randomBetween(-0.2, 0.3),
      inflationRate: randomBetween(-0.1, 0.15),
      contributionsFollowInflation: random() >= 0.5,
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
