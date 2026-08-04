const assert = require("node:assert/strict");
const {
  annualEndWithdrawalFromBalance,
  annualWithdrawalFromBalance,
  calculateFire,
  getAge,
  presentValueOfWithdrawals,
  yearsBetween,
} = require("./calculations.js");

const asOfDate = new Date(2026, 7, 4);
const DAY_MS = 24 * 60 * 60 * 1000;

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

assert.equal(getAge(new Date(1994, 3, 27), asOfDate), 32);
assert.equal(getAge(new Date(1994, 8, 27), asOfDate), 31);
assert.equal(presentValueOfWithdrawals(0, 10, 100000), 1000000);
assert.equal(annualWithdrawalFromBalance(1000000, 0, 10), 100000);
assert.equal(annualEndWithdrawalFromBalance(1000000, 0, 10), 100000);
assertClose(
  yearsBetween(new Date(2026, 0, 1), new Date(2027, 0, 1)),
  365 / 365.2425,
  1e-12,
);

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
assert.ok(Math.abs(result.realPensionReturn - 0.04584878) < 0.000001);
assert.ok(Number.isFinite(result.requiredAtRetirement));
assert.ok(result.pensionCoastRow);
assert.ok(result.pensionStopRow);
assert.ok(result.fireRow);
assert.ok(result.pensionCoastRow.date <= result.fireRow.date);
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

const inflationAdjustedContributions = calculateFire(standardInputs, asOfDate);
const fixedNominalContributions = calculateFire(
  { ...standardInputs, contributionsFollowInflation: false },
  asOfDate,
);
assert.ok(
  fixedNominalContributions.planRows[1].contribution <
    inflationAdjustedContributions.planRows[1].contribution,
);

assert.throws(
  () => calculateFire({ ...standardInputs, retirementAge: 70.5 }, asOfDate),
  /Pensionsalderen skal være et helt tal/,
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
    birthDate: new Date(1996, 7, 4),
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
assert.equal(exactDepletion.isFullyFunded, true);
assertClose(exactDepletion.finalRow.totalBalance, 0, 1e-7);

const birthdayToday = calculateFire(
  { ...standardInputs, birthDate: new Date(1994, 7, 4) },
  asOfDate,
);
const birthdayTomorrow = calculateFire(
  { ...standardInputs, birthDate: new Date(1994, 7, 5) },
  asOfDate,
);
assert.ok(
  Math.abs(
    birthdayTomorrow.yearsToRetirement - birthdayToday.yearsToRetirement,
  ) < 0.01,
);
assert.equal(
  Math.round(
    (birthdayTomorrow.retirementDate - birthdayToday.retirementDate) / DAY_MS,
  ),
  1,
);

const beforeBirthday = calculateFire(
  standardInputs,
  new Date(2026, 3, 26),
);
const onBirthday = calculateFire(standardInputs, new Date(2026, 3, 27));
const afterBirthday = calculateFire(
  standardInputs,
  new Date(2026, 3, 28),
);
assert.ok(
  Math.abs(
    beforeBirthday.yearsToRetirement -
      onBirthday.yearsToRetirement -
      1 / 365.2425,
  ) < 1e-10,
);
assert.ok(
  Math.abs(
    onBirthday.yearsToRetirement -
      afterBirthday.yearsToRetirement -
      1 / 365.2425,
  ) < 1e-10,
);

const leapBirth = calculateFire(
  {
    ...standardInputs,
    birthDate: new Date(1996, 1, 29),
    retirementAge: 31,
    payoutYears: 2,
    ratePensionBalance: 0,
    annualRatePensionContribution: 0,
  },
  new Date(2026, 2, 1),
);
assert.equal(leapBirth.retirementDate.getFullYear(), 2027);
assert.equal(leapBirth.retirementDate.getMonth(), 1);
assert.equal(leapBirth.retirementDate.getDate(), 28);

const midyearFire = calculateFire(
  {
    ...standardInputs,
    birthDate: new Date(1996, 7, 4),
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
assert.ok(Math.abs(midyearFire.fireRow.exactAge - 30.5) < 0.01);
assert.ok(midyearFire.fireRow.date < new Date(2027, 7, 4));
assert.equal(midyearFire.isFullyFunded, true);
assert.equal(
  midyearFire.planRows.filter((row) => row.withdrawalShortfall).length,
  0,
);

const pensionStopBetweenAnniversaries = calculateFire(
  {
    ...standardInputs,
    birthDate: new Date(1996, 7, 4),
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
assert.ok(
  Math.abs(pensionStopBetweenAnniversaries.pensionCoastRow.exactAge - 36.6667) <
    0.01,
);
assertClose(
  pensionStopBetweenAnniversaries.pensionCoastRow.ratePension,
  1000,
  0.5,
);
assert.ok(pensionStopBetweenAnniversaries.finalRow.totalBalance < 0.5);

function calculateExactlyFundedPension(returnRate, birthDate, calculationDate) {
  const baseInputs = {
    ...standardInputs,
    birthDate,
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
  const empty = calculateFire(baseInputs, calculationDate);
  const ageSavingsBalance =
    empty.requiredAtRetirement /
    Math.pow(1 + returnRate, empty.yearsToRetirement);
  return calculateFire(
    { ...baseInputs, ageSavingsBalance },
    calculationDate,
  );
}

[
  calculateExactlyFundedPension(
    0,
    new Date(1994, 3, 27),
    new Date(2026, 7, 4),
  ),
  calculateExactlyFundedPension(
    0.05,
    new Date(1994, 3, 27),
    new Date(2026, 7, 4),
  ),
  calculateExactlyFundedPension(
    -0.02,
    new Date(1996, 1, 29),
    new Date(2026, 2, 1),
  ),
].forEach((calculation) => {
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
    birthDate: new Date(1996, 7, 4),
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
  sameDay(
    freeFundedFire.pensionStopRow.date,
    freeFundedFire.fireRow.date,
  ),
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

console.log("FIRE-beregnerens beregningstest bestod.");
