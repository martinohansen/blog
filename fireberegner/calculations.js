(function (root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  root.FireCalculations = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const MONEY_TOLERANCE = 0.01;
  const CALCULATION_TOLERANCE = 1e-7;
  const SHARE_INCOME_THRESHOLD = 79400;
  const SHARE_INCOME_LOW_RATE = 0.27;
  const SHARE_INCOME_HIGH_RATE = 0.42;
  const FREE_FUNDS_TAXATION = Object.freeze({
    realization: "realization",
    inventory: "inventory",
  });
  const CONTRIBUTION_SEARCH_STEP = 1000;
  const CONTRIBUTION_LIMITS = Object.freeze({
    ratePension: 68700,
    ageSavings: 9900,
    ageSavingsHigh: 64200,
  });

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

  function contributionNetBudget(contributions, taxRelief) {
    const budget =
      contributions.annualRatePensionContribution * (1 - taxRelief) +
      contributions.annualAgeSavingsContribution +
      contributions.annualFreeFundsContribution;
    assertFinite(budget);
    return budget;
  }

  function ageSavingsContributionLimit(inputs) {
    const limit =
      inputs.ageSavingsContributionLimit ?? CONTRIBUTION_LIMITS.ageSavings;

    if (
      limit !== CONTRIBUTION_LIMITS.ageSavings &&
      limit !== CONTRIBUTION_LIMITS.ageSavingsHigh
    ) {
      throw new Error(
        "Loftet for aldersopsparing skal være et gældende 2026-loft.",
      );
    }

    return limit;
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
    capacities,
    desiredWithdrawal,
    beforeRetirement,
  ) {
    if (beforeRetirement) {
      const freeIndexes = [FREE_FUNDS, ASK];
      const allocation = allocateWithdrawals(
        freeIndexes.map((index) => capacities[index]),
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
      pensionIndexes.map((index) => capacities[index]),
      desiredWithdrawal,
    );
    const freeAllocation = allocateWithdrawals(
      freeIndexes.map((index) => capacities[index]),
      desiredWithdrawal - pensionAllocation.total,
    );

    return {
      amounts: [...pensionAllocation.amounts, ...freeAllocation.amounts],
      total: pensionAllocation.total + freeAllocation.total,
    };
  }

  function grossWithdrawalForNetTarget(
    netTarget,
    freeFundsCapacity,
    askCapacity,
    freeFundsBalance,
    freeFundsCostBasis,
    freeFundsTaxation,
  ) {
    if (netTarget <= 0) {
      return 0;
    }

    const totalCapacity = freeFundsCapacity + askCapacity;
    if (totalCapacity <= 0) {
      return 0;
    }

    const freeFundsShare = freeFundsCapacity / totalCapacity;
    const gainShare =
      freeFundsTaxation === FREE_FUNDS_TAXATION.realization &&
      freeFundsBalance > 0
        ? Math.max(
            0,
            (freeFundsBalance - freeFundsCostBasis) / freeFundsBalance,
          )
        : 0;
    const taxableGainPerGrossWithdrawal = freeFundsShare * gainShare;
    let grossWithdrawal = netTarget;

    if (taxableGainPerGrossWithdrawal > 0) {
      const grossAtThreshold =
        SHARE_INCOME_THRESHOLD / taxableGainPerGrossWithdrawal;
      const netAtThreshold =
        grossAtThreshold -
        SHARE_INCOME_THRESHOLD * SHARE_INCOME_LOW_RATE;

      if (netTarget <= netAtThreshold) {
        grossWithdrawal =
          netTarget /
          (1 -
            SHARE_INCOME_LOW_RATE * taxableGainPerGrossWithdrawal);
      } else {
        grossWithdrawal =
          (netTarget -
            (SHARE_INCOME_HIGH_RATE - SHARE_INCOME_LOW_RATE) *
              SHARE_INCOME_THRESHOLD) /
          (1 -
            SHARE_INCOME_HIGH_RATE * taxableGainPerGrossWithdrawal);
      }
    }

    assertFinite(
      totalCapacity,
      freeFundsShare,
      gainShare,
      taxableGainPerGrossWithdrawal,
      grossWithdrawal,
    );
    return Math.min(grossWithdrawal, totalCapacity);
  }

  function allocateForNetWithdrawal(
    balances,
    capacities,
    desiredNetWithdrawal,
    beforeRetirement,
    freeFundsCostBasis,
    pensionWithdrawalTax,
    freeFundsTaxation,
  ) {
    const pensionIndexes = [RATE_PENSION, AGE_SAVINGS];
    const freeIndexes = [FREE_FUNDS, ASK];
    const pensionCapacities = pensionIndexes.map(
      (index) => capacities[index],
    );
    const totalPensionCapacity = pensionCapacities.reduce(
      (total, capacity) => total + capacity,
      0,
    );
    const netPensionCapacity =
      pensionCapacities[RATE_PENSION] * (1 - pensionWithdrawalTax) +
      pensionCapacities[AGE_SAVINGS];
    const pensionNetPerGross =
      totalPensionCapacity > 0
        ? netPensionCapacity / totalPensionCapacity
        : 0;
    const desiredGrossPensionWithdrawal =
      pensionNetPerGross > 0
        ? desiredNetWithdrawal / pensionNetPerGross
        : 0;
    const pensionAllocation = beforeRetirement
      ? { amounts: [0, 0], total: 0 }
      : allocateWithdrawals(
          pensionCapacities,
          desiredGrossPensionWithdrawal,
        );
    const pensionTax =
      pensionAllocation.amounts[RATE_PENSION] * pensionWithdrawalTax;
    const pensionNetWithdrawal = pensionAllocation.total - pensionTax;
    const remainingNetWithdrawal = Math.max(
      0,
      desiredNetWithdrawal - pensionNetWithdrawal,
    );
    const freeCapacities = freeIndexes.map((index) => capacities[index]);
    const freeGrossWithdrawal = grossWithdrawalForNetTarget(
      remainingNetWithdrawal,
      freeCapacities[0],
      freeCapacities[1],
      balances[FREE_FUNDS],
      freeFundsCostBasis,
      freeFundsTaxation,
    );
    const freeAllocation = allocateWithdrawals(
      freeCapacities,
      freeGrossWithdrawal,
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

  function midyearGrowthFactor(rate) {
    const factor = Math.sqrt(1 + rate);
    assertFinite(factor);
    return factor;
  }

  function calculateShareIncomeTax(taxableGain) {
    const tax =
      Math.min(taxableGain, SHARE_INCOME_THRESHOLD) *
        SHARE_INCOME_LOW_RATE +
      Math.max(0, taxableGain - SHARE_INCOME_THRESHOLD) *
        SHARE_INCOME_HIGH_RATE;
    assertFinite(taxableGain, tax);
    return tax;
  }

  function calculateFreeFundsSale(
    balance,
    costBasis,
    withdrawal,
    freeFundsTaxation = FREE_FUNDS_TAXATION.realization,
  ) {
    if (balance <= 0 || withdrawal <= 0) {
      return {
        realizedGain: 0,
        tax: 0,
        remainingCostBasis: costBasis,
      };
    }

    if (freeFundsTaxation === FREE_FUNDS_TAXATION.inventory) {
      return {
        realizedGain: 0,
        tax: 0,
        remainingCostBasis: 0,
      };
    }

    const soldShare = Math.min(1, withdrawal / balance);
    const usedCostBasis = costBasis * soldShare;
    const realizedGain = withdrawal - usedCostBasis;
    const taxableGain = Math.max(0, realizedGain);
    const tax = calculateShareIncomeTax(taxableGain);
    const remainingCostBasis =
      soldShare >= 1 - CALCULATION_TOLERANCE
        ? 0
        : Math.max(0, costBasis - usedCostBasis);

    assertFinite(
      soldShare,
      usedCostBasis,
      realizedGain,
      taxableGain,
      tax,
      remainingCostBasis,
    );
    return { realizedGain, tax, remainingCostBasis };
  }

  function createRow(
    age,
    date,
    balances,
    freeFundsCostBasis,
    values = {},
  ) {
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
      freeFundsWithdrawal: 0,
      realizedFreeFundsGain: 0,
      withdrawalTax: 0,
      annualFreeFundsTax: 0,
      pensionWithdrawalTax: 0,
      totalWithdrawalTax: 0,
      netWithdrawal: 0,
      effectiveFreeFundsWithdrawalTaxRate: 0,
      effectiveWithdrawalTaxRate: 0,
      freeFundsCostBasis,
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
      "freeFundsCostBasis",
      "askBalance",
      "annualRatePensionContribution",
      "annualAgeSavingsContribution",
      "annualFreeFundsContribution",
      "desiredAnnualWithdrawal",
    ];
    const taxes = ["pensionTax", "askTax"];
    ageSavingsContributionLimit(inputs);
    const freeFundsTaxation =
      inputs.freeFundsTaxation ?? FREE_FUNDS_TAXATION.realization;

    if (!Object.values(FREE_FUNDS_TAXATION).includes(freeFundsTaxation)) {
      throw new Error(
        "Beskatning af frie midler skal være realisations- eller lagerbeskatning.",
      );
    }

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

    const pensionWithdrawalTax = inputs.pensionWithdrawalTax ?? 0;
    if (
      !Number.isFinite(pensionWithdrawalTax) ||
      pensionWithdrawalTax < 0 ||
      pensionWithdrawalTax > 1
    ) {
      throw new Error("Skattesatser skal være mellem 0 og 100 %.");
    }

    const ratePensionContributionTaxRelief =
      inputs.ratePensionContributionTaxRelief ?? 0;
    if (
      !Number.isFinite(ratePensionContributionTaxRelief) ||
      ratePensionContributionTaxRelief < 0 ||
      ratePensionContributionTaxRelief > 1
    ) {
      throw new Error("Skattesatser skal være mellem 0 og 100 %.");
    }

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
    const pensionWithdrawalTax = inputs.pensionWithdrawalTax ?? 0;
    const ratePensionContributionTaxRelief =
      inputs.ratePensionContributionTaxRelief ?? 0;
    const selectedAgeSavingsContributionLimit =
      ageSavingsContributionLimit(inputs);
    const freeFundsTaxation =
      inputs.freeFundsTaxation ?? FREE_FUNDS_TAXATION.realization;
    const usesInventoryTax =
      freeFundsTaxation === FREE_FUNDS_TAXATION.inventory;

    const netPensionReturn = inputs.returnRate * (1 - inputs.pensionTax);
    const realPensionReturn =
      (1 + netPensionReturn) / (1 + inputs.inflationRate) - 1;
    const realAskReturn =
      (1 + inputs.returnRate * (1 - inputs.askTax)) /
        (1 + inputs.inflationRate) -
      1;
    const grossRealFreeFundsReturn =
      (1 + inputs.returnRate) / (1 + inputs.inflationRate) - 1;
    const realFreeFundsReturn = usesInventoryTax
      ? (1 + inputs.returnRate * (1 - SHARE_INCOME_LOW_RATE)) /
          (1 + inputs.inflationRate) -
        1
      : grossRealFreeFundsReturn;
    const rates = [
      realPensionReturn,
      realPensionReturn,
      realFreeFundsReturn,
      realAskReturn,
    ];

    function inventoryTaxForBalance(balance) {
      if (!usesInventoryTax || balance <= 0 || inputs.returnRate <= 0) {
        return 0;
      }

      return calculateShareIncomeTax(balance * inputs.returnRate);
    }

    function inventoryAnnualCapacity(balance, periods) {
      if (balance <= 0 || periods <= 0) {
        return 0;
      }

      let affordable = 0;
      let unaffordable = balance;

      for (let iteration = 0; iteration < 60; iteration += 1) {
        if (unaffordable - affordable <= MONEY_TOLERANCE) {
          break;
        }

        const withdrawal = (affordable + unaffordable) / 2;
        let remaining = balance;
        let funded = true;

        for (let period = 0; period < periods; period += 1) {
          if (remaining + MONEY_TOLERANCE < withdrawal) {
            funded = false;
            break;
          }

          remaining = Math.max(0, remaining - withdrawal);
          const tax = inventoryTaxForBalance(remaining);
          remaining =
            (remaining * (1 + inputs.returnRate) - tax) /
            (1 + inputs.inflationRate);
          assertFinite(remaining, tax);
        }

        if (funded) {
          affordable = withdrawal;
        } else {
          unaffordable = withdrawal;
        }
      }

      assertFinite(affordable);
      return affordable;
    }

    function freeFundsRateForBalance(balance) {
      if (!usesInventoryTax || balance <= 0) {
        return realFreeFundsReturn;
      }

      return (
        (balance * (1 + inputs.returnRate) -
          inventoryTaxForBalance(balance)) /
          (1 + inputs.inflationRate) /
          balance -
        1
      );
    }

    function ratesForBalances(balances) {
      return [
        realPensionReturn,
        realPensionReturn,
        freeFundsRateForBalance(balances[FREE_FUNDS]),
        realAskReturn,
      ];
    }

    function capacitiesForBalances(balances, periods) {
      const currentRates = ratesForBalances(balances);

      return balances.map((balance, index) =>
        usesInventoryTax && index === FREE_FUNDS
          ? inventoryAnnualCapacity(balance, periods)
          : annualCapacity(balance, currentRates[index], periods),
      );
    }

    function growBalancesWithTax(balances) {
      const inventoryTax = inventoryTaxForBalance(balances[FREE_FUNDS]);
      const currentRates = ratesForBalances(balances);
      const grownBalances = growBalances(balances, currentRates);
      const realTax = inventoryTax / (1 + inputs.inflationRate);
      const realTaxableGain = usesInventoryTax
        ? Math.max(0, balances[FREE_FUNDS] * inputs.returnRate) /
          (1 + inputs.inflationRate)
        : 0;

      assertFinite(realTax, realTaxableGain);
      return {
        balances: grownBalances,
        freeFundsTax: realTax,
        freeFundsTaxableGain: realTaxableGain,
      };
    }

    if (rates.some((rate) => !Number.isFinite(rate) || rate <= -1)) {
      throw new Error("Forudsætningerne giver et ugyldigt reelt afkast.");
    }

    const followsInflation = inputs.contributionsFollowInflation !== false;
    const redirectsPensionContributions =
      inputs.redirectPensionContributionsToFreeFunds !== false;
    const initialBalances = [
      inputs.ratePensionBalance,
      inputs.ageSavingsBalance,
      inputs.freeFundsBalance,
      inputs.askBalance,
    ];
    assertFinite(...initialBalances, inputs.freeFundsCostBasis);

    function contributionAtMidyear(baseContribution, yearNumber) {
      if (baseContribution <= 0) {
        return 0;
      }

      const contribution = followsInflation
        ? baseContribution
        : baseContribution /
          Math.pow(1 + inputs.inflationRate, yearNumber - 0.5);
      assertFinite(contribution);
      return contribution;
    }

    function accumulateWithMidyearContributions(
      startingBalances,
      contributions,
    ) {
      const growth = growBalancesWithTax(startingBalances);
      const currentRates = ratesForBalances(startingBalances);
      const endingBalances = growth.balances.map(
        (balance, index) =>
          balance +
          contributions[index] * midyearGrowthFactor(currentRates[index]),
      );

      if (usesInventoryTax && contributions[FREE_FUNDS] > 0) {
        const startingBalance = startingBalances[FREE_FUNDS];
        const contribution = contributions[FREE_FUNDS];
        const nominalHalfYearGrowth = Math.sqrt(1 + inputs.returnRate);
        const inflationHalfYearGrowth = Math.sqrt(
          1 + inputs.inflationRate,
        );
        const openingBalanceAtYearEnd =
          (startingBalance * (1 + inputs.returnRate)) /
          (1 + inputs.inflationRate);
        const contributionAtYearEnd =
          contribution *
          (nominalHalfYearGrowth / inflationHalfYearGrowth);
        const taxableGain =
          inputs.returnRate > 0
            ? startingBalance * inputs.returnRate +
              contribution *
                inflationHalfYearGrowth *
                (nominalHalfYearGrowth - 1)
            : 0;
        const tax =
          calculateShareIncomeTax(taxableGain) /
          (1 + inputs.inflationRate);

        endingBalances[FREE_FUNDS] = Math.max(
          0,
          openingBalanceAtYearEnd + contributionAtYearEnd - tax,
        );
        growth.freeFundsTax = tax;
        growth.freeFundsTaxableGain =
          taxableGain / (1 + inputs.inflationRate);
      }

      assertFinite(...endingBalances);
      return { ...growth, balances: endingBalances };
    }

    function pensionNetFraction(ratePension, ageSavings) {
      const totalPension = ratePension + ageSavings;

      if (!inputs.withdrawalAfterTax || totalPension <= 0) {
        return 1;
      }

      return (
        (ratePension * (1 - pensionWithdrawalTax) + ageSavings) /
        totalPension
      );
    }

    let projectedRatePension = inputs.ratePensionBalance;
    let projectedAgeSavings = inputs.ageSavingsBalance;

    for (let year = 1; year <= yearsToRetirement; year += 1) {
      projectedRatePension =
        projectedRatePension * (1 + realPensionReturn) +
        contributionAtMidyear(
          inputs.annualRatePensionContribution,
          year,
        ) * midyearGrowthFactor(realPensionReturn);
      projectedAgeSavings =
        projectedAgeSavings * (1 + realPensionReturn) +
        contributionAtMidyear(
          inputs.annualAgeSavingsContribution,
          year,
        ) * midyearGrowthFactor(realPensionReturn);
      assertFinite(projectedRatePension, projectedAgeSavings);
    }

    const projectedPensionNetFraction = pensionNetFraction(
      projectedRatePension,
      projectedAgeSavings,
    );
    const requiredAtRetirement =
      (inputs.desiredAnnualWithdrawal /
        Math.max(CALCULATION_TOLERANCE, projectedPensionNetFraction)) *
      presentValueFactor(realPensionReturn, inputs.payoutYears);
    const pensionTargetToday =
      requiredAtRetirement /
      Math.pow(1 + realPensionReturn, yearsToRetirement);
    assertFinite(requiredAtRetirement, pensionTargetToday);

    function simulateDrawdown(
      startYear,
      startBalances,
      startFreeFundsCostBasis,
      shouldRecord,
      startingContribution = 0,
    ) {
      let balances = [...startBalances];
      let freeFundsCostBasis = usesInventoryTax
        ? 0
        : startFreeFundsCostBasis;
      const rows = [];
      let isFullyFunded = true;
      let firstShortfallDate = null;
      let annualFreeFundsTax = 0;
      let annualFreeFundsTaxableGain = 0;

      for (let year = startYear; year < finalYear; year += 1) {
        const beforeRetirement = year < yearsToRetirement;
        const periods = beforeRetirement
          ? yearsToRetirement - year
          : finalYear - year;
        const capacities = capacitiesForBalances(balances, periods);
        const allocation = inputs.withdrawalAfterTax
          ? allocateForNetWithdrawal(
              balances,
              capacities,
              inputs.desiredAnnualWithdrawal,
              beforeRetirement,
              freeFundsCostBasis,
              pensionWithdrawalTax,
              freeFundsTaxation,
            )
          : allocateForPhase(
              capacities,
              inputs.desiredAnnualWithdrawal,
              beforeRetirement,
            );
        const date = annualDate(asOfDate, year);
        const freeFundsWithdrawal = allocation.amounts[FREE_FUNDS];
        const freeFundsSale = calculateFreeFundsSale(
          balances[FREE_FUNDS],
          freeFundsCostBasis,
          freeFundsWithdrawal,
          freeFundsTaxation,
        );
        const pensionWithdrawalTaxAmount =
          allocation.amounts[RATE_PENSION] * pensionWithdrawalTax;
        const totalWithdrawalTax =
          freeFundsSale.tax + pensionWithdrawalTaxAmount;
        const netWithdrawal = allocation.total - totalWithdrawalTax;
        const effectiveFreeFundsWithdrawalTaxRate =
          freeFundsWithdrawal > 0
            ? freeFundsSale.tax / freeFundsWithdrawal
            : 0;
        const effectiveWithdrawalTaxRate =
          allocation.total > 0 ? totalWithdrawalTax / allocation.total : 0;
        const deliveredWithdrawal = inputs.withdrawalAfterTax
          ? netWithdrawal
          : allocation.total;
        const shortfall =
          deliveredWithdrawal + MONEY_TOLERANCE <
          inputs.desiredAnnualWithdrawal;

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
              freeFundsCostBasis,
              {
                phase: beforeRetirement ? "FIRE" : "Pension",
                contribution:
                  year === startYear ? startingContribution : 0,
                withdrawal: allocation.total,
                freeFundsWithdrawal,
                realizedFreeFundsGain: freeFundsSale.realizedGain,
                withdrawalTax: freeFundsSale.tax,
                pensionWithdrawalTax: pensionWithdrawalTaxAmount,
                totalWithdrawalTax,
                netWithdrawal,
                effectiveFreeFundsWithdrawalTaxRate,
                effectiveWithdrawalTaxRate,
                withdrawalSource,
                withdrawalShortfall: shortfall,
              },
            ),
          );
        }

        freeFundsCostBasis = freeFundsSale.remainingCostBasis;
        balances = balances.map((balance, index) =>
          Math.max(0, balance - allocation.amounts[index]),
        );
        const growth = growBalancesWithTax(balances);
        if (shouldRecord) {
          rows[rows.length - 1].annualFreeFundsTax = growth.freeFundsTax;
        }
        balances = growth.balances;
        annualFreeFundsTax += growth.freeFundsTax;
        annualFreeFundsTaxableGain += growth.freeFundsTaxableGain;
        freeFundsCostBasis = usesInventoryTax
          ? 0
          : freeFundsCostBasis / (1 + inputs.inflationRate);
        assertFinite(freeFundsCostBasis);
      }

      if (shouldRecord) {
        rows.push(
          createRow(
            inputs.currentAge + finalYear,
            finalDate,
            balances,
            freeFundsCostBasis,
            { phase: "Slut" },
          ),
        );
      }

      return {
        rows,
        finalBalances: balances,
        finalFreeFundsCostBasis: freeFundsCostBasis,
        annualFreeFundsTax,
        annualFreeFundsTaxableGain,
        isFullyFunded,
        firstShortfallDate,
      };
    }

    function evaluateMilestone(year, balances, freeFundsCostBasis) {
      const bridgeYears = yearsToRetirement - year;
      const pensionGrowth = Math.pow(
        1 + realPensionReturn,
        bridgeYears,
      );
      const ratePensionAtRetirement =
        balances[RATE_PENSION] * pensionGrowth;
      const ageSavingsAtRetirement = balances[AGE_SAVINGS] * pensionGrowth;
      const pensionAtRetirement =
        ratePensionAtRetirement + ageSavingsAtRetirement;
      const payoutFactor = presentValueFactor(
        realPensionReturn,
        inputs.payoutYears,
      );
      const pensionNetAnnualCapacity =
        payoutFactor > 0
          ? (ratePensionAtRetirement *
                (inputs.withdrawalAfterTax
                  ? 1 - pensionWithdrawalTax
                  : 1) +
              ageSavingsAtRetirement) /
            payoutFactor
          : 0;
      const coastFinanced =
        pensionNetAnnualCapacity + CALCULATION_TOLERANCE >=
        inputs.desiredAnnualWithdrawal;
      const milestoneNetFraction = pensionNetFraction(
        balances[RATE_PENSION],
        balances[AGE_SAVINGS],
      );
      const pensionTarget =
        (inputs.desiredAnnualWithdrawal /
          Math.max(CALCULATION_TOLERANCE, milestoneNetFraction)) *
        presentValueFactor(realPensionReturn, inputs.payoutYears) /
        pensionGrowth;
      const drawdown = simulateDrawdown(
        year,
        balances,
        freeFundsCostBasis,
        false,
      );
      const bridgeCapacityAllocation = allocateForPhase(
        capacitiesForBalances(balances, bridgeYears),
        Number.MAX_VALUE,
        true,
      );
      const bridgeCapacitySale = calculateFreeFundsSale(
        balances[FREE_FUNDS],
        freeFundsCostBasis,
        bridgeCapacityAllocation.amounts[FREE_FUNDS],
        freeFundsTaxation,
      );
      const possibleBridgeWithdrawal = inputs.withdrawalAfterTax
        ? bridgeCapacityAllocation.total - bridgeCapacitySale.tax
        : bridgeCapacityAllocation.total;

      assertFinite(
        pensionAtRetirement,
        pensionNetAnnualCapacity,
        pensionTarget,
        possibleBridgeWithdrawal,
      );
      return {
        age: inputs.currentAge + year,
        date: annualDate(asOfDate, year),
        ratePension: balances[RATE_PENSION],
        ageSavings: balances[AGE_SAVINGS],
        freeFunds: balances[FREE_FUNDS],
        freeFundsCostBasis,
        ask: balances[ASK],
        bridgeYears,
        pensionTarget,
        coastFinanced,
        possibleBridgeWithdrawal,
        fireReady: drawdown.isFullyFunded,
      };
    }

    const accumulationRows = [];
    const milestoneRows = [];
    let balances = [...initialBalances];
    let freeFundsCostBasis = usesInventoryTax ? 0 : inputs.freeFundsCostBasis;
    let accumulationFreeFundsTax = 0;
    let accumulationFreeFundsTaxableGain = 0;
    let contributionAtCheckpoint = 0;
    let pensionContributionsActive = true;
    let pensionCoastRow = null;
    let pensionStopRow = null;
    let fireRow = null;
    let drawdownStartYear = yearsToRetirement;
    let drawdownStartBalances = null;
    let drawdownStartFreeFundsCostBasis = null;
    let drawdownStartContribution = 0;

    for (let year = 0; year <= yearsToRetirement; year += 1) {
      const milestone = evaluateMilestone(year, balances, freeFundsCostBasis);
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
        drawdownStartFreeFundsCostBasis = freeFundsCostBasis;
        drawdownStartContribution = contributionAtCheckpoint;
        break;
      }

      if (year === yearsToRetirement) {
        drawdownStartBalances = [...balances];
        drawdownStartFreeFundsCostBasis = freeFundsCostBasis;
        drawdownStartContribution = contributionAtCheckpoint;
        break;
      }

      accumulationRows.push(
        createRow(
          inputs.currentAge + year,
          annualDate(asOfDate, year),
          balances,
          freeFundsCostBasis,
          {
            phase: "Opsparing",
            contribution: contributionAtCheckpoint,
          },
        ),
      );

      const nextYear = year + 1;
      const shouldCalculatePensionContributions =
        pensionContributionsActive || redirectsPensionContributions;
      const ratePensionContribution = shouldCalculatePensionContributions
        ? contributionAtMidyear(
            inputs.annualRatePensionContribution,
            nextYear,
          )
        : 0;
      const ageSavingsContribution = shouldCalculatePensionContributions
        ? contributionAtMidyear(
            inputs.annualAgeSavingsContribution,
            nextYear,
          )
        : 0;
      const redirectedPensionContribution =
        !pensionContributionsActive && redirectsPensionContributions
          ? ratePensionContribution *
              (1 - ratePensionContributionTaxRelief) +
            ageSavingsContribution
          : 0;
      const contributions = [
        pensionContributionsActive ? ratePensionContribution : 0,
        pensionContributionsActive ? ageSavingsContribution : 0,
        contributionAtMidyear(inputs.annualFreeFundsContribution, nextYear) +
          redirectedPensionContribution,
        0,
      ];
      contributionAtCheckpoint = contributions.reduce(
        (total, contribution) => total + contribution,
        0,
      );
      const growth = accumulateWithMidyearContributions(
        balances,
        contributions,
      );
      accumulationRows[accumulationRows.length - 1].annualFreeFundsTax =
        growth.freeFundsTax;
      balances = growth.balances;
      accumulationFreeFundsTax += growth.freeFundsTax;
      accumulationFreeFundsTaxableGain += growth.freeFundsTaxableGain;
      if (!usesInventoryTax) {
        freeFundsCostBasis =
          freeFundsCostBasis / (1 + inputs.inflationRate) +
          contributions[FREE_FUNDS] /
            Math.sqrt(1 + inputs.inflationRate);
      } else {
        freeFundsCostBasis = 0;
      }
      assertFinite(
        contributionAtCheckpoint,
        freeFundsCostBasis,
        ...balances,
      );
    }

    const drawdown = simulateDrawdown(
      drawdownStartYear,
      drawdownStartBalances,
      drawdownStartFreeFundsCostBasis,
      true,
      drawdownStartContribution,
    );
    const planRows = [...accumulationRows, ...drawdown.rows];
    const finalRow = planRows[planRows.length - 1];
    const totalFreeFundsWithdrawalTax = planRows.reduce(
      (total, row) => total + row.withdrawalTax,
      0,
    );
    const totalFreeFundsTax =
      totalFreeFundsWithdrawalTax +
      accumulationFreeFundsTax +
      drawdown.annualFreeFundsTax;
    const totalPensionWithdrawalTax = planRows.reduce(
      (total, row) => total + row.pensionWithdrawalTax,
      0,
    );
    const totalFreeFundsWithdrawals = planRows.reduce(
      (total, row) => total + row.freeFundsWithdrawal,
      0,
    );
    const effectiveFreeFundsWithdrawalTaxRate =
      totalFreeFundsWithdrawals > 0
        ? totalFreeFundsWithdrawalTax / totalFreeFundsWithdrawals
        : 0;
    const totalFreeFundsTaxableGain =
      accumulationFreeFundsTaxableGain +
      drawdown.annualFreeFundsTaxableGain;
    const effectiveFreeFundsTaxRate = usesInventoryTax
      ? totalFreeFundsTaxableGain > 0
        ? totalFreeFundsTax / totalFreeFundsTaxableGain
        : 0
      : effectiveFreeFundsWithdrawalTaxRate;
    const pensionTargetAtStop = pensionStopRow
      ? pensionStopRow.pensionTarget
      : null;
    const annualNetContributionBudget = contributionNetBudget(
      {
        annualRatePensionContribution:
          inputs.annualRatePensionContribution,
        annualAgeSavingsContribution:
          inputs.annualAgeSavingsContribution,
        annualFreeFundsContribution: inputs.annualFreeFundsContribution,
      },
      ratePensionContributionTaxRelief,
    );
    const ageSavingsContributionLimitExceeded =
      inputs.annualAgeSavingsContribution >
      selectedAgeSavingsContributionLimit + MONEY_TOLERANCE;
    const ratePensionContributionLimitExceeded =
      inputs.annualRatePensionContribution >
      CONTRIBUTION_LIMITS.ratePension + MONEY_TOLERANCE;
    assertFinite(
      pensionTargetAtStop ?? 0,
      totalFreeFundsTax,
      totalPensionWithdrawalTax,
      totalFreeFundsWithdrawals,
      effectiveFreeFundsWithdrawalTaxRate,
      totalFreeFundsTaxableGain,
      effectiveFreeFundsTaxRate,
    );

    return {
      currentAge: inputs.currentAge,
      freeFundsTaxation,
      netPensionReturn,
      realPensionReturn,
      realAskReturn,
      realFreeFundsReturn: freeFundsRateForBalance(
        initialBalances[FREE_FUNDS],
      ),
      yearsToRetirement,
      retirementDate,
      finalDate,
      requiredAtRetirement,
      pensionTargetToday,
      pensionCoastRow,
      pensionStopRow,
      pensionTargetAtStop,
      annualNetContributionBudget,
      ratePensionContributionLimit: CONTRIBUTION_LIMITS.ratePension,
      ratePensionContributionLimitExceeded,
      ageSavingsContributionLimit: selectedAgeSavingsContributionLimit,
      ageSavingsContributionLimitExceeded,
      fireRow,
      isFullyFunded: drawdown.isFullyFunded,
      firstShortfallDate: drawdown.firstShortfallDate,
      totalFreeFundsTax,
      totalFreeFundsWithdrawalTax,
      totalFreeFundsTaxableGain,
      totalPensionWithdrawalTax,
      effectiveFreeFundsWithdrawalTaxRate,
      effectiveFreeFundsTaxRate,
      rows: milestoneRows,
      planRows,
      finalRow,
    };
  }

  function contributionSnapshot(contributions, calculation) {
    return {
      ...contributions,
      fireAge: calculation.fireRow?.age ?? null,
      fireDate: calculation.fireRow
        ? new Date(calculation.fireRow.date)
        : null,
    };
  }

  function contributionCandidates(maximum, current) {
    const candidates = new Set([0, maximum]);

    for (
      let contribution = CONTRIBUTION_SEARCH_STEP;
      contribution < maximum;
      contribution += CONTRIBUTION_SEARCH_STEP
    ) {
      candidates.add(contribution);
    }

    if (current >= 0 && current <= maximum) {
      candidates.add(current);
    }

    return [...candidates].sort((first, second) => first - second);
  }

  function contributionDistance(first, second) {
    return (
      Math.abs(
        first.annualRatePensionContribution -
          second.annualRatePensionContribution,
      ) +
      Math.abs(
        first.annualAgeSavingsContribution -
          second.annualAgeSavingsContribution,
      ) +
      Math.abs(
        first.annualFreeFundsContribution -
          second.annualFreeFundsContribution,
      )
    );
  }

  function optimizeAnnualContributions(
    inputs,
    calculationDate = new Date(),
  ) {
    const currentCalculation = calculateFire(inputs, calculationDate);
    const currentContributions = {
      annualRatePensionContribution:
        inputs.annualRatePensionContribution,
      annualAgeSavingsContribution:
        inputs.annualAgeSavingsContribution,
      annualFreeFundsContribution: inputs.annualFreeFundsContribution,
    };
    const ratePensionContributionTaxRelief =
      inputs.ratePensionContributionTaxRelief ?? 0;
    const selectedAgeSavingsContributionLimit =
      ageSavingsContributionLimit(inputs);
    const annualNetBudget = contributionNetBudget(
      currentContributions,
      ratePensionContributionTaxRelief,
    );
    const ratePensionNetCost = 1 - ratePensionContributionTaxRelief;
    const maximumRatePensionContribution = Math.min(
      CONTRIBUTION_LIMITS.ratePension,
      ratePensionNetCost > 0
        ? annualNetBudget / ratePensionNetCost
        : CONTRIBUTION_LIMITS.ratePension,
    );
    const maximumAgeSavingsContribution = Math.min(
      selectedAgeSavingsContributionLimit,
      annualNetBudget,
    );
    const ratePensionCandidates = contributionCandidates(
      maximumRatePensionContribution,
      currentContributions.annualRatePensionContribution,
    );
    const ageSavingsCandidates = contributionCandidates(
      maximumAgeSavingsContribution,
      currentContributions.annualAgeSavingsContribution,
    );
    const currentContributionsAreWithinLimits =
      currentContributions.annualRatePensionContribution <=
        CONTRIBUTION_LIMITS.ratePension &&
      currentContributions.annualAgeSavingsContribution <=
        selectedAgeSavingsContributionLimit;

    let bestCandidate = null;
    let bestCalculation = null;
    let bestFireTime = Number.POSITIVE_INFINITY;
    let bestDistance = Number.POSITIVE_INFINITY;
    const seenCandidates = new Set();

    ratePensionCandidates.forEach((annualRatePensionContribution) => {
      ageSavingsCandidates.forEach((annualAgeSavingsContribution) => {
        const annualFreeFundsContribution =
          annualNetBudget -
          annualRatePensionContribution * ratePensionNetCost -
          annualAgeSavingsContribution;

        if (annualFreeFundsContribution < -MONEY_TOLERANCE) {
          return;
        }

        const candidate = {
          annualRatePensionContribution,
          annualAgeSavingsContribution,
          annualFreeFundsContribution: Math.max(
            0,
            annualFreeFundsContribution,
          ),
        };
        const candidateKey = Object.values(candidate).join(":");

        if (seenCandidates.has(candidateKey)) {
          return;
        }
        seenCandidates.add(candidateKey);

        const calculation = calculateFire(
          { ...inputs, ...candidate },
          calculationDate,
        );
        const fireTime = calculation.fireRow
          ? calculation.fireRow.date.getTime()
          : Number.POSITIVE_INFINITY;
        const distance = contributionDistance(
          candidate,
          currentContributions,
        );
        const isBetterFireDate = fireTime < bestFireTime;
        const isCloserTie =
          fireTime === bestFireTime && distance < bestDistance;
        const isDeterministicTie =
          fireTime === bestFireTime &&
          distance === bestDistance &&
          bestCandidate &&
          candidate.annualFreeFundsContribution >
            bestCandidate.annualFreeFundsContribution;

        if (isBetterFireDate || isCloserTie || isDeterministicTie) {
          bestCandidate = candidate;
          bestCalculation = calculation;
          bestFireTime = fireTime;
          bestDistance = distance;
        }
      });
    });

    const currentFireTime = currentCalculation.fireRow
      ? currentCalculation.fireRow.date.getTime()
      : Number.POSITIVE_INFINITY;
    let status = "improved";

    if (!bestCalculation?.fireRow) {
      status = "unachievable";
    } else if (
      currentContributionsAreWithinLimits &&
      currentFireTime === bestFireTime
    ) {
      status = "current-optimal";
      bestCandidate = currentContributions;
      bestCalculation = currentCalculation;
    } else if (!currentContributionsAreWithinLimits) {
      status = "limits-applied";
    }

    return {
      status,
      current: contributionSnapshot(
        currentContributions,
        currentCalculation,
      ),
      recommended:
        status === "unachievable"
          ? null
          : contributionSnapshot(bestCandidate, bestCalculation),
      annualNetBudget,
      ratePensionContributionTaxRelief,
      limits: {
        ratePension: CONTRIBUTION_LIMITS.ratePension,
        ageSavings: selectedAgeSavingsContributionLimit,
      },
      precision: CONTRIBUTION_SEARCH_STEP,
    };
  }

  return {
    calculateFire,
    optimizeAnnualContributions,
    CONTRIBUTION_LIMITS,
    FREE_FUNDS_TAXATION,
  };
});
