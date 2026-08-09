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
    mixed: "mixed",
  });
  const CONTRIBUTION_SEARCH_STEP = 1000;
  const CONTRIBUTION_LIMITS = Object.freeze({
    ratePension: 68700,
    lifeAnnuity: 63200,
    ageSavings: 9900,
    ageSavingsHigh: 64200,
  });

  const RATE_PENSION = 0;
  const LIFE_ANNUITY = 1;
  const AGE_SAVINGS = 2;
  const FREE_FUNDS_REALIZATION = 3;
  const FREE_FUNDS_INVENTORY = 4;
  const ASK = 5;

  function freeFundsInventoryShare(inputs) {
    if (inputs.freeFundsInventoryShare !== undefined) {
      return inputs.freeFundsInventoryShare;
    }

    return inputs.freeFundsTaxation === FREE_FUNDS_TAXATION.inventory ? 1 : 0;
  }

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

  function ratePensionContributionParts(totalContribution) {
    const deductibleRatePensionContribution = Math.min(
      totalContribution,
      CONTRIBUTION_LIMITS.ratePension,
    );
    const nonDeductibleRatePensionContribution = Math.max(
      0,
      totalContribution - deductibleRatePensionContribution,
    );

    return {
      deductible: deductibleRatePensionContribution,
      nonDeductible: nonDeductibleRatePensionContribution,
    };
  }

  function ratePensionContributionNetCost(totalContribution, taxRelief) {
    const parts = ratePensionContributionParts(totalContribution);
    const netCost = parts.deductible * (1 - taxRelief) + parts.nonDeductible;
    assertFinite(netCost);
    return netCost;
  }

  function lifeAnnuityContributionNetCost(totalContribution, taxRelief) {
    const deductibleContribution = Math.min(
      totalContribution,
      CONTRIBUTION_LIMITS.lifeAnnuity,
    );
    const nonDeductibleContribution = Math.max(
      0,
      totalContribution - deductibleContribution,
    );
    const netCost =
      deductibleContribution * (1 - taxRelief) + nonDeductibleContribution;
    assertFinite(netCost);
    return netCost;
  }

  function pensionContributionTaxSaving(contributions, taxRelief) {
    const rateContribution = contributions.annualRatePensionContribution ?? 0;
    const lifeAnnuityContribution =
      contributions.annualLifeAnnuityContribution ?? 0;
    const saving =
      rateContribution -
      ratePensionContributionNetCost(rateContribution, taxRelief) +
      lifeAnnuityContribution -
      lifeAnnuityContributionNetCost(lifeAnnuityContribution, taxRelief);
    assertFinite(saving);
    return saving;
  }

  function contributionNetBudget(contributions, taxRelief) {
    const budget =
      ratePensionContributionNetCost(
        contributions.annualRatePensionContribution,
        taxRelief,
      ) +
      lifeAnnuityContributionNetCost(
        contributions.annualLifeAnnuityContribution ?? 0,
        taxRelief,
      ) +
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
    const day = Math.min(anchorDate.getDate(), daysInMonth(targetYear, month));
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

  function allocateForPhase(capacities, desiredWithdrawal, beforeRetirement) {
    if (beforeRetirement) {
      const freeIndexes = [FREE_FUNDS_REALIZATION, FREE_FUNDS_INVENTORY, ASK];
      const allocation = allocateWithdrawals(
        freeIndexes.map((index) => capacities[index]),
        desiredWithdrawal,
      );

      return {
        amounts: [0, 0, 0, ...allocation.amounts],
        total: allocation.total,
      };
    }

    const pensionIndexes = [RATE_PENSION, LIFE_ANNUITY, AGE_SAVINGS];
    const freeIndexes = [FREE_FUNDS_REALIZATION, FREE_FUNDS_INVENTORY, ASK];
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
    realizationCapacity,
    totalFreeCapacity,
    realizationBalance,
    freeFundsCostBasis,
  ) {
    if (netTarget <= 0) {
      return 0;
    }

    if (totalFreeCapacity <= 0) {
      return 0;
    }

    const realizationShare = realizationCapacity / totalFreeCapacity;
    const gainShare =
      realizationBalance > 0
        ? Math.max(
            0,
            (realizationBalance - freeFundsCostBasis) / realizationBalance,
          )
        : 0;
    const taxableGainPerGrossWithdrawal = realizationShare * gainShare;
    let grossWithdrawal = netTarget;

    if (taxableGainPerGrossWithdrawal > 0) {
      const grossAtThreshold =
        SHARE_INCOME_THRESHOLD / taxableGainPerGrossWithdrawal;
      const netAtThreshold =
        grossAtThreshold - SHARE_INCOME_THRESHOLD * SHARE_INCOME_LOW_RATE;

      if (netTarget <= netAtThreshold) {
        grossWithdrawal =
          netTarget /
          (1 - SHARE_INCOME_LOW_RATE * taxableGainPerGrossWithdrawal);
      } else {
        grossWithdrawal =
          (netTarget -
            (SHARE_INCOME_HIGH_RATE - SHARE_INCOME_LOW_RATE) *
              SHARE_INCOME_THRESHOLD) /
          (1 - SHARE_INCOME_HIGH_RATE * taxableGainPerGrossWithdrawal);
      }
    }

    assertFinite(
      totalFreeCapacity,
      realizationShare,
      gainShare,
      taxableGainPerGrossWithdrawal,
      grossWithdrawal,
    );
    return Math.min(grossWithdrawal, totalFreeCapacity);
  }

  function grossPensionWithdrawalForNetTarget(
    desiredNetWithdrawal,
    ratePensionShare,
    lifeAnnuityShare,
    pensionWithdrawalTax,
    taxFreeRatePensionAllowance,
  ) {
    if (desiredNetWithdrawal <= 0) {
      return 0;
    }

    const usableTaxFreeAllowance =
      ratePensionShare > 0 ? taxFreeRatePensionAllowance : 0;
    const grossAtAllowanceLimit =
      ratePensionShare > 0 ? usableTaxFreeAllowance / ratePensionShare : 0;
    const netFractionBeforeAllowance =
      1 - pensionWithdrawalTax * lifeAnnuityShare;
    const netAtAllowanceLimit =
      grossAtAllowanceLimit * netFractionBeforeAllowance;

    if (desiredNetWithdrawal <= netAtAllowanceLimit + MONEY_TOLERANCE) {
      if (netFractionBeforeAllowance <= CALCULATION_TOLERANCE) {
        return null;
      }

      const grossWithdrawal = desiredNetWithdrawal / netFractionBeforeAllowance;
      assertFinite(grossWithdrawal);
      return grossWithdrawal;
    }

    const taxablePensionShare = ratePensionShare + lifeAnnuityShare;
    const netFractionAfterAllowance =
      1 - pensionWithdrawalTax * taxablePensionShare;
    if (netFractionAfterAllowance <= CALCULATION_TOLERANCE) {
      return null;
    }

    const grossWithdrawal =
      (desiredNetWithdrawal - pensionWithdrawalTax * usableTaxFreeAllowance) /
      netFractionAfterAllowance;
    assertFinite(grossWithdrawal);
    return grossWithdrawal;
  }

  function allocateForNetWithdrawal(
    balances,
    capacities,
    desiredNetWithdrawal,
    beforeRetirement,
    freeFundsCostBasis,
    pensionWithdrawalTax,
    taxFreeRatePensionAllowance = 0,
  ) {
    const pensionIndexes = [RATE_PENSION, LIFE_ANNUITY, AGE_SAVINGS];
    const freeIndexes = [FREE_FUNDS_REALIZATION, FREE_FUNDS_INVENTORY, ASK];
    const pensionCapacities = pensionIndexes.map((index) => capacities[index]);
    const totalPensionCapacity = pensionCapacities.reduce(
      (total, capacity) => total + capacity,
      0,
    );
    const ratePensionShare =
      totalPensionCapacity > 0
        ? pensionCapacities[RATE_PENSION] / totalPensionCapacity
        : 0;
    const lifeAnnuityShare =
      totalPensionCapacity > 0
        ? pensionCapacities[LIFE_ANNUITY] / totalPensionCapacity
        : 0;
    const requiredGrossPensionWithdrawal = grossPensionWithdrawalForNetTarget(
      desiredNetWithdrawal,
      ratePensionShare,
      lifeAnnuityShare,
      pensionWithdrawalTax,
      taxFreeRatePensionAllowance,
    );
    const desiredGrossPensionWithdrawal =
      requiredGrossPensionWithdrawal ?? totalPensionCapacity;
    const pensionAllocation = beforeRetirement
      ? { amounts: [0, 0, 0], total: 0 }
      : allocateWithdrawals(pensionCapacities, desiredGrossPensionWithdrawal);
    const taxableRatePensionWithdrawal = Math.max(
      0,
      pensionAllocation.amounts[RATE_PENSION] - taxFreeRatePensionAllowance,
    );
    const pensionTax =
      (taxableRatePensionWithdrawal + pensionAllocation.amounts[LIFE_ANNUITY]) *
      pensionWithdrawalTax;
    const pensionNetWithdrawal = pensionAllocation.total - pensionTax;
    const remainingNetWithdrawal = Math.max(
      0,
      desiredNetWithdrawal - pensionNetWithdrawal,
    );
    const freeCapacities = freeIndexes.map((index) => capacities[index]);
    const totalFreeCapacity = freeCapacities.reduce(
      (total, capacity) => total + capacity,
      0,
    );
    const freeGrossWithdrawal = grossWithdrawalForNetTarget(
      remainingNetWithdrawal,
      freeCapacities[0],
      totalFreeCapacity,
      balances[FREE_FUNDS_REALIZATION],
      freeFundsCostBasis,
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
      Math.min(taxableGain, SHARE_INCOME_THRESHOLD) * SHARE_INCOME_LOW_RATE +
      Math.max(0, taxableGain - SHARE_INCOME_THRESHOLD) *
        SHARE_INCOME_HIGH_RATE;
    assertFinite(taxableGain, tax);
    return tax;
  }

  function calculateFreeFundsSale(balance, costBasis, withdrawal) {
    if (balance <= 0 || withdrawal <= 0) {
      return {
        realizedGain: 0,
        tax: 0,
        remainingCostBasis: costBasis,
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
    ratePensionNonDeductibleBasis = 0,
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
      lifeAnnuity: balances[LIFE_ANNUITY],
      ageSavings: balances[AGE_SAVINGS],
      freeFunds:
        balances[FREE_FUNDS_REALIZATION] + balances[FREE_FUNDS_INVENTORY],
      freeFundsRealization: balances[FREE_FUNDS_REALIZATION],
      freeFundsInventory: balances[FREE_FUNDS_INVENTORY],
      ask: balances[ASK],
      totalBalance,
      contribution: 0,
      withdrawal: 0,
      freeFundsWithdrawal: 0,
      realizedFreeFundsGain: 0,
      withdrawalTax: 0,
      annualFreeFundsTax: 0,
      pensionWithdrawalTax: 0,
      lifeAnnuityWithdrawal: 0,
      totalWithdrawalTax: 0,
      netWithdrawal: 0,
      effectiveFreeFundsWithdrawalTaxRate: 0,
      effectiveWithdrawalTaxRate: 0,
      freeFundsCostBasis,
      ratePensionNonDeductibleBasis,
      taxFreeRatePensionWithdrawal: 0,
      taxableRatePensionWithdrawal: 0,
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
    const optionalAmounts = [
      inputs.lifeAnnuityBalance ?? 0,
      inputs.annualLifeAnnuityContribution ?? 0,
    ];
    ageSavingsContributionLimit(inputs);
    if (
      inputs.freeFundsTaxation !== undefined &&
      ![
        FREE_FUNDS_TAXATION.realization,
        FREE_FUNDS_TAXATION.inventory,
      ].includes(inputs.freeFundsTaxation)
    ) {
      throw new Error(
        "Beskatning af frie midler skal være realisations- eller lagerbeskatning.",
      );
    }

    const inventoryShare = freeFundsInventoryShare(inputs);
    if (
      !Number.isFinite(inventoryShare) ||
      inventoryShare < 0 ||
      inventoryShare > 1
    ) {
      throw new Error(
        "Andelen af lagerbeskattede frie midler skal være mellem 0 og 100 %.",
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
      inputs.ratePensionBalance > 0 || inputs.annualRatePensionContribution > 0;
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
    if (optionalAmounts.some((value) => !Number.isFinite(value) || value < 0)) {
      throw new Error("Beløb skal være 0 eller højere.");
    }

    const ratePensionNonDeductibleBasis =
      inputs.ratePensionNonDeductibleBasis ?? 0;
    if (
      !Number.isFinite(ratePensionNonDeductibleBasis) ||
      ratePensionNonDeductibleBasis < 0
    ) {
      throw new Error("Beløb skal være 0 eller højere.");
    }

    if (
      inventoryShare < 1 &&
      inputs.freeFundsCostBasis > inputs.freeFundsBalance
    ) {
      throw new Error(
        "Den samlede købspris må ikke være højere end værdien af de frie midler.",
      );
    }

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

    if (!Number.isFinite(inputs.returnRate) || inputs.returnRate < 0) {
      throw new Error("Det forventede afkast skal være 0 % eller højere.");
    }

    if (!Number.isFinite(inputs.inflationRate) || inputs.inflationRate <= -1) {
      throw new Error("Inflationen skal være større end -100 %.");
    }
  }

  function calculateFire(
    inputs,
    calculationDate = new Date(),
    { includeBridgeCapacity = true } = {},
  ) {
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
    const annualDeductibleRatePensionContribution = Math.min(
      inputs.annualRatePensionContribution,
      CONTRIBUTION_LIMITS.ratePension,
    );
    const annualNonDeductibleRatePensionContribution = Math.max(
      0,
      inputs.annualRatePensionContribution -
        annualDeductibleRatePensionContribution,
    );
    const annualLifeAnnuityContribution =
      inputs.annualLifeAnnuityContribution ?? 0;
    const initialRatePensionNonDeductibleBasis =
      inputs.ratePensionNonDeductibleBasis ?? 0;
    const effectiveAnnualAgeSavingsContribution = Math.min(
      inputs.annualAgeSavingsContribution,
      selectedAgeSavingsContributionLimit,
    );
    const annualAgeSavingsContributionRedirected = Math.max(
      0,
      inputs.annualAgeSavingsContribution -
        effectiveAnnualAgeSavingsContribution,
    );
    const inventoryShare = freeFundsInventoryShare(inputs);
    const freeFundsTaxation =
      inventoryShare === 1
        ? FREE_FUNDS_TAXATION.inventory
        : inventoryShare === 0
          ? FREE_FUNDS_TAXATION.realization
          : FREE_FUNDS_TAXATION.mixed;
    const usesInventoryTax = inventoryShare > 0;

    const netPensionReturn = inputs.returnRate * (1 - inputs.pensionTax);
    const realPensionReturn =
      (1 + netPensionReturn) / (1 + inputs.inflationRate) - 1;
    const realAskReturn =
      (1 + inputs.returnRate * (1 - inputs.askTax)) /
        (1 + inputs.inflationRate) -
      1;
    const grossRealFreeFundsReturn =
      (1 + inputs.returnRate) / (1 + inputs.inflationRate) - 1;
    const lowRateInventoryReturn =
      (1 + inputs.returnRate * (1 - SHARE_INCOME_LOW_RATE)) /
        (1 + inputs.inflationRate) -
      1;
    const rates = [
      realPensionReturn,
      realPensionReturn,
      realPensionReturn,
      grossRealFreeFundsReturn,
      lowRateInventoryReturn,
      realAskReturn,
    ];

    function inventoryTaxForBalance(balance, priorTaxableGain = 0) {
      if (balance <= 0 || inputs.returnRate <= 0) {
        return 0;
      }

      const inventoryGain = balance * inputs.returnRate;
      return (
        calculateShareIncomeTax(priorTaxableGain + inventoryGain) -
        calculateShareIncomeTax(priorTaxableGain)
      );
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

    function inventoryRateForBalance(balance) {
      if (balance <= 0) {
        return lowRateInventoryReturn;
      }

      return (
        (balance * (1 + inputs.returnRate) - inventoryTaxForBalance(balance)) /
          (1 + inputs.inflationRate) /
          balance -
        1
      );
    }

    function ratesForBalances(balances) {
      return [
        realPensionReturn,
        realPensionReturn,
        realPensionReturn,
        grossRealFreeFundsReturn,
        inventoryRateForBalance(balances[FREE_FUNDS_INVENTORY]),
        realAskReturn,
      ];
    }

    function capacitiesForBalances(balances, periods) {
      const currentRates = ratesForBalances(balances);

      return balances.map((balance, index) =>
        index === FREE_FUNDS_INVENTORY
          ? inventoryAnnualCapacity(balance, periods)
          : annualCapacity(balance, currentRates[index], periods),
      );
    }

    function growBalancesWithTax(balances, priorTaxableGain = 0) {
      const inventoryBalance = balances[FREE_FUNDS_INVENTORY];
      const inventoryTax = inventoryTaxForBalance(
        inventoryBalance,
        priorTaxableGain,
      );
      const currentRates = ratesForBalances(balances);
      const grownBalances = growBalances(balances, currentRates);

      grownBalances[FREE_FUNDS_INVENTORY] = Math.max(
        0,
        (inventoryBalance * (1 + inputs.returnRate) - inventoryTax) /
          (1 + inputs.inflationRate),
      );

      const realTax = inventoryTax / (1 + inputs.inflationRate);
      const realTaxableGain = usesInventoryTax
        ? Math.max(0, inventoryBalance * inputs.returnRate) /
          (1 + inputs.inflationRate)
        : 0;

      assertFinite(...grownBalances, realTax, realTaxableGain);
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
      inputs.lifeAnnuityBalance ?? 0,
      inputs.ageSavingsBalance,
      inputs.freeFundsBalance * (1 - inventoryShare),
      inputs.freeFundsBalance * inventoryShare,
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

      if (contributions[FREE_FUNDS_INVENTORY] > 0) {
        const startingBalance = startingBalances[FREE_FUNDS_INVENTORY];
        const contribution = contributions[FREE_FUNDS_INVENTORY];
        const nominalHalfYearGrowth = Math.sqrt(1 + inputs.returnRate);
        const inflationHalfYearGrowth = Math.sqrt(1 + inputs.inflationRate);
        const openingBalanceAtYearEnd =
          (startingBalance * (1 + inputs.returnRate)) /
          (1 + inputs.inflationRate);
        const contributionAtYearEnd =
          contribution * (nominalHalfYearGrowth / inflationHalfYearGrowth);
        const taxableGain =
          inputs.returnRate > 0
            ? startingBalance * inputs.returnRate +
              contribution *
                inflationHalfYearGrowth *
                (nominalHalfYearGrowth - 1)
            : 0;
        const tax =
          calculateShareIncomeTax(taxableGain) / (1 + inputs.inflationRate);

        endingBalances[FREE_FUNDS_INVENTORY] = Math.max(
          0,
          openingBalanceAtYearEnd + contributionAtYearEnd - tax,
        );
        growth.freeFundsTax = tax;
        growth.freeFundsTaxableGain = taxableGain / (1 + inputs.inflationRate);
      }

      assertFinite(...endingBalances);
      return { ...growth, balances: endingBalances };
    }

    function annualTaxFreeRatePensionAllowance(
      nonDeductibleBasis,
      remainingPayoutYears,
    ) {
      if (nonDeductibleBasis <= 0 || remainingPayoutYears <= 0) {
        return 0;
      }

      // SKAT requires the tax-free principal to be spread over the fixed
      // payout period. This annual model approximates that rule with equal
      // nominal allowances. Deflating the remaining basis after each year
      // makes the allowance decrease in real terms when inflation is positive.
      const allowance = nonDeductibleBasis / remainingPayoutYears;
      assertFinite(allowance);
      return allowance;
    }

    function pensionTargetForMix(
      ratePension,
      lifeAnnuity,
      ageSavings,
      nonDeductibleBasis,
      desiredWithdrawal = inputs.desiredAnnualWithdrawal,
    ) {
      if (desiredWithdrawal <= 0) {
        return 0;
      }

      const totalPension = ratePension + lifeAnnuity + ageSavings;
      if (totalPension <= CALCULATION_TOLERANCE) {
        if (inputs.withdrawalAfterTax) {
          return null;
        }
        return (
          desiredWithdrawal *
          presentValueFactor(realPensionReturn, inputs.payoutYears)
        );
      }

      const payoutFactor = presentValueFactor(
        realPensionReturn,
        inputs.payoutYears,
      );
      if (!inputs.withdrawalAfterTax) {
        return desiredWithdrawal * payoutFactor;
      }

      const rateShare = ratePension / totalPension;
      const lifeAnnuityShare = lifeAnnuity / totalPension;
      const initialTaxFreeAllowance = annualTaxFreeRatePensionAllowance(
        nonDeductibleBasis,
        inputs.payoutYears,
      );
      let target = 0;
      let discountFactor = 1;

      for (let period = 0; period < inputs.payoutYears; period += 1) {
        const taxFreeAllowance =
          initialTaxFreeAllowance / Math.pow(1 + inputs.inflationRate, period);
        const grossWithdrawal = grossPensionWithdrawalForNetTarget(
          desiredWithdrawal,
          rateShare,
          lifeAnnuityShare,
          pensionWithdrawalTax,
          taxFreeAllowance,
        );
        if (grossWithdrawal === null) {
          return null;
        }

        target += grossWithdrawal / discountFactor;
        discountFactor *= 1 + realPensionReturn;
        assertFinite(target, discountFactor);
      }

      assertFinite(target);
      return target;
    }

    function netPensionAnnualCapacity(
      ratePension,
      lifeAnnuity,
      ageSavings,
      nonDeductibleBasis,
    ) {
      const totalPension = ratePension + lifeAnnuity + ageSavings;
      const payoutFactor = presentValueFactor(
        realPensionReturn,
        inputs.payoutYears,
      );
      if (totalPension <= 0 || payoutFactor <= 0) {
        return 0;
      }

      const grossCapacity = totalPension / payoutFactor;
      if (!inputs.withdrawalAfterTax) {
        return grossCapacity;
      }

      let affordable = 0;
      let unaffordable = grossCapacity;
      for (let iteration = 0; iteration < 60; iteration += 1) {
        if (unaffordable - affordable <= MONEY_TOLERANCE) {
          break;
        }

        const candidate = (affordable + unaffordable) / 2;
        const target = pensionTargetForMix(
          ratePension,
          lifeAnnuity,
          ageSavings,
          nonDeductibleBasis,
          candidate,
        );
        if (target !== null && target <= totalPension + MONEY_TOLERANCE) {
          affordable = candidate;
        } else {
          unaffordable = candidate;
        }
      }

      assertFinite(affordable);
      return affordable;
    }

    function simulateDrawdown(
      startYear,
      startBalances,
      startFreeFundsCostBasis,
      startRatePensionNonDeductibleBasis,
      {
        desiredWithdrawal = inputs.desiredAnnualWithdrawal,
        endYear = finalYear,
        shouldRecord = false,
        startingContribution = 0,
      } = {},
    ) {
      let balances = [...startBalances];
      let freeFundsCostBasis = startFreeFundsCostBasis;
      let ratePensionNonDeductibleBasis = startRatePensionNonDeductibleBasis;
      const rows = [];
      let isFullyFunded = true;
      let firstShortfallDate = null;
      let annualFreeFundsTax = 0;
      let annualFreeFundsTaxableGain = 0;

      for (let year = startYear; year < endYear; year += 1) {
        const beforeRetirement = year < yearsToRetirement;
        const periods = beforeRetirement
          ? yearsToRetirement - year
          : endYear - year;
        const capacities = capacitiesForBalances(balances, periods);
        const remainingPayoutYears = beforeRetirement ? 0 : finalYear - year;
        const taxFreeRatePensionAllowance = beforeRetirement
          ? 0
          : annualTaxFreeRatePensionAllowance(
              ratePensionNonDeductibleBasis,
              remainingPayoutYears,
            );
        const allocation = inputs.withdrawalAfterTax
          ? allocateForNetWithdrawal(
              balances,
              capacities,
              desiredWithdrawal,
              beforeRetirement,
              freeFundsCostBasis,
              pensionWithdrawalTax,
              taxFreeRatePensionAllowance,
            )
          : allocateForPhase(capacities, desiredWithdrawal, beforeRetirement);
        const date = annualDate(asOfDate, year);
        const realizationWithdrawal =
          allocation.amounts[FREE_FUNDS_REALIZATION];
        const freeFundsWithdrawal =
          realizationWithdrawal + allocation.amounts[FREE_FUNDS_INVENTORY];
        const freeFundsSale = calculateFreeFundsSale(
          balances[FREE_FUNDS_REALIZATION],
          freeFundsCostBasis,
          realizationWithdrawal,
        );
        const taxFreeRatePensionWithdrawal = Math.min(
          allocation.amounts[RATE_PENSION],
          taxFreeRatePensionAllowance,
        );
        const taxableRatePensionWithdrawal = Math.max(
          0,
          allocation.amounts[RATE_PENSION] - taxFreeRatePensionWithdrawal,
        );
        const lifeAnnuityWithdrawal = allocation.amounts[LIFE_ANNUITY];
        const pensionWithdrawalTaxAmount =
          (taxableRatePensionWithdrawal + lifeAnnuityWithdrawal) *
          pensionWithdrawalTax;
        const totalWithdrawalTax =
          freeFundsSale.tax + pensionWithdrawalTaxAmount;
        const netWithdrawal = allocation.total - totalWithdrawalTax;
        const effectiveFreeFundsWithdrawalTaxRate =
          freeFundsWithdrawal > 0 ? freeFundsSale.tax / freeFundsWithdrawal : 0;
        const effectiveWithdrawalTaxRate =
          allocation.total > 0 ? totalWithdrawalTax / allocation.total : 0;
        const deliveredWithdrawal = inputs.withdrawalAfterTax
          ? netWithdrawal
          : allocation.total;
        const shortfall =
          deliveredWithdrawal + MONEY_TOLERANCE < desiredWithdrawal;

        if (shortfall && !firstShortfallDate) {
          firstShortfallDate = new Date(date);
        }
        isFullyFunded = isFullyFunded && !shortfall;

        if (shouldRecord) {
          const pensionWithdrawal =
            allocation.amounts[RATE_PENSION] +
            allocation.amounts[LIFE_ANNUITY] +
            allocation.amounts[AGE_SAVINGS];
          const freeWithdrawal =
            allocation.amounts[FREE_FUNDS_REALIZATION] +
            allocation.amounts[FREE_FUNDS_INVENTORY] +
            allocation.amounts[ASK];
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
              ratePensionNonDeductibleBasis,
              {
                phase: beforeRetirement ? "FIRE" : "Pension",
                contribution: year === startYear ? startingContribution : 0,
                withdrawal: allocation.total,
                freeFundsWithdrawal,
                realizedFreeFundsGain: freeFundsSale.realizedGain,
                withdrawalTax: freeFundsSale.tax,
                pensionWithdrawalTax: pensionWithdrawalTaxAmount,
                lifeAnnuityWithdrawal,
                taxFreeRatePensionWithdrawal,
                taxableRatePensionWithdrawal,
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
        const growth = growBalancesWithTax(
          balances,
          Math.max(0, freeFundsSale.realizedGain),
        );
        if (shouldRecord) {
          rows[rows.length - 1].annualFreeFundsTax = growth.freeFundsTax;
        }
        balances = growth.balances;
        annualFreeFundsTax += growth.freeFundsTax;
        annualFreeFundsTaxableGain += growth.freeFundsTaxableGain;
        freeFundsCostBasis /= 1 + inputs.inflationRate;
        ratePensionNonDeductibleBasis =
          Math.max(
            0,
            ratePensionNonDeductibleBasis - taxFreeRatePensionAllowance,
          ) /
          (1 + inputs.inflationRate);
        assertFinite(freeFundsCostBasis, ratePensionNonDeductibleBasis);
      }

      if (shouldRecord) {
        rows.push(
          createRow(
            inputs.currentAge + endYear,
            annualDate(asOfDate, endYear),
            balances,
            freeFundsCostBasis,
            ratePensionNonDeductibleBasis,
            { phase: "Slut" },
          ),
        );
      }

      return {
        rows,
        finalBalances: balances,
        finalFreeFundsCostBasis: freeFundsCostBasis,
        finalRatePensionNonDeductibleBasis: ratePensionNonDeductibleBasis,
        annualFreeFundsTax,
        annualFreeFundsTaxableGain,
        isFullyFunded,
        firstShortfallDate,
      };
    }

    function sustainableBridgeWithdrawal(
      startYear,
      startBalances,
      startFreeFundsCostBasis,
      startRatePensionNonDeductibleBasis,
    ) {
      const bridgeYears = yearsToRetirement - startYear;

      if (bridgeYears <= 0) {
        return 0;
      }

      const grossCapacity = allocateForPhase(
        capacitiesForBalances(startBalances, bridgeYears),
        Number.MAX_VALUE,
        true,
      ).total;

      if (
        grossCapacity <= 0 ||
        !inputs.withdrawalAfterTax ||
        startBalances[FREE_FUNDS_REALIZATION] <= MONEY_TOLERANCE
      ) {
        return grossCapacity;
      }

      function bridgeIsFunded(desiredWithdrawal) {
        return simulateDrawdown(
          startYear,
          startBalances,
          startFreeFundsCostBasis,
          startRatePensionNonDeductibleBasis,
          {
            desiredWithdrawal,
            endYear: yearsToRetirement,
          },
        ).isFullyFunded;
      }

      if (bridgeIsFunded(grossCapacity)) {
        return grossCapacity;
      }

      let affordable = 0;
      let unaffordable = grossCapacity;

      for (let iteration = 0; iteration < 60; iteration += 1) {
        if (unaffordable - affordable <= MONEY_TOLERANCE) {
          break;
        }

        const candidate = (affordable + unaffordable) / 2;

        if (bridgeIsFunded(candidate)) {
          affordable = candidate;
        } else {
          unaffordable = candidate;
        }
      }

      assertFinite(affordable);
      return affordable;
    }

    function evaluateMilestone(
      year,
      balances,
      freeFundsCostBasis,
      ratePensionNonDeductibleBasis,
    ) {
      const bridgeYears = yearsToRetirement - year;
      const pensionGrowth = Math.pow(1 + realPensionReturn, bridgeYears);
      const ratePensionAtRetirement = balances[RATE_PENSION] * pensionGrowth;
      const lifeAnnuityAtRetirement = balances[LIFE_ANNUITY] * pensionGrowth;
      const ageSavingsAtRetirement = balances[AGE_SAVINGS] * pensionGrowth;
      const pensionAtRetirement =
        ratePensionAtRetirement +
        lifeAnnuityAtRetirement +
        ageSavingsAtRetirement;
      const ratePensionNonDeductibleBasisAtRetirement =
        ratePensionNonDeductibleBasis /
        Math.pow(1 + inputs.inflationRate, bridgeYears);
      const pensionNetAnnualCapacity = netPensionAnnualCapacity(
        ratePensionAtRetirement,
        lifeAnnuityAtRetirement,
        ageSavingsAtRetirement,
        ratePensionNonDeductibleBasisAtRetirement,
      );
      const coastFinanced =
        pensionNetAnnualCapacity + MONEY_TOLERANCE >=
        inputs.desiredAnnualWithdrawal;
      const pensionTargetAtRetirement = pensionTargetForMix(
        ratePensionAtRetirement,
        lifeAnnuityAtRetirement,
        ageSavingsAtRetirement,
        ratePensionNonDeductibleBasisAtRetirement,
      );
      const pensionTarget =
        pensionTargetAtRetirement === null
          ? null
          : pensionTargetAtRetirement / pensionGrowth;
      const drawdown = simulateDrawdown(
        year,
        balances,
        freeFundsCostBasis,
        ratePensionNonDeductibleBasis,
        { shouldRecord: false },
      );

      assertFinite(
        pensionAtRetirement,
        pensionNetAnnualCapacity,
        pensionTarget ?? 0,
      );
      return {
        age: inputs.currentAge + year,
        date: annualDate(asOfDate, year),
        ratePension: balances[RATE_PENSION],
        lifeAnnuity: balances[LIFE_ANNUITY],
        ageSavings: balances[AGE_SAVINGS],
        freeFunds:
          balances[FREE_FUNDS_REALIZATION] + balances[FREE_FUNDS_INVENTORY],
        freeFundsRealization: balances[FREE_FUNDS_REALIZATION],
        freeFundsInventory: balances[FREE_FUNDS_INVENTORY],
        freeFundsCostBasis,
        ratePensionNonDeductibleBasis,
        ask: balances[ASK],
        bridgeYears,
        pensionTarget,
        coastFinanced,
        possibleBridgeWithdrawal: null,
        fireReady: drawdown.isFullyFunded,
      };
    }

    const accumulationRows = [];
    const milestoneRows = [];
    let balances = [...initialBalances];
    let freeFundsCostBasis = inputs.freeFundsCostBasis * (1 - inventoryShare);
    let ratePensionNonDeductibleBasis = initialRatePensionNonDeductibleBasis;
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
    let drawdownStartRatePensionNonDeductibleBasis = null;
    let drawdownStartContribution = 0;

    for (let year = 0; year <= yearsToRetirement; year += 1) {
      const milestone = evaluateMilestone(
        year,
        balances,
        freeFundsCostBasis,
        ratePensionNonDeductibleBasis,
      );
      milestoneRows.push(milestone);

      if (!pensionCoastRow && milestone.coastFinanced) {
        pensionCoastRow = milestone;
        pensionStopRow = pensionStopRow || milestone;
        pensionContributionsActive = false;
      }

      if (milestone.fireReady) {
        if (includeBridgeCapacity) {
          milestone.possibleBridgeWithdrawal = sustainableBridgeWithdrawal(
            year,
            balances,
            freeFundsCostBasis,
            ratePensionNonDeductibleBasis,
          );
        }
        fireRow = milestone;
        pensionStopRow = pensionStopRow || milestone;
        drawdownStartYear = year;
        drawdownStartBalances = [...balances];
        drawdownStartFreeFundsCostBasis = freeFundsCostBasis;
        drawdownStartRatePensionNonDeductibleBasis =
          ratePensionNonDeductibleBasis;
        drawdownStartContribution = contributionAtCheckpoint;
        break;
      }

      if (year === yearsToRetirement) {
        drawdownStartBalances = [...balances];
        drawdownStartFreeFundsCostBasis = freeFundsCostBasis;
        drawdownStartRatePensionNonDeductibleBasis =
          ratePensionNonDeductibleBasis;
        drawdownStartContribution = contributionAtCheckpoint;
        break;
      }

      accumulationRows.push(
        createRow(
          inputs.currentAge + year,
          annualDate(asOfDate, year),
          balances,
          freeFundsCostBasis,
          ratePensionNonDeductibleBasis,
          {
            phase: "Opsparing",
            contribution: contributionAtCheckpoint,
          },
        ),
      );

      const nextYear = year + 1;
      const shouldCalculatePensionContributions =
        pensionContributionsActive || redirectsPensionContributions;
      const deductibleRatePensionContribution =
        shouldCalculatePensionContributions
          ? contributionAtMidyear(
              annualDeductibleRatePensionContribution,
              nextYear,
            )
          : 0;
      const nonDeductibleRatePensionContribution =
        shouldCalculatePensionContributions
          ? contributionAtMidyear(
              annualNonDeductibleRatePensionContribution,
              nextYear,
            )
          : 0;
      const lifeAnnuityContribution = shouldCalculatePensionContributions
        ? contributionAtMidyear(annualLifeAnnuityContribution, nextYear)
        : 0;
      const ageSavingsContribution = shouldCalculatePensionContributions
        ? contributionAtMidyear(effectiveAnnualAgeSavingsContribution, nextYear)
        : 0;
      const ageSavingsContributionRedirected = contributionAtMidyear(
        annualAgeSavingsContributionRedirected,
        nextYear,
      );
      const redirectedPensionContribution =
        !pensionContributionsActive && redirectsPensionContributions
          ? deductibleRatePensionContribution *
              (1 - ratePensionContributionTaxRelief) +
            nonDeductibleRatePensionContribution +
            lifeAnnuityContributionNetCost(
              lifeAnnuityContribution,
              ratePensionContributionTaxRelief,
            ) +
            ageSavingsContribution
          : 0;
      const totalFreeFundsContribution =
        contributionAtMidyear(inputs.annualFreeFundsContribution, nextYear) +
        ageSavingsContributionRedirected +
        redirectedPensionContribution;
      const contributions = [
        pensionContributionsActive
          ? deductibleRatePensionContribution +
            nonDeductibleRatePensionContribution
          : 0,
        pensionContributionsActive ? lifeAnnuityContribution : 0,
        pensionContributionsActive ? ageSavingsContribution : 0,
        totalFreeFundsContribution * (1 - inventoryShare),
        totalFreeFundsContribution * inventoryShare,
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
      freeFundsCostBasis =
        freeFundsCostBasis / (1 + inputs.inflationRate) +
        contributions[FREE_FUNDS_REALIZATION] /
          Math.sqrt(1 + inputs.inflationRate);
      ratePensionNonDeductibleBasis =
        ratePensionNonDeductibleBasis / (1 + inputs.inflationRate) +
        (pensionContributionsActive
          ? nonDeductibleRatePensionContribution /
            Math.sqrt(1 + inputs.inflationRate)
          : 0);
      assertFinite(
        contributionAtCheckpoint,
        freeFundsCostBasis,
        ratePensionNonDeductibleBasis,
        ...balances,
      );
    }

    const drawdown = simulateDrawdown(
      drawdownStartYear,
      drawdownStartBalances,
      drawdownStartFreeFundsCostBasis,
      drawdownStartRatePensionNonDeductibleBasis,
      {
        shouldRecord: true,
        startingContribution: drawdownStartContribution,
      },
    );
    const planRows = [...accumulationRows, ...drawdown.rows];
    const retirementOpeningRow = planRows.find(
      (row) => row.age === inputs.retirementAge,
    );
    const projectedRatePension = retirementOpeningRow?.ratePension ?? 0;
    const projectedLifeAnnuity = retirementOpeningRow?.lifeAnnuity ?? 0;
    const projectedAgeSavings = retirementOpeningRow?.ageSavings ?? 0;
    const projectedRatePensionNonDeductibleBasis =
      retirementOpeningRow?.ratePensionNonDeductibleBasis ?? 0;
    const requiredAtRetirement = pensionTargetForMix(
      projectedRatePension,
      projectedLifeAnnuity,
      projectedAgeSavings,
      projectedRatePensionNonDeductibleBasis,
    );
    const pensionTargetToday =
      requiredAtRetirement === null
        ? null
        : requiredAtRetirement /
          Math.pow(1 + realPensionReturn, yearsToRetirement);
    const finalRow = planRows[planRows.length - 1];
    const finalTaxFreeRatePension = Math.min(
      finalRow.ratePension,
      finalRow.ratePensionNonDeductibleBasis,
    );
    const finalTaxablePension =
      Math.max(0, finalRow.ratePension - finalTaxFreeRatePension) +
      finalRow.lifeAnnuity;
    const finalRealizationGain = Math.max(
      0,
      finalRow.freeFundsRealization - finalRow.freeFundsCostBasis,
    );
    const finalReserveAfterTax =
      finalTaxFreeRatePension +
      finalTaxablePension * (1 - pensionWithdrawalTax) +
      finalRow.ageSavings +
      finalRow.freeFundsRealization -
      calculateShareIncomeTax(finalRealizationGain) +
      finalRow.freeFundsInventory +
      finalRow.ask;
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
      accumulationFreeFundsTaxableGain + drawdown.annualFreeFundsTaxableGain;
    const totalRealizedFreeFundsGain = planRows.reduce(
      (total, row) => total + Math.max(0, row.realizedFreeFundsGain),
      0,
    );
    const totalTaxableFreeFundsGain =
      totalFreeFundsTaxableGain + totalRealizedFreeFundsGain;
    const effectiveFreeFundsTaxRate = usesInventoryTax
      ? totalTaxableFreeFundsGain > 0
        ? totalFreeFundsTax / totalTaxableFreeFundsGain
        : 0
      : effectiveFreeFundsWithdrawalTaxRate;
    const pensionTargetAtStop = pensionStopRow
      ? pensionStopRow.pensionTarget
      : null;
    const annualNetContributionBudget = contributionNetBudget(
      {
        annualRatePensionContribution: inputs.annualRatePensionContribution,
        annualLifeAnnuityContribution,
        annualAgeSavingsContribution: inputs.annualAgeSavingsContribution,
        annualFreeFundsContribution: inputs.annualFreeFundsContribution,
      },
      ratePensionContributionTaxRelief,
    );
    const ageSavingsContributionLimitExceeded =
      inputs.annualAgeSavingsContribution >
      selectedAgeSavingsContributionLimit + MONEY_TOLERANCE;
    const lifeAnnuityContributionLimitExceeded =
      annualLifeAnnuityContribution >
      CONTRIBUTION_LIMITS.lifeAnnuity + MONEY_TOLERANCE;
    assertFinite(
      requiredAtRetirement ?? 0,
      pensionTargetToday ?? 0,
      pensionTargetAtStop ?? 0,
      finalReserveAfterTax,
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
      freeFundsInventoryShare: inventoryShare,
      netPensionReturn,
      realPensionReturn,
      realAskReturn,
      realFreeFundsReturn:
        inputs.freeFundsBalance > 0
          ? (initialBalances[FREE_FUNDS_REALIZATION] *
              grossRealFreeFundsReturn +
              initialBalances[FREE_FUNDS_INVENTORY] *
                inventoryRateForBalance(
                  initialBalances[FREE_FUNDS_INVENTORY],
                )) /
            inputs.freeFundsBalance
          : grossRealFreeFundsReturn * (1 - inventoryShare) +
            lowRateInventoryReturn * inventoryShare,
      yearsToRetirement,
      retirementDate,
      finalDate,
      requiredAtRetirement,
      pensionTargetToday,
      pensionCoastRow,
      pensionStopRow,
      pensionTargetAtStop,
      annualNetContributionBudget,
      ratePensionContributionTaxRelief,
      ratePensionContributionLimit: CONTRIBUTION_LIMITS.ratePension,
      annualDeductibleRatePensionContribution,
      annualNonDeductibleRatePensionContribution,
      annualLifeAnnuityContribution,
      lifeAnnuityContributionLimit: CONTRIBUTION_LIMITS.lifeAnnuity,
      lifeAnnuityContributionLimitExceeded,
      ageSavingsContributionLimit: selectedAgeSavingsContributionLimit,
      ageSavingsContributionLimitExceeded,
      annualAgeSavingsContributionRedirected,
      effectiveAnnualAgeSavingsContribution,
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
      finalReserveAfterTax,
    };
  }

  function contributionSnapshot(contributions, calculation) {
    return {
      ...contributions,
      annualPensionTaxSaving: pensionContributionTaxSaving(
        contributions,
        calculation.ratePensionContributionTaxRelief,
      ),
      fireAge: calculation.fireRow?.age ?? null,
      fireDate: calculation.fireRow ? new Date(calculation.fireRow.date) : null,
      finalReserveAfterTax: calculation.finalReserveAfterTax,
      finalAge: calculation.finalRow.age,
    };
  }

  function contributionDistance(first, second) {
    return (
      Math.abs(
        first.annualRatePensionContribution -
          second.annualRatePensionContribution,
      ) +
      Math.abs(
        first.annualLifeAnnuityContribution -
          second.annualLifeAnnuityContribution,
      ) +
      Math.abs(
        first.annualAgeSavingsContribution -
          second.annualAgeSavingsContribution,
      ) +
      Math.abs(
        first.annualFreeFundsContribution - second.annualFreeFundsContribution,
      )
    );
  }

  function candidateKey(candidate) {
    return [
      candidate.annualRatePensionContribution,
      candidate.annualLifeAnnuityContribution,
      candidate.annualAgeSavingsContribution,
    ]
      .map((value) => value.toFixed(4))
      .join(":");
  }

  function compareEvaluations(first, second) {
    const firstFireTime = first.calculation.fireRow
      ? first.calculation.fireRow.date.getTime()
      : Number.POSITIVE_INFINITY;
    const secondFireTime = second.calculation.fireRow
      ? second.calculation.fireRow.date.getTime()
      : Number.POSITIVE_INFINITY;

    return (
      firstFireTime - secondFireTime ||
      second.calculation.finalReserveAfterTax -
        first.calculation.finalReserveAfterTax ||
      first.distance - second.distance ||
      second.candidate.annualFreeFundsContribution -
        first.candidate.annualFreeFundsContribution ||
      candidateKey(first.candidate).localeCompare(
        candidateKey(second.candidate),
      )
    );
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

  function optimizeAnnualContributions(inputs, calculationDate = new Date()) {
    const currentCalculation = calculateFire(inputs, calculationDate, {
      includeBridgeCapacity: false,
    });
    const currentContributions = {
      annualRatePensionContribution: inputs.annualRatePensionContribution,
      annualLifeAnnuityContribution:
        inputs.annualLifeAnnuityContribution ?? 0,
      annualAgeSavingsContribution: inputs.annualAgeSavingsContribution,
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
    const currentContributionsAreWithinLimits =
      currentContributions.annualRatePensionContribution <=
        CONTRIBUTION_LIMITS.ratePension + MONEY_TOLERANCE &&
      currentContributions.annualLifeAnnuityContribution <=
        CONTRIBUTION_LIMITS.lifeAnnuity + MONEY_TOLERANCE &&
      currentContributions.annualAgeSavingsContribution <=
        selectedAgeSavingsContributionLimit + MONEY_TOLERANCE;

    function completeCandidate(ratePension, lifeAnnuity, ageSavings) {
      if (
        ratePension < -MONEY_TOLERANCE ||
        ratePension > CONTRIBUTION_LIMITS.ratePension + MONEY_TOLERANCE ||
        lifeAnnuity < -MONEY_TOLERANCE ||
        lifeAnnuity > CONTRIBUTION_LIMITS.lifeAnnuity + MONEY_TOLERANCE ||
        ageSavings < -MONEY_TOLERANCE ||
        ageSavings > selectedAgeSavingsContributionLimit + MONEY_TOLERANCE
      ) {
        return null;
      }

      const candidate = {
        annualRatePensionContribution: Math.max(0, ratePension),
        annualLifeAnnuityContribution: Math.max(0, lifeAnnuity),
        annualAgeSavingsContribution: Math.max(0, ageSavings),
        annualFreeFundsContribution: 0,
      };
      const pensionAndAgeNetCost = contributionNetBudget(
        candidate,
        ratePensionContributionTaxRelief,
      );
      const freeFunds = annualNetBudget - pensionAndAgeNetCost;

      if (freeFunds < -MONEY_TOLERANCE) {
        return null;
      }
      candidate.annualFreeFundsContribution = Math.max(0, freeFunds);
      return candidate;
    }

    function evaluate(candidate) {
      const calculation = calculateFire(
        { ...inputs, ...candidate },
        calculationDate,
        { includeBridgeCapacity: false },
      );
      const evaluation = {
        candidate,
        calculation,
        distance: contributionDistance(candidate, currentContributions),
      };
      return evaluation;
    }

    function splitPensionContribution(totalPensionContribution) {
      const annualRatePensionContribution = Math.min(
        CONTRIBUTION_LIMITS.ratePension,
        totalPensionContribution,
      );

      return {
        annualRatePensionContribution,
        annualLifeAnnuityContribution:
          totalPensionContribution - annualRatePensionContribution,
      };
    }

    const ratePensionCandidates = contributionCandidates(
      CONTRIBUTION_LIMITS.ratePension,
      currentContributions.annualRatePensionContribution,
    );
    const lifeAnnuityCandidates = contributionCandidates(
      CONTRIBUTION_LIMITS.lifeAnnuity,
      currentContributions.annualLifeAnnuityContribution,
    );
    const ageSavingsCandidates = contributionCandidates(
      selectedAgeSavingsContributionLimit,
      currentContributions.annualAgeSavingsContribution,
    );
    const totalPensionCandidates = new Set();
    ratePensionCandidates.forEach((ratePension) => {
      lifeAnnuityCandidates.forEach((lifeAnnuity) => {
        totalPensionCandidates.add(ratePension + lifeAnnuity);
      });
    });

    let bestEvaluation = null;
    let evaluatedCandidates = 0;
    [...totalPensionCandidates]
      .sort((first, second) => first - second)
      .forEach((totalPensionContribution) => {
        const pensionSplit = splitPensionContribution(
          totalPensionContribution,
        );
        ageSavingsCandidates.forEach((ageSavingsContribution) => {
          const candidate = completeCandidate(
            pensionSplit.annualRatePensionContribution,
            pensionSplit.annualLifeAnnuityContribution,
            ageSavingsContribution,
          );
          if (!candidate) {
            return;
          }

          const evaluation = evaluate(candidate);
          evaluatedCandidates += 1;
          if (
            !bestEvaluation ||
            compareEvaluations(evaluation, bestEvaluation) < 0
          ) {
            bestEvaluation = evaluation;
          }
        });
      });

    let bestCandidate = bestEvaluation?.candidate ?? null;
    let bestCalculation = bestEvaluation?.calculation ?? null;
    const bestFireTime = bestCalculation?.fireRow
      ? bestCalculation.fireRow.date.getTime()
      : Number.POSITIVE_INFINITY;

    const currentFireTime = currentCalculation.fireRow
      ? currentCalculation.fireRow.date.getTime()
      : Number.POSITIVE_INFINITY;
    const currentEvaluation = {
      candidate: currentContributions,
      calculation: currentCalculation,
      distance: 0,
    };
    let status = "improved";

    if (!bestCalculation?.fireRow) {
      status = "unachievable";
    } else if (!currentContributionsAreWithinLimits) {
      status = "limits-applied";
    } else if (compareEvaluations(currentEvaluation, bestEvaluation) <= 0) {
      status = "current-optimal";
      bestCandidate = currentContributions;
      bestCalculation = currentCalculation;
    } else if (currentFireTime === bestFireTime) {
      status = "larger-reserve";
    }

    return {
      status,
      current: contributionSnapshot(currentContributions, currentCalculation),
      recommended:
        status === "unachievable"
          ? null
          : contributionSnapshot(bestCandidate, bestCalculation),
      annualNetBudget,
      ratePensionContributionTaxRelief,
      limits: {
        ratePension: CONTRIBUTION_LIMITS.ratePension,
        lifeAnnuity: CONTRIBUTION_LIMITS.lifeAnnuity,
        ageSavings: selectedAgeSavingsContributionLimit,
      },
      precision: CONTRIBUTION_SEARCH_STEP,
      evaluatedCandidates,
      searchMethod: "exhaustive-grid",
    };
  }

  return {
    calculateFire,
    optimizeAnnualContributions,
    CONTRIBUTION_LIMITS,
    FREE_FUNDS_TAXATION,
  };
});
