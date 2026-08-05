(function (root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  root.FireCalculations = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const MONEY_TOLERANCE = 0.01;
  const CALCULATION_TOLERANCE = 1e-7;

  const RATE_PENSION = 0;
  const AGE_SAVINGS = 1;
  const FREE_FUNDS = 2;
  const ASK = 3;

  function calculationError() {
    return new Error(
      "Forudsætningerne giver tal, der er for store til at beregne.",
    );
  }

  function assertFinite(...values) {
    if (values.some((value) => !Number.isFinite(value))) {
      throw calculationError();
    }
  }

  function normalizeDate(date) {
    if (!(date instanceof Date) || !Number.isFinite(date.getTime())) {
      throw calculationError();
    }

    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
  }

  function daysInMonth(year, month) {
    return new Date(year, month + 1, 0).getDate();
  }

  function annualDate(anchorDate, yearOffset) {
    const targetYear = anchorDate.getFullYear() + yearOffset;
    const month = anchorDate.getMonth();
    const day = Math.min(
      anchorDate.getDate(),
      daysInMonth(targetYear, month),
    );
    const date = new Date(targetYear, month, day, 12);

    if (!Number.isFinite(date.getTime())) {
      throw calculationError();
    }

    return date;
  }

  function presentValueFactor(rate, periods) {
    let factor = 0;
    let growth = 1;

    for (let period = 0; period < periods; period += 1) {
      factor += 1 / growth;
      growth *= 1 + rate;
      assertFinite(factor, growth);
    }

    return factor;
  }

  function annualCapacity(balance, rate, periods) {
    if (balance <= 0 || periods <= 0) {
      return 0;
    }

    const factor = presentValueFactor(rate, periods);
    const capacity = factor > 0 ? balance / factor : 0;
    assertFinite(capacity);
    return capacity;
  }

  function allocateWithdrawals(capacities, desiredWithdrawal) {
    const totalCapacity = capacities.reduce((total, value) => total + value, 0);
    const total = Math.min(desiredWithdrawal, totalCapacity);
    assertFinite(totalCapacity, total);

    if (totalCapacity <= 0) {
      return { amounts: capacities.map(() => 0), total: 0 };
    }

    const amounts = capacities.map(
      (capacity) => total * (capacity / totalCapacity),
    );
    assertFinite(...amounts);
    return { amounts, total };
  }

  function allocateForPhase(
    balances,
    rates,
    desiredWithdrawal,
    periods,
    beforeRetirement,
  ) {
    if (beforeRetirement) {
      const freeIndexes = [FREE_FUNDS, ASK];
      const allocation = allocateWithdrawals(
        freeIndexes.map((index) =>
          annualCapacity(balances[index], rates[index], periods),
        ),
        desiredWithdrawal,
      );

      return {
        amounts: [0, 0, ...allocation.amounts],
        total: allocation.total,
      };
    }

    const pensionIndexes = [RATE_PENSION, AGE_SAVINGS];
    const freeIndexes = [FREE_FUNDS, ASK];
    const pensionAllocation = allocateWithdrawals(
      pensionIndexes.map((index) =>
        annualCapacity(balances[index], rates[index], periods),
      ),
      desiredWithdrawal,
    );
    const freeAllocation = allocateWithdrawals(
      freeIndexes.map((index) =>
        annualCapacity(balances[index], rates[index], periods),
      ),
      desiredWithdrawal - pensionAllocation.total,
    );

    return {
      amounts: [...pensionAllocation.amounts, ...freeAllocation.amounts],
      total: pensionAllocation.total + freeAllocation.total,
    };
  }

  function growBalances(balances, rates) {
    const grown = balances.map((balance, index) =>
      Math.max(0, balance * (1 + rates[index])),
    );
    assertFinite(...grown);
    return grown;
  }

  function createRow(age, date, balances, values = {}) {
    const totalBalance = balances.reduce(
      (total, balance) => total + balance,
      0,
    );
    const row = {
      age,
      date: new Date(date),
      phase: "Opsparing",
      ratePension: balances[RATE_PENSION],
      ageSavings: balances[AGE_SAVINGS],
      freeFunds: balances[FREE_FUNDS],
      ask: balances[ASK],
      totalBalance,
      contribution: 0,
      withdrawal: 0,
      withdrawalSource: "—",
      withdrawalShortfall: false,
      ...values,
    };

    Object.values(row)
      .filter((value) => typeof value === "number")
      .forEach((value) => assertFinite(value));
    return row;
  }

  function assertInputs(inputs) {
    const amounts = [
      "ratePensionBalance",
      "ageSavingsBalance",
      "freeFundsBalance",
      "askBalance",
      "annualRatePensionContribution",
      "annualAgeSavingsContribution",
      "annualFreeFundsContribution",
      "desiredAnnualWithdrawal",
    ];
    const taxes = ["pensionTax", "askTax", "freeFundsTax"];

    if (!Number.isInteger(inputs.currentAge) || inputs.currentAge < 0) {
      throw new Error("Din nuværende alder skal være et helt tal.");
    }

    if (
      !Number.isInteger(inputs.retirementAge) ||
      inputs.retirementAge <= inputs.currentAge
    ) {
      throw new Error(
        "Pensionsalderen skal være et helt tal og højere end din nuværende alder.",
      );
    }

    if (!Number.isInteger(inputs.payoutYears) || inputs.payoutYears <= 0) {
      throw new Error(
        "Udbetalingsperioden skal være et positivt antal hele år.",
      );
    }

    const includesRatePension =
      inputs.ratePensionBalance > 0 ||
      inputs.annualRatePensionContribution > 0;
    if (
      includesRatePension &&
      (inputs.payoutYears < 10 || inputs.payoutYears > 30)
    ) {
      throw new Error(
        "Ratepension skal udbetales over mellem 10 og 30 hele år.",
      );
    }

    amounts.forEach((key) => {
      if (!Number.isFinite(inputs[key]) || inputs[key] < 0) {
        throw new Error("Beløb skal være 0 eller højere.");
      }
    });

    taxes.forEach((key) => {
      if (!Number.isFinite(inputs[key]) || inputs[key] < 0 || inputs[key] > 1) {
        throw new Error("Skattesatser skal være mellem 0 og 100 %.");
      }
    });

    if (
      !Number.isFinite(inputs.returnRate) ||
      inputs.returnRate <= -1 ||
      !Number.isFinite(inputs.inflationRate) ||
      inputs.inflationRate <= -1
    ) {
      throw new Error("Afkast og inflation skal være større end -100 %.");
    }
  }

  function calculateFire(inputs, calculationDate = new Date()) {
    assertInputs(inputs);
    const asOfDate = normalizeDate(calculationDate);
    const yearsToRetirement = inputs.retirementAge - inputs.currentAge;
    const finalYear = yearsToRetirement + inputs.payoutYears;
    const retirementDate = annualDate(asOfDate, yearsToRetirement);
    const finalDate = annualDate(asOfDate, finalYear);

    const netPensionReturn = inputs.returnRate * (1 - inputs.pensionTax);
    const realPensionReturn =
      (1 + netPensionReturn) / (1 + inputs.inflationRate) - 1;
    const realAskReturn =
      (1 + inputs.returnRate * (1 - inputs.askTax)) /
        (1 + inputs.inflationRate) -
      1;
    const realFreeFundsReturn =
      (1 + inputs.returnRate * (1 - inputs.freeFundsTax)) /
        (1 + inputs.inflationRate) -
      1;
    const rates = [
      realPensionReturn,
      realPensionReturn,
      realFreeFundsReturn,
      realAskReturn,
    ];

    if (rates.some((rate) => !Number.isFinite(rate) || rate <= -1)) {
      throw new Error("Forudsætningerne giver et ugyldigt reelt afkast.");
    }

    const requiredAtRetirement =
      inputs.desiredAnnualWithdrawal *
      presentValueFactor(realPensionReturn, inputs.payoutYears);
    const pensionTargetToday =
      requiredAtRetirement /
      Math.pow(1 + realPensionReturn, yearsToRetirement);
    assertFinite(requiredAtRetirement, pensionTargetToday);

    const followsInflation = inputs.contributionsFollowInflation !== false;
    const initialBalances = [
      inputs.ratePensionBalance,
      inputs.ageSavingsBalance,
      inputs.freeFundsBalance,
      inputs.askBalance,
    ];
    assertFinite(...initialBalances);

    function contributionAtYearEnd(baseContribution, yearNumber) {
      if (baseContribution <= 0) {
        return 0;
      }

      const contribution = followsInflation
        ? baseContribution
        : baseContribution /
          Math.pow(1 + inputs.inflationRate, yearNumber);
      assertFinite(contribution);
      return contribution;
    }

    function simulateDrawdown(
      startYear,
      startBalances,
      shouldRecord,
      startingContribution = 0,
    ) {
      let balances = [...startBalances];
      const rows = [];
      let isFullyFunded = true;
      let firstShortfallDate = null;

      for (let year = startYear; year < finalYear; year += 1) {
        const beforeRetirement = year < yearsToRetirement;
        const periods = beforeRetirement
          ? yearsToRetirement - year
          : finalYear - year;
        const allocation = allocateForPhase(
          balances,
          rates,
          inputs.desiredAnnualWithdrawal,
          periods,
          beforeRetirement,
        );
        const shortfall =
          allocation.total + MONEY_TOLERANCE <
          inputs.desiredAnnualWithdrawal;
        const date = annualDate(asOfDate, year);

        if (shortfall && !firstShortfallDate) {
          firstShortfallDate = new Date(date);
        }
        isFullyFunded = isFullyFunded && !shortfall;

        if (shouldRecord) {
          const pensionWithdrawal =
            allocation.amounts[RATE_PENSION] +
            allocation.amounts[AGE_SAVINGS];
          const freeWithdrawal =
            allocation.amounts[FREE_FUNDS] + allocation.amounts[ASK];
          const withdrawalSource =
            allocation.total <= MONEY_TOLERANCE
              ? "—"
              : beforeRetirement
                ? "Frie midler"
                : pensionWithdrawal > MONEY_TOLERANCE &&
                    freeWithdrawal > MONEY_TOLERANCE
                  ? "Pension og frie midler"
                  : freeWithdrawal > MONEY_TOLERANCE
                    ? "Frie midler"
                    : "Pension";

          rows.push(
            createRow(
              inputs.currentAge + year,
              date,
              balances,
              {
                phase: beforeRetirement ? "FIRE" : "Pension",
                contribution:
                  year === startYear ? startingContribution : 0,
                withdrawal: allocation.total,
                withdrawalSource,
                withdrawalShortfall: shortfall,
              },
            ),
          );
        }

        balances = balances.map((balance, index) =>
          Math.max(0, balance - allocation.amounts[index]),
        );
        balances = growBalances(balances, rates);
      }

      if (shouldRecord) {
        rows.push(
          createRow(
            inputs.currentAge + finalYear,
            finalDate,
            balances,
            { phase: "Slut" },
          ),
        );
      }

      return {
        rows,
        finalBalances: balances,
        isFullyFunded,
        firstShortfallDate,
      };
    }

    function evaluateMilestone(year, balances) {
      const bridgeYears = yearsToRetirement - year;
      const pensionAtRetirement =
        (balances[RATE_PENSION] + balances[AGE_SAVINGS]) *
        Math.pow(1 + realPensionReturn, bridgeYears);
      const coastFinanced =
        pensionAtRetirement + CALCULATION_TOLERANCE >= requiredAtRetirement;
      const drawdown = simulateDrawdown(year, balances, false);
      const possibleBridgeWithdrawal =
        annualCapacity(
          balances[FREE_FUNDS],
          realFreeFundsReturn,
          bridgeYears,
        ) + annualCapacity(balances[ASK], realAskReturn, bridgeYears);

      assertFinite(pensionAtRetirement, possibleBridgeWithdrawal);
      return {
        age: inputs.currentAge + year,
        date: annualDate(asOfDate, year),
        ratePension: balances[RATE_PENSION],
        ageSavings: balances[AGE_SAVINGS],
        freeFunds: balances[FREE_FUNDS],
        ask: balances[ASK],
        bridgeYears,
        coastFinanced,
        possibleBridgeWithdrawal,
        fireReady: drawdown.isFullyFunded,
      };
    }

    const accumulationRows = [];
    const milestoneRows = [];
    let balances = [...initialBalances];
    let contributionAtCheckpoint = 0;
    let pensionContributionsActive = true;
    let pensionCoastRow = null;
    let pensionStopRow = null;
    let fireRow = null;
    let drawdownStartYear = yearsToRetirement;
    let drawdownStartBalances = null;
    let drawdownStartContribution = 0;

    for (let year = 0; year <= yearsToRetirement; year += 1) {
      const milestone = evaluateMilestone(year, balances);
      milestoneRows.push(milestone);

      if (!pensionCoastRow && milestone.coastFinanced) {
        pensionCoastRow = milestone;
        pensionStopRow = pensionStopRow || milestone;
        pensionContributionsActive = false;
      }

      if (milestone.fireReady) {
        fireRow = milestone;
        pensionStopRow = pensionStopRow || milestone;
        drawdownStartYear = year;
        drawdownStartBalances = [...balances];
        drawdownStartContribution = contributionAtCheckpoint;
        break;
      }

      if (year === yearsToRetirement) {
        drawdownStartBalances = [...balances];
        drawdownStartContribution = contributionAtCheckpoint;
        break;
      }

      accumulationRows.push(
        createRow(
          inputs.currentAge + year,
          annualDate(asOfDate, year),
          balances,
          {
            phase: "Opsparing",
            contribution: contributionAtCheckpoint,
          },
        ),
      );

      balances = growBalances(balances, rates);
      const nextYear = year + 1;
      const contributions = [
        pensionContributionsActive
          ? contributionAtYearEnd(
              inputs.annualRatePensionContribution,
              nextYear,
            )
          : 0,
        pensionContributionsActive
          ? contributionAtYearEnd(
              inputs.annualAgeSavingsContribution,
              nextYear,
            )
          : 0,
        contributionAtYearEnd(
          inputs.annualFreeFundsContribution,
          nextYear,
        ),
        0,
      ];
      contributionAtCheckpoint = contributions.reduce(
        (total, contribution) => total + contribution,
        0,
      );
      balances = balances.map(
        (balance, index) => balance + contributions[index],
      );
      assertFinite(contributionAtCheckpoint, ...balances);
    }

    const drawdown = simulateDrawdown(
      drawdownStartYear,
      drawdownStartBalances,
      true,
      drawdownStartContribution,
    );
    const planRows = [...accumulationRows, ...drawdown.rows];
    const finalRow = planRows[planRows.length - 1];
    const pensionTargetAtStop = pensionStopRow
      ? requiredAtRetirement /
        Math.pow(1 + realPensionReturn, pensionStopRow.bridgeYears)
      : null;
    assertFinite(pensionTargetAtStop ?? 0);

    return {
      currentAge: inputs.currentAge,
      netPensionReturn,
      realPensionReturn,
      realAskReturn,
      realFreeFundsReturn,
      yearsToRetirement,
      retirementDate,
      finalDate,
      requiredAtRetirement,
      pensionTargetToday,
      pensionCoastRow,
      pensionStopRow,
      pensionTargetAtStop,
      fireRow,
      isFullyFunded: drawdown.isFullyFunded,
      firstShortfallDate: drawdown.firstShortfallDate,
      rows: milestoneRows,
      planRows,
      finalRow,
    };
  }

  return { calculateFire };
});
