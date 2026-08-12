const assert = require("node:assert/strict");

global.window = global;
require("./data.js");
require("./calculations.js");

const {
  buildInvestmentData,
  fairComparison,
  isInterestOnlyEligible,
} = global.RealkreditCalculations;

function comparison({
  taxHousehold = "single",
  investOwners = 1,
  showNet = true,
} = {}) {
  return fairComparison(
    "fast",
    4,
    3000000,
    7,
    15,
    taxHousehold,
    investOwners,
    60,
    showNet,
  );
}

function assertAccountingIdentities(points) {
  points.forEach((point) => {
    assert.ok(Math.abs(point.portfolio - point.invested - point.afkast) <= 1);
    assert.ok(Math.abs(point.result - (point.portfolio - point.equityBuilt)) <= 1);
    assert.ok(Math.abs(point.result - (point.afkast - point.extraCost)) <= 1);
  });
}

const netFinal = comparison().at(-1);
assert.deepEqual(netFinal, {
  year: 15,
  afkast: 400350,
  extraCost: 238918,
  result: 161432,
  nettoAfkast: 161432,
  invested: 832150,
  equityBuilt: 1071068,
  portfolio: 1232500,
  freedYearly: 58270,
});
assert.equal(netFinal.result, netFinal.nettoAfkast);
assert.equal("cumulativeFreed" in netFinal, false);
assertAccountingIdentities(comparison());

assert.equal(isInterestOnlyEligible(60), true);
assert.equal(isInterestOnlyEligible(60.01), false);
assert.deepEqual(
  fairComparison("fast", 4, 3000000, 7, 15, "single", 1, 61, true),
  [],
);
assert.deepEqual(
  buildInvestmentData(
    global.RealkreditData.LOAN_TYPES,
    3000000,
    7,
    15,
    "single",
    1,
    61,
    true,
  ),
  {},
);

const grossSingle = comparison({ showNet: false });
const grossMultiple = comparison({ investOwners: 5, showNet: false });
const grossCouple = comparison({ taxHousehold: "couple", showNet: false });
assert.deepEqual(grossMultiple, grossSingle);
assert.deepEqual(grossCouple, grossSingle);
assertAccountingIdentities(grossSingle);

const netMultiple = comparison({ investOwners: 5 });
const netCouple = comparison({ taxHousehold: "couple" });
assert.notEqual(netMultiple.at(-1).result, netFinal.result);
assert.notEqual(netCouple.at(-1).result, netFinal.result);

grossSingle.forEach((point) => {
  assert.equal(point.result, point.nettoAfkast);
});

console.log("Realkredit calculation tests passed");
