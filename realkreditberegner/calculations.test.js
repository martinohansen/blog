const assert = require("node:assert/strict");

global.window = global;
require("./data.js");
require("./calculations.js");

const { fairComparison } = global.RealkreditCalculations;

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
  cumulativeFreed: 1232500,
});
assert.equal(netFinal.result, netFinal.nettoAfkast);

const grossSingle = comparison({ showNet: false });
const grossMultiple = comparison({ investOwners: 5, showNet: false });
const grossCouple = comparison({ taxHousehold: "couple", showNet: false });
assert.deepEqual(grossMultiple, grossSingle);
assert.deepEqual(grossCouple, grossSingle);

const netMultiple = comparison({ investOwners: 5 });
const netCouple = comparison({ taxHousehold: "couple" });
assert.notEqual(netMultiple.at(-1).result, netFinal.result);
assert.notEqual(netCouple.at(-1).result, netFinal.result);

grossSingle.forEach((point) => {
  assert.equal(point.result, point.nettoAfkast);
});

console.log("Realkredit calculation tests passed");
