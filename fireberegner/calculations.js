(function (root, factory) {
  const lifeAnnuityCalculations =
    typeof module === "object" && module.exports
      ? require("./life-annuity.js")
      : root.LifeAnnuityCalculations;
  const api = factory(lifeAnnuityCalculations);

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  root.FireCalculations = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (
  lifeAnnuityCalculations,
) {
  const { calculateLifeAnnuityMetrics } =
    lifeAnnuityCalculations;
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
  const RETURN_STRATEGY = Object.freeze({
    none: "none",
    declining: "declining",
    riskTent: "riskTent",
  });
  const DEFAULT_DEFENSIVE_RETURN_RATE = 0.04;
  const DEFAULT_RETURN_DECLINE_YEARS = 10;
  const DEFAULT_RETURN_RECOVERY_YEARS = 15;
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

  function returnStrategy(inputs) {
    return inputs.returnStrategy ?? RETURN_STRATEGY.none;
  }

  function defensiveReturnRate(inputs) {
    return inputs.defensiveReturnRate ?? DEFAULT_DEFENSIVE_RETURN_RATE;
  }

  function returnDeclineYears(inputs) {
    return inputs.returnDeclineYears ?? DEFAULT_RETURN_DECLINE_YEARS;
  }

  function returnRecoveryYears(inputs) {
    return inputs.returnRecoveryYears ?? DEFAULT_RETURN_RECOVERY_YEARS;
  }

  function strategyReturnRate(
    growthReturnRate,
    defensiveRate,
    strategy,
    year,
    firstWithdrawalYear,
    declineYears = DEFAULT_RETURN_DECLINE_YEARS,
    recoveryYears = DEFAULT_RETURN_RECOVERY_YEARS,
  ) {
    if (strategy === RETURN_STRATEGY.none) {
      return growthReturnRate;
    }

    if (year < firstWithdrawalYear) {
      if (declineYears === 0) {
        return growthReturnRate;
      }

      const declineStartYear = firstWithdrawalYear - declineYears;
      if (year <= declineStartYear) {
        return growthReturnRate;
      }

      const progress =
        (year - declineStartYear) / declineYears;
      return growthReturnRate + (defensiveRate - growthReturnRate) * progress;
    }

    if (strategy === RETURN_STRATEGY.declining) {
      return defensiveRate;
    }

    if (year === firstWithdrawalYear) {
      return defensiveRate;
    }

    if (recoveryYears === 0) {
      return growthReturnRate;
    }

    const recoveryEndYear = firstWithdrawalYear + recoveryYears;
    if (year >= recoveryEndYear) {
      return growthReturnRate;
    }

    const progress =
      (year - firstWithdrawalYear) / recoveryYears;
    return defensiveRate + (growthReturnRate - defensiveRate) * progress;
  }

  function presentValueFactor(rates) {
    let factor = 0;
    let growth = 1;

    rates.forEach((rate) => {
      factor += 1 / growth;
      growth *= 1 + rate;
      assertFinite(factor, growth);
    });

    return factor;
  }

  function annualCapacity(balance, rates) {
    if (balance <= 0 || rates.length <= 0) {
      return 0;
    }

    const factor = presentValueFactor(rates);
    const capacity = factor > 0 ? balance / factor : 0;
    assertFinite(capacity);
    return capacity;
  }

  function compoundGrowth(rates) {
    const growth = rates.reduce((factor, rate) => factor * (1 + rate), 1);
    assertFinite(growth);
    return growth;
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
      pensionReturnRate: null,
      freeFundsReturnRate: null,
      ratePension: balances[RATE_PENSION],
      lifeAnnuity: balances[LIFE_ANNUITY],
      lifeAnnuityDepotValue: balances[LIFE_ANNUITY],
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

    row.totalDepotValue = row.totalBalance +
      row.lifeAnnuityDepotValue - row.lifeAnnuity;
    const pensionBalance =
      row.ratePension + row.lifeAnnuityDepotValue + row.ageSavings;
    const freeBalance = row.freeFunds + row.ask;
    row.averageReturnRate =
      row.totalDepotValue > 0 &&
      Number.isFinite(row.pensionReturnRate) &&
      Number.isFinite(row.freeFundsReturnRate)
        ? (pensionBalance * row.pensionReturnRate +
            freeBalance * row.freeFundsReturnRate) /
          row.totalDepotValue
        : null;

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

    const selectedReturnStrategy = returnStrategy(inputs);
    if (!Object.values(RETURN_STRATEGY).includes(selectedReturnStrategy)) {
      throw new Error("Vælg en gyldig afkaststrategi.");
    }

    if (selectedReturnStrategy !== RETURN_STRATEGY.none) {
      const selectedDefensiveReturnRate = defensiveReturnRate(inputs);
      if (
        !Number.isFinite(selectedDefensiveReturnRate) ||
        selectedDefensiveReturnRate < 0 ||
        selectedDefensiveReturnRate > inputs.returnRate
      ) {
        throw new Error(
          "Det defensive afkast skal være mellem 0 % og det forventede afkast.",
        );
      }

      const selectedReturnDeclineYears = returnDeclineYears(inputs);
      if (
        !Number.isInteger(selectedReturnDeclineYears) ||
        selectedReturnDeclineYears < 0
      ) {
        throw new Error(
          "Nedtrapningsperioden skal være 0 eller flere hele år.",
        );
      }

      if (selectedReturnStrategy === RETURN_STRATEGY.riskTent) {
        const selectedReturnRecoveryYears = returnRecoveryYears(inputs);
        if (
          !Number.isInteger(selectedReturnRecoveryYears) ||
          selectedReturnRecoveryYears < 0
        ) {
          throw new Error(
            "Genoptrapningsperioden skal være 0 eller flere hele år.",
          );
        }
      }
    }

    if (!Number.isFinite(inputs.inflationRate) || inputs.inflationRate <= -1) {
      throw new Error("Inflationen skal være større end -100 %.");
    }
    const payoutRate = inputs.lifeAnnuityPayoutRate ?? 0.0322;
    if (!Number.isFinite(payoutRate) || payoutRate <= -1) {
      throw new Error("Livrentens udbetalingsrente skal være større end -100 %.");
    }
  }

  function calculateFireForAnchor(
    inputs,
    calculationDate = new Date(),
    {
      includeBridgeCapacity = true,
      assumedFireYear = null,
      freeReturnAnchorYear = null,
      candidateOnly = false,
      calculationCache = null,
    } = {},
  ) {
    const asOfDate = normalizeDate(calculationDate);
    const yearsToRetirement = inputs.retirementAge - inputs.currentAge;
    const finalYear = yearsToRetirement + inputs.payoutYears;
    const retirementDate = annualDate(asOfDate, yearsToRetirement);
    const finalDate = annualDate(asOfDate, finalYear);
    const selectedReturnStrategy = returnStrategy(inputs);
    const selectedDefensiveReturnRate = defensiveReturnRate(inputs);
    const selectedReturnDeclineYears = returnDeclineYears(inputs);
    const selectedReturnRecoveryYears = returnRecoveryYears(inputs);
    const effectiveFreeReturnAnchorYear =
      freeReturnAnchorYear ?? yearsToRetirement;
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
    let anchorCache = calculationCache?.anchorCaches.get(
      effectiveFreeReturnAnchorYear,
    );
    if (!anchorCache) {
      anchorCache = {
        realReturnSeries: new Map(),
        presentValueFactors: new Map(),
        compoundGrowth: new Map(),
      };
      calculationCache?.anchorCaches.set(
        effectiveFreeReturnAnchorYear,
        anchorCache,
      );
    }
    const realReturnSeriesCache = anchorCache.realReturnSeries;
    const presentValueFactorCache = anchorCache.presentValueFactors;
    const compoundGrowthCache = anchorCache.compoundGrowth;

    function pensionNominalReturn(year) {
      return strategyReturnRate(
        inputs.returnRate,
        selectedDefensiveReturnRate,
        selectedReturnStrategy,
        year,
        yearsToRetirement,
        selectedReturnDeclineYears,
        selectedReturnRecoveryYears,
      );
    }

    function freeNominalReturn(year) {
      return strategyReturnRate(
        inputs.returnRate,
        selectedDefensiveReturnRate,
        selectedReturnStrategy,
        year,
        effectiveFreeReturnAnchorYear,
        selectedReturnDeclineYears,
        selectedReturnRecoveryYears,
      );
    }

    function realPensionReturnFor(nominalReturn) {
      return (
        (1 + nominalReturn * (1 - inputs.pensionTax)) /
          (1 + inputs.inflationRate) -
        1
      );
    }

    function realAskReturnFor(nominalReturn) {
      return (
        (1 + nominalReturn * (1 - inputs.askTax)) /
          (1 + inputs.inflationRate) -
        1
      );
    }

    function grossRealFreeFundsReturnFor(nominalReturn) {
      return (1 + nominalReturn) / (1 + inputs.inflationRate) - 1;
    }

    const netPensionReturn = inputs.returnRate * (1 - inputs.pensionTax);
    const realPensionReturn = realPensionReturnFor(inputs.returnRate);
    const realAskReturn = realAskReturnFor(inputs.returnRate);
    const grossRealFreeFundsReturn = grossRealFreeFundsReturnFor(
      inputs.returnRate,
    );
    const defensiveRealPensionReturn = realPensionReturnFor(
      selectedDefensiveReturnRate,
    );
    const defensiveRealAskReturn = realAskReturnFor(
      selectedDefensiveReturnRate,
    );
    const defensiveGrossRealFreeFundsReturn = grossRealFreeFundsReturnFor(
      selectedDefensiveReturnRate,
    );
    const lifeAnnuityPayoutRate = inputs.lifeAnnuityPayoutRate ?? 0.0322;
    let lifeAnnuityMetrics = calculationCache?.lifeAnnuityMetrics;
    if (!lifeAnnuityMetrics) {
      lifeAnnuityMetrics = calculateLifeAnnuityMetrics({
        retirementAge: inputs.retirementAge,
        retirementYear: retirementDate.getFullYear(),
        discountRates: [lifeAnnuityPayoutRate],
      });
      if (calculationCache) {
        calculationCache.lifeAnnuityMetrics = lifeAnnuityMetrics;
      }
    }

    function annualLifeAnnuityIncome(balanceAtRetirement) {
      const income = balanceAtRetirement * lifeAnnuityMetrics.conversionRate;
      assertFinite(income);
      return income;
    }

    // For a pure life annuity on an unchanged mortality basis, annual reserve
    // recalculation (including survivor credits) reduces to this ratio.
    // The annuity factor discounts NOMINAL payments. Deflate each subsequent
    // payment separately; using a real discount rate would promise indexation.
    let lifeAnnuityIncomeFactors = calculationCache?.lifeAnnuityIncomeFactors;
    if (!lifeAnnuityIncomeFactors) {
      lifeAnnuityIncomeFactors = [1];
      for (let period = 1; period < inputs.payoutYears; period += 1) {
        lifeAnnuityIncomeFactors.push(
          lifeAnnuityIncomeFactors[period - 1] *
            (1 + realPensionReturnFor(
              pensionNominalReturn(yearsToRetirement + period - 1),
            )) / (1 + lifeAnnuityPayoutRate),
        );
      }
      if (calculationCache) {
        calculationCache.lifeAnnuityIncomeFactors = lifeAnnuityIncomeFactors;
      }
    }
    const lifeIncomeBounds = calculationCache?.lifeIncomeBounds ?? {
      minimum: Math.min(...lifeAnnuityIncomeFactors),
      maximum: Math.max(...lifeAnnuityIncomeFactors),
      // Discounting the regulated income at its investment return cancels
      // that return, leaving only the payout rate in the present value.
      presentValue: presentValueFactor(
        Array(inputs.payoutYears).fill(lifeAnnuityPayoutRate),
      ),
    };
    if (calculationCache) {
      calculationCache.lifeIncomeBounds = lifeIncomeBounds;
    }

    function lifeAnnuityDepotValue(initialIncome, year) {
      const period = year - yearsToRetirement;
      // The final row has no payment, but still has an opening reserve.
      const incomeFactor = lifeAnnuityIncomeFactors[period] ??
        lifeAnnuityIncomeFactors[period - 1] *
          (1 + realPensionReturnFor(pensionNominalReturn(year - 1))) /
          (1 + lifeAnnuityPayoutRate);
      const factors = lifeAnnuityMetrics.pureLifeAnnuityFactors;
      const reserveFactor = factors[Math.min(period, factors.length - 1)];
      return initialIncome * incomeFactor * reserveFactor;
    }

    function inventoryTaxForBalance(
      balance,
      nominalReturn,
      priorTaxableGain = 0,
    ) {
      if (balance <= 0 || nominalReturn <= 0) {
        return 0;
      }

      const inventoryGain = balance * nominalReturn;
      return (
        calculateShareIncomeTax(priorTaxableGain + inventoryGain) -
        calculateShareIncomeTax(priorTaxableGain)
      );
    }

    function inventoryAnnualCapacity(balance, startYear, periods) {
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
          const nominalReturn = freeNominalReturn(startYear + period);
          const tax = inventoryTaxForBalance(remaining, nominalReturn);
          remaining =
            (remaining * (1 + nominalReturn) - tax) /
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

    function inventoryRateForBalance(balance, nominalReturn) {
      if (balance <= 0) {
        return (
          (1 + nominalReturn * (1 - SHARE_INCOME_LOW_RATE)) /
            (1 + inputs.inflationRate) -
          1
        );
      }

      return (
        (balance * (1 + nominalReturn) -
          inventoryTaxForBalance(balance, nominalReturn)) /
          (1 + inputs.inflationRate) /
          balance -
        1
      );
    }

    function ratesForBalances(balances, year) {
      const pensionReturn = pensionNominalReturn(year);
      const freeReturn = freeNominalReturn(year);
      return [
        realPensionReturnFor(pensionReturn),
        realPensionReturnFor(pensionReturn),
        realPensionReturnFor(pensionReturn),
        grossRealFreeFundsReturnFor(freeReturn),
        inventoryRateForBalance(
          balances[FREE_FUNDS_INVENTORY],
          freeReturn,
        ),
        realAskReturnFor(freeReturn),
      ];
    }

    function realReturnSeriesFor(index, startYear, periods) {
      const key = `${index}:${startYear}:${periods}`;
      const cached = realReturnSeriesCache.get(key);
      if (cached) {
        return cached;
      }

      const series = Array.from({ length: periods }, (_value, period) => {
        const year = startYear + period;
        if (index <= AGE_SAVINGS) {
          return realPensionReturnFor(pensionNominalReturn(year));
        }
        if (index === ASK) {
          return realAskReturnFor(freeNominalReturn(year));
        }
        return grossRealFreeFundsReturnFor(freeNominalReturn(year));
      });
      realReturnSeriesCache.set(key, series);
      return series;
    }

    function presentValueFactorFor(index, startYear, periods) {
      const key = `${index}:${startYear}:${periods}`;
      if (presentValueFactorCache.has(key)) {
        return presentValueFactorCache.get(key);
      }

      const factor = presentValueFactor(
        realReturnSeriesFor(index, startYear, periods),
      );
      presentValueFactorCache.set(key, factor);
      return factor;
    }

    function pensionGrowthFactor(startYear, periods) {
      const key = `${startYear}:${periods}`;
      if (compoundGrowthCache.has(key)) {
        return compoundGrowthCache.get(key);
      }

      const factor =
        selectedReturnStrategy === RETURN_STRATEGY.none
          ? Math.pow(1 + realPensionReturn, periods)
          : compoundGrowth(
              realReturnSeriesFor(RATE_PENSION, startYear, periods),
            );
      compoundGrowthCache.set(key, factor);
      return factor;
    }

    function capacitiesForBalances(balances, startYear, periods) {
      return balances.map((balance, index) => {
        if (index === FREE_FUNDS_INVENTORY) {
          return inventoryAnnualCapacity(balance, startYear, periods);
        }
        if (balance <= 0 || periods <= 0) {
          return 0;
        }
        const factor = presentValueFactorFor(index, startYear, periods);
        const capacity = factor > 0 ? balance / factor : 0;
        assertFinite(capacity);
        return capacity;
      });
    }

    function growBalancesWithTax(balances, year, priorTaxableGain = 0) {
      const inventoryBalance = balances[FREE_FUNDS_INVENTORY];
      const nominalReturn = freeNominalReturn(year);
      const inventoryTax = inventoryTaxForBalance(
        inventoryBalance,
        nominalReturn,
        priorTaxableGain,
      );
      const currentRates = ratesForBalances(balances, year);
      const grownBalances = growBalances(balances, currentRates);

      grownBalances[FREE_FUNDS_INVENTORY] = Math.max(
        0,
        (inventoryBalance * (1 + nominalReturn) - inventoryTax) /
          (1 + inputs.inflationRate),
      );

      const realTax = inventoryTax / (1 + inputs.inflationRate);
      const realTaxableGain = usesInventoryTax
        ? Math.max(0, inventoryBalance * nominalReturn) /
          (1 + inputs.inflationRate)
        : 0;

      assertFinite(...grownBalances, realTax, realTaxableGain);
      return {
        balances: grownBalances,
        freeFundsTax: realTax,
        freeFundsTaxableGain: realTaxableGain,
      };
    }

    const boundaryRates = [
      realPensionReturn,
      realAskReturn,
      grossRealFreeFundsReturn,
      defensiveRealPensionReturn,
      defensiveRealAskReturn,
      defensiveGrossRealFreeFundsReturn,
    ];
    if (boundaryRates.some((rate) => !Number.isFinite(rate) || rate <= -1)) {
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
      year,
    ) {
      const growth = growBalancesWithTax(startingBalances, year);
      const currentRates = ratesForBalances(startingBalances, year);
      const endingBalances = growth.balances.map(
        (balance, index) =>
          balance +
          contributions[index] * midyearGrowthFactor(currentRates[index]),
      );

      if (contributions[FREE_FUNDS_INVENTORY] > 0) {
        const startingBalance = startingBalances[FREE_FUNDS_INVENTORY];
        const contribution = contributions[FREE_FUNDS_INVENTORY];
        const nominalReturn = freeNominalReturn(year);
        const nominalHalfYearGrowth = Math.sqrt(1 + nominalReturn);
        const inflationHalfYearGrowth = Math.sqrt(1 + inputs.inflationRate);
        const openingBalanceAtYearEnd =
          (startingBalance * (1 + nominalReturn)) /
          (1 + inputs.inflationRate);
        const contributionAtYearEnd =
          contribution * (nominalHalfYearGrowth / inflationHalfYearGrowth);
        const taxableGain =
          nominalReturn > 0
            ? startingBalance * nominalReturn +
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

      const lifeAnnuityIncome = annualLifeAnnuityIncome(lifeAnnuity);
      const usableLifeAnnuityIncome = inputs.withdrawalAfterTax
        ? lifeAnnuityIncome * (1 - pensionWithdrawalTax)
        : lifeAnnuityIncome;
      const flexiblePension = ratePension + ageSavings;
      const payoutFactor = presentValueFactorFor(
        RATE_PENSION,
        yearsToRetirement,
        inputs.payoutYears,
      );
      const payoutRates = realReturnSeriesFor(
        RATE_PENSION,
        yearsToRetirement,
        inputs.payoutYears,
      );
      const remainingWithdrawalFor = (period) => Math.max(
        0,
        desiredWithdrawal - usableLifeAnnuityIncome *
          lifeAnnuityIncomeFactors[period],
      );
      let remainingPresentValue = desiredWithdrawal * payoutFactor;
      if (usableLifeAnnuityIncome * lifeIncomeBounds.maximum <= desiredWithdrawal) {
        remainingPresentValue -= usableLifeAnnuityIncome * lifeIncomeBounds.presentValue;
      } else if (usableLifeAnnuityIncome * lifeIncomeBounds.minimum >= desiredWithdrawal) {
        remainingPresentValue = 0;
      } else {
        remainingPresentValue = 0;
        let discount = 1;
        for (let period = 0; period < inputs.payoutYears; period += 1) {
          remainingPresentValue += remainingWithdrawalFor(period) / discount;
          discount *= 1 + payoutRates[period];
        }
      }
      if (remainingPresentValue <= MONEY_TOLERANCE) {
        return lifeAnnuity;
      }
      if (flexiblePension <= CALCULATION_TOLERANCE) {
        if (inputs.withdrawalAfterTax) {
          return null;
        }
        return lifeAnnuity + remainingPresentValue;
      }

      if (!inputs.withdrawalAfterTax) {
        return lifeAnnuity + remainingPresentValue;
      }
      const rateShare = ratePension / flexiblePension;
      const initialTaxFreeAllowance = annualTaxFreeRatePensionAllowance(
        nonDeductibleBasis,
        inputs.payoutYears,
      );
      if (initialTaxFreeAllowance <= CALCULATION_TOLERANCE) {
        const netFraction = 1 - pensionWithdrawalTax * rateShare;
        if (netFraction <= CALCULATION_TOLERANCE) {
          return null;
        }

        const target =
          lifeAnnuity +
          remainingPresentValue / netFraction;
        assertFinite(target);
        return target;
      }

      let target = 0;
      let discountFactor = 1;

      for (let period = 0; period < inputs.payoutYears; period += 1) {
        const taxFreeAllowance =
          initialTaxFreeAllowance / Math.pow(1 + inputs.inflationRate, period);
        const grossWithdrawal = grossPensionWithdrawalForNetTarget(
          remainingWithdrawalFor(period),
          rateShare,
          0,
          pensionWithdrawalTax,
          taxFreeAllowance,
        );
        if (grossWithdrawal === null) {
          return null;
        }

        target += grossWithdrawal / discountFactor;
        discountFactor *= 1 + payoutRates[period];
        assertFinite(target, discountFactor);
      }

      target += lifeAnnuity;
      assertFinite(target);
      return target;
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
      let lifeAnnuityConverted = false;
      let lifeAnnuityBalanceAtRetirement = 0;
      let lifeAnnuityAnnualIncome = 0;

      for (let year = startYear; year < endYear; year += 1) {
        const beforeRetirement = year < yearsToRetirement;
        if (!beforeRetirement && !lifeAnnuityConverted) {
          lifeAnnuityConverted = true;
          lifeAnnuityBalanceAtRetirement = balances[LIFE_ANNUITY];
          lifeAnnuityAnnualIncome = annualLifeAnnuityIncome(
            lifeAnnuityBalanceAtRetirement,
          );
          balances[LIFE_ANNUITY] = 0;
        }

        const periods = beforeRetirement
          ? yearsToRetirement - year
          : endYear - year;
        const capacities = capacitiesForBalances(balances, year, periods);
        const remainingPayoutYears = beforeRetirement ? 0 : finalYear - year;
        const taxFreeRatePensionAllowance = beforeRetirement
          ? 0
          : annualTaxFreeRatePensionAllowance(
              ratePensionNonDeductibleBasis,
              remainingPayoutYears,
            );
        const lifeAnnuityWithdrawal = beforeRetirement
          ? 0
          : lifeAnnuityAnnualIncome *
            lifeAnnuityIncomeFactors[year - yearsToRetirement];
        const lifeAnnuityWithdrawalTax =
          lifeAnnuityWithdrawal * pensionWithdrawalTax;
        const remainingDesiredWithdrawal = Math.max(
          0,
          desiredWithdrawal -
            (inputs.withdrawalAfterTax
              ? lifeAnnuityWithdrawal - lifeAnnuityWithdrawalTax
              : lifeAnnuityWithdrawal),
        );
        const allocateCurrentWithdrawal = (withdrawalCapacities) => inputs.withdrawalAfterTax
          ? allocateForNetWithdrawal(
              balances,
              withdrawalCapacities,
              remainingDesiredWithdrawal,
              beforeRetirement,
              freeFundsCostBasis,
              pensionWithdrawalTax,
              taxFreeRatePensionAllowance,
            )
          : allocateForPhase(
              withdrawalCapacities,
              remainingDesiredWithdrawal,
              beforeRetirement,
            );
        let allocation = allocateCurrentWithdrawal(capacities);
        if (!beforeRetirement && lifeAnnuityAnnualIncome > 0) {
          const delivered = inputs.withdrawalAfterTax
            ? allocation.total -
              Math.max(0, allocation.amounts[RATE_PENSION] -
                taxFreeRatePensionAllowance) * pensionWithdrawalTax -
              calculateFreeFundsSale(
                balances[FREE_FUNDS_REALIZATION],
                freeFundsCostBasis,
                allocation.amounts[FREE_FUNDS_REALIZATION],
              ).tax
            : allocation.total;
          if (delivered + MONEY_TOLERANCE < remainingDesiredWithdrawal) {
            // A rising annuity can require larger flexible withdrawals now
            // and smaller ones later. The level-payment capacity is not a
            // withdrawal limit for age savings, ASK or free funds. Keep the
            // rate-pension limit and let the full simulation test solvency.
            const flexibleCapacities = balances.map((balance, index) =>
              index === RATE_PENSION ? capacities[index] :
                index === LIFE_ANNUITY ? 0 : balance,
            );
            allocation = allocateCurrentWithdrawal(flexibleCapacities);
          }
        }
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
        const pensionWithdrawalTaxAmount =
          taxableRatePensionWithdrawal * pensionWithdrawalTax +
          lifeAnnuityWithdrawalTax;
        const totalWithdrawalTax =
          freeFundsSale.tax + pensionWithdrawalTaxAmount;
        const totalWithdrawal = allocation.total + lifeAnnuityWithdrawal;
        const netWithdrawal = totalWithdrawal - totalWithdrawalTax;
        const effectiveFreeFundsWithdrawalTaxRate =
          freeFundsWithdrawal > 0 ? freeFundsSale.tax / freeFundsWithdrawal : 0;
        const effectiveWithdrawalTaxRate =
          totalWithdrawal > 0 ? totalWithdrawalTax / totalWithdrawal : 0;
        const deliveredWithdrawal = inputs.withdrawalAfterTax
          ? netWithdrawal
          : totalWithdrawal;
        const shortfall =
          deliveredWithdrawal + MONEY_TOLERANCE < desiredWithdrawal;

        if (shortfall && !firstShortfallDate) {
          firstShortfallDate = new Date(date);
        }
        isFullyFunded = isFullyFunded && !shortfall;

        if (shouldRecord) {
          const pensionWithdrawal =
            allocation.amounts[RATE_PENSION] +
            allocation.amounts[AGE_SAVINGS] +
            lifeAnnuityWithdrawal;
          const freeWithdrawal =
            allocation.amounts[FREE_FUNDS_REALIZATION] +
            allocation.amounts[FREE_FUNDS_INVENTORY] +
            allocation.amounts[ASK];
          const withdrawalSource =
            totalWithdrawal <= MONEY_TOLERANCE
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
                pensionReturnRate: pensionNominalReturn(year),
                freeFundsReturnRate: freeNominalReturn(year),
                contribution: year === startYear ? startingContribution : 0,
                withdrawal: totalWithdrawal,
                freeFundsWithdrawal,
                realizedFreeFundsGain: freeFundsSale.realizedGain,
                withdrawalTax: freeFundsSale.tax,
                pensionWithdrawalTax: pensionWithdrawalTaxAmount,
                lifeAnnuityWithdrawal,
                lifeAnnuityDepotValue: beforeRetirement
                  ? balances[LIFE_ANNUITY]
                  : lifeAnnuityDepotValue(lifeAnnuityAnnualIncome, year),
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
          year,
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
            {
              phase: "Slut",
              lifeAnnuityDepotValue: lifeAnnuityConverted
                ? lifeAnnuityDepotValue(lifeAnnuityAnnualIncome, endYear)
                : balances[LIFE_ANNUITY],
            },
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
        lifeAnnuityAnnualIncome,
        lifeAnnuityBalanceAtRetirement,
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
        capacitiesForBalances(startBalances, startYear, bridgeYears),
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

    function pensionMilestoneStatus(
      year,
      balances,
      ratePensionNonDeductibleBasis,
    ) {
      const bridgeYears = yearsToRetirement - year;
      const pensionGrowth = pensionGrowthFactor(year, bridgeYears);
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
      const pensionTargetAtRetirement = pensionTargetForMix(
        ratePensionAtRetirement,
        lifeAnnuityAtRetirement,
        ageSavingsAtRetirement,
        ratePensionNonDeductibleBasisAtRetirement,
      );
      const coastFinanced =
        pensionTargetAtRetirement !== null &&
        pensionTargetAtRetirement <= pensionAtRetirement + MONEY_TOLERANCE;
      const pensionTarget =
        pensionTargetAtRetirement === null
          ? null
          : pensionTargetAtRetirement / pensionGrowth;

      assertFinite(pensionAtRetirement, pensionTarget ?? 0);
      return { bridgeYears, pensionTarget, coastFinanced };
    }

    function evaluateMilestone(
      year,
      balances,
      freeFundsCostBasis,
      ratePensionNonDeductibleBasis,
      checkFireReadiness = true,
    ) {
      const { bridgeYears, pensionTarget, coastFinanced } =
        pensionMilestoneStatus(
          year,
          balances,
          ratePensionNonDeductibleBasis,
        );
      const drawdown = checkFireReadiness
        ? simulateDrawdown(
            year,
            balances,
            freeFundsCostBasis,
            ratePensionNonDeductibleBasis,
            { shouldRecord: false },
          )
        : null;

      return {
        age: inputs.currentAge + year,
        date: annualDate(asOfDate, year),
        ratePension: balances[RATE_PENSION],
        lifeAnnuity:
          year < yearsToRetirement ? balances[LIFE_ANNUITY] : 0,
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
        fireReady: drawdown?.isFullyFunded ?? false,
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
      if (candidateOnly) {
        const { coastFinanced } = pensionMilestoneStatus(
          year,
          balances,
          ratePensionNonDeductibleBasis,
        );
        if (!pensionCoastRow && coastFinanced) {
          pensionCoastRow = true;
          pensionStopRow = true;
          pensionContributionsActive = false;
        }

        if (year === assumedFireYear) {
          const fireReady = simulateDrawdown(
            year,
            balances,
            freeFundsCostBasis,
            ratePensionNonDeductibleBasis,
            { shouldRecord: false },
          ).isFullyFunded;
          return {
            fireRow: fireReady
              ? { age: inputs.currentAge + year }
              : null,
          };
        }
      }

      const checkFireReadiness =
        assumedFireYear === null || year === assumedFireYear;
      const milestone = candidateOnly
        ? null
        : evaluateMilestone(
            year,
            balances,
            freeFundsCostBasis,
            ratePensionNonDeductibleBasis,
            checkFireReadiness,
          );
      if (milestone) {
        milestoneRows.push(milestone);
      }

      if (milestone && !pensionCoastRow && milestone.coastFinanced) {
        pensionCoastRow = milestone;
        pensionStopRow = pensionStopRow || milestone;
        pensionContributionsActive = false;
      }

      if (milestone?.fireReady) {
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

      if (!candidateOnly) {
        accumulationRows.push(
          createRow(
            inputs.currentAge + year,
            annualDate(asOfDate, year),
            balances,
            freeFundsCostBasis,
            ratePensionNonDeductibleBasis,
            {
              phase: "Opsparing",
              pensionReturnRate: pensionNominalReturn(year),
              freeFundsReturnRate: freeNominalReturn(year),
              contribution: contributionAtCheckpoint,
            },
          ),
        );
      }

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
        year,
      );
      if (!candidateOnly) {
        accumulationRows[accumulationRows.length - 1].annualFreeFundsTax =
          growth.freeFundsTax;
      }
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
    const projectedLifeAnnuity = drawdown.lifeAnnuityBalanceAtRetirement;
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
          pensionGrowthFactor(0, yearsToRetirement);
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
      drawdown.lifeAnnuityAnnualIncome,
      drawdown.lifeAnnuityBalanceAtRetirement,
      lifeAnnuityMetrics.annuityFactor,
      lifeAnnuityMetrics.conversionRate,
      lifeAnnuityMetrics.expectedAgeAtDeath,
    );

    return {
      currentAge: inputs.currentAge,
      returnStrategy: selectedReturnStrategy,
      defensiveReturnRate: selectedDefensiveReturnRate,
      returnDeclineYears: selectedReturnDeclineYears,
      returnRecoveryYears: selectedReturnRecoveryYears,
      freeFundsTaxation,
      freeFundsInventoryShare: inventoryShare,
      netPensionReturn,
      realPensionReturn,
      defensiveRealPensionReturn,
      realAskReturn,
      defensiveRealAskReturn,
      realFreeFundsReturn:
        inputs.freeFundsBalance > 0
          ? (initialBalances[FREE_FUNDS_REALIZATION] *
              grossRealFreeFundsReturn +
              initialBalances[FREE_FUNDS_INVENTORY] *
                inventoryRateForBalance(
                  initialBalances[FREE_FUNDS_INVENTORY],
                  inputs.returnRate,
                )) /
            inputs.freeFundsBalance
          : grossRealFreeFundsReturn * (1 - inventoryShare) +
            inventoryRateForBalance(0, inputs.returnRate) * inventoryShare,
      defensiveRealFreeFundsReturn:
        inputs.freeFundsBalance > 0
          ? (initialBalances[FREE_FUNDS_REALIZATION] *
              defensiveGrossRealFreeFundsReturn +
              initialBalances[FREE_FUNDS_INVENTORY] *
                inventoryRateForBalance(
                  initialBalances[FREE_FUNDS_INVENTORY],
                  selectedDefensiveReturnRate,
                )) /
            inputs.freeFundsBalance
          : defensiveGrossRealFreeFundsReturn * (1 - inventoryShare) +
            inventoryRateForBalance(0, selectedDefensiveReturnRate) *
              inventoryShare,
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
      lifeAnnuityAnnualIncome: drawdown.lifeAnnuityAnnualIncome,
      lifeAnnuityBalanceAtRetirement:
        drawdown.lifeAnnuityBalanceAtRetirement,
      lifeAnnuityFactor: lifeAnnuityMetrics.annuityFactor,
      lifeAnnuityConversionRate: lifeAnnuityMetrics.conversionRate,
      lifeAnnuityExpectedAgeAtDeath:
        lifeAnnuityMetrics.expectedAgeAtDeath,
      lifeAnnuityExpectedRemainingLifetime:
        lifeAnnuityMetrics.expectedRemainingLifetime,
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
      returnAnchors: {
        freeFunds: inputs.currentAge + effectiveFreeReturnAnchorYear,
        pension: inputs.retirementAge,
      },
      rows: milestoneRows,
      planRows,
      finalRow,
      finalReserveAfterTax,
    };
  }

  function calculateFire(
    inputs,
    calculationDate = new Date(),
    { includeBridgeCapacity = true, calculationCache = null } = {},
  ) {
    assertInputs(inputs);

    if (returnStrategy(inputs) === RETURN_STRATEGY.none) {
      return calculateFireForAnchor(inputs, calculationDate, {
        includeBridgeCapacity,
        calculationCache,
      });
    }

    const yearsToRetirement = inputs.retirementAge - inputs.currentAge;
    let latestUnfundedYear = -1;
    let earliestFundedYear = yearsToRetirement + 1;

    while (earliestFundedYear - latestUnfundedYear > 1) {
      const candidateYear = Math.floor(
        (latestUnfundedYear + earliestFundedYear) / 2,
      );
      const candidate = calculateFireForAnchor(inputs, calculationDate, {
        includeBridgeCapacity: false,
        assumedFireYear: candidateYear,
        freeReturnAnchorYear: candidateYear,
        candidateOnly: true,
        calculationCache,
      });

      if (candidate.fireRow?.age === inputs.currentAge + candidateYear) {
        earliestFundedYear = candidateYear;
      } else {
        latestUnfundedYear = candidateYear;
      }
    }

    const fireYear =
      earliestFundedYear <= yearsToRetirement ? earliestFundedYear : null;
    const freeReturnAnchorYear = fireYear ?? yearsToRetirement;
    return calculateFireForAnchor(inputs, calculationDate, {
      includeBridgeCapacity,
      assumedFireYear: freeReturnAnchorYear,
      freeReturnAnchorYear,
      calculationCache,
    });
  }

  function contributionSnapshot(contributions, calculation) {
    return {
      ...contributions,
      annualNetCost: contributionNetBudget(
        contributions,
        calculation.ratePensionContributionTaxRelief,
      ),
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
      candidate.annualFreeFundsContribution,
    ]
      .map((value) => value.toFixed(4))
      .join(":");
  }

  function compareEvaluations(first, second) {
    const firstFireTime = evaluationFireTime(first);
    const secondFireTime = evaluationFireTime(second);

    return (
      firstFireTime - secondFireTime ||
      first.annualNetCost - second.annualNetCost ||
      evaluationFinalReserve(second) - evaluationFinalReserve(first) ||
      first.distance - second.distance ||
      second.candidate.annualFreeFundsContribution -
        first.candidate.annualFreeFundsContribution ||
      candidateKey(first.candidate).localeCompare(
        candidateKey(second.candidate),
      )
    );
  }

  function evaluationFireTime(evaluation) {
    if ("fireTime" in evaluation) {
      return evaluation.fireTime ?? Number.POSITIVE_INFINITY;
    }

    return evaluation.calculation.fireRow
      ? evaluation.calculation.fireRow.date.getTime()
      : Number.POSITIVE_INFINITY;
  }

  function evaluationFinalReserve(evaluation) {
    return "finalReserveAfterTax" in evaluation
      ? evaluation.finalReserveAfterTax
      : evaluation.calculation.finalReserveAfterTax;
  }

  function serializeEvaluation(evaluation) {
    if (!evaluation) {
      return null;
    }

    return {
      candidate: evaluation.candidate,
      annualNetCost: evaluation.annualNetCost,
      distance: evaluation.distance,
      fireTime: Number.isFinite(evaluationFireTime(evaluation))
        ? evaluationFireTime(evaluation)
        : null,
      finalReserveAfterTax: evaluationFinalReserve(evaluation),
      snapshot:
        evaluation.snapshot ??
        contributionSnapshot(evaluation.candidate, evaluation.calculation),
    };
  }

  function contributionCombinationKey(combination) {
    return [
      combination.ratePension,
      combination.lifeAnnuity,
      combination.ageSavings,
    ]
      .map((value) => value.toFixed(4))
      .join(":");
  }

  function contributionCombinationPartition(
    combination,
    partitionCount,
  ) {
    const key = contributionCombinationKey(combination);
    let hash = 2166136261;

    for (let index = 0; index < key.length; index += 1) {
      hash ^= key.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }

    return (hash >>> 0) % partitionCount;
  }

  function contributionCandidates(
    maximum,
    current,
    step = CONTRIBUTION_SEARCH_STEP,
  ) {
    const candidates = new Set([0, maximum]);

    for (
      let contribution = step;
      contribution < maximum;
      contribution += step
    ) {
      candidates.add(contribution);
    }
    if (current >= 0 && current <= maximum) {
      candidates.add(current);
    }

    return [...candidates].sort((first, second) => first - second);
  }

  function createAnnualContributionOptimizationSession(
    inputs,
    calculationDate = new Date(),
    searchOptions = {},
  ) {
    const pensionSearchStep =
      searchOptions.pensionStep ??
      searchOptions.step ??
      CONTRIBUTION_SEARCH_STEP;
    const ageSavingsSearchStep =
      searchOptions.ageSavingsStep ??
      searchOptions.step ??
      CONTRIBUTION_SEARCH_STEP;
    const freeFundsSearchStep =
      searchOptions.freeFundsStep ??
      searchOptions.step ??
      CONTRIBUTION_SEARCH_STEP;
    if (
      [pensionSearchStep, ageSavingsSearchStep, freeFundsSearchStep].some(
        (step) => !Number.isFinite(step) || step <= 0,
      )
    ) {
      throw new Error("Optimeringens søgetrin skal være større end 0.");
    }
    const totalPensionRange = searchOptions.totalPensionRange ?? null;
    const ageSavingsRange = searchOptions.ageSavingsRange ?? null;
    const refinementCenters = searchOptions.refinementCenters ?? null;
    const isInRange = (value, range) =>
      !range ||
      (value >= range.minimum - MONEY_TOLERANCE &&
        value <= range.maximum + MONEY_TOLERANCE);
    const isNearRefinementCenter = (totalPension, ageSavings) =>
      !refinementCenters ||
      refinementCenters.some(
        (center) =>
          Math.abs(totalPension - center.totalPension) <=
            center.radius + MONEY_TOLERANCE &&
          Math.abs(ageSavings - center.ageSavings) <=
            center.radius + MONEY_TOLERANCE,
      );
    const calculationCache = { anchorCaches: new Map() };
    const currentCalculation = calculateFire(inputs, calculationDate, {
      includeBridgeCapacity: false,
      calculationCache,
    });
    const currentContributions = {
      annualRatePensionContribution: inputs.annualRatePensionContribution,
      annualLifeAnnuityContribution:
        inputs.annualLifeAnnuityContribution ?? 0,
      annualAgeSavingsContribution: inputs.annualAgeSavingsContribution,
      annualFreeFundsContribution: inputs.annualFreeFundsContribution,
    };
    const optimizationLocks = {
      annualRatePensionContribution: Boolean(
        inputs.optimizationLocks?.annualRatePensionContribution,
      ),
      annualLifeAnnuityContribution: Boolean(
        inputs.optimizationLocks?.annualLifeAnnuityContribution,
      ),
      annualAgeSavingsContribution: Boolean(
        inputs.optimizationLocks?.annualAgeSavingsContribution,
      ),
      annualFreeFundsContribution: Boolean(
        inputs.optimizationLocks?.annualFreeFundsContribution,
      ),
    };
    const ratePensionContributionTaxRelief =
      inputs.ratePensionContributionTaxRelief ?? 0;
    const selectedAgeSavingsContributionLimit =
      ageSavingsContributionLimit(inputs);
    const annualNetBudget = contributionNetBudget(
      currentContributions,
      ratePensionContributionTaxRelief,
    );
    const currentUnlockedContributionsAreWithinLimits =
      (optimizationLocks.annualRatePensionContribution ||
        currentContributions.annualRatePensionContribution <=
          CONTRIBUTION_LIMITS.ratePension + MONEY_TOLERANCE) &&
      (optimizationLocks.annualLifeAnnuityContribution ||
        currentContributions.annualLifeAnnuityContribution <=
          CONTRIBUTION_LIMITS.lifeAnnuity + MONEY_TOLERANCE) &&
      (optimizationLocks.annualAgeSavingsContribution ||
        currentContributions.annualAgeSavingsContribution <=
          selectedAgeSavingsContributionLimit + MONEY_TOLERANCE);

    function buildCandidate(
      ratePension,
      lifeAnnuity,
      ageSavings,
      freeFunds,
    ) {
      if (
        ratePension < -MONEY_TOLERANCE ||
        (!optimizationLocks.annualRatePensionContribution &&
          ratePension >
            CONTRIBUTION_LIMITS.ratePension + MONEY_TOLERANCE) ||
        lifeAnnuity < -MONEY_TOLERANCE ||
        (!optimizationLocks.annualLifeAnnuityContribution &&
          lifeAnnuity > CONTRIBUTION_LIMITS.lifeAnnuity + MONEY_TOLERANCE) ||
        ageSavings < -MONEY_TOLERANCE ||
        (!optimizationLocks.annualAgeSavingsContribution &&
          ageSavings >
            selectedAgeSavingsContributionLimit + MONEY_TOLERANCE) ||
        (optimizationLocks.annualRatePensionContribution &&
          Math.abs(
            ratePension -
              currentContributions.annualRatePensionContribution,
          ) > MONEY_TOLERANCE) ||
        (optimizationLocks.annualLifeAnnuityContribution &&
          Math.abs(
            lifeAnnuity -
              currentContributions.annualLifeAnnuityContribution,
          ) > MONEY_TOLERANCE) ||
        (optimizationLocks.annualAgeSavingsContribution &&
          Math.abs(
            ageSavings - currentContributions.annualAgeSavingsContribution,
          ) > MONEY_TOLERANCE) ||
        freeFunds < -MONEY_TOLERANCE ||
        (optimizationLocks.annualFreeFundsContribution &&
          Math.abs(
            freeFunds - currentContributions.annualFreeFundsContribution,
          ) > MONEY_TOLERANCE)
      ) {
        return null;
      }

      const candidate = {
        annualRatePensionContribution: Math.max(0, ratePension),
        annualLifeAnnuityContribution: Math.max(0, lifeAnnuity),
        annualAgeSavingsContribution: Math.max(0, ageSavings),
        annualFreeFundsContribution: Math.max(0, freeFunds),
      };
      if (
        contributionNetBudget(candidate, ratePensionContributionTaxRelief) >
        annualNetBudget + MONEY_TOLERANCE
      ) {
        return null;
      }
      return candidate;
    }

    function completeFullBudgetCandidate(ratePension, lifeAnnuity, ageSavings) {
      const baselineFreeFunds = optimizationLocks.annualFreeFundsContribution
        ? currentContributions.annualFreeFundsContribution
        : 0;
      const candidateWithoutFreeFunds = buildCandidate(
        ratePension,
        lifeAnnuity,
        ageSavings,
        baselineFreeFunds,
      );
      if (!candidateWithoutFreeFunds) {
        return null;
      }
      if (optimizationLocks.annualFreeFundsContribution) {
        return buildCandidate(
          ratePension,
          lifeAnnuity,
          ageSavings,
          currentContributions.annualFreeFundsContribution,
        );
      }

      const pensionAndAgeNetCost = contributionNetBudget(
        candidateWithoutFreeFunds,
        ratePensionContributionTaxRelief,
      );
      return buildCandidate(
        ratePension,
        lifeAnnuity,
        ageSavings,
        annualNetBudget - pensionAndAgeNetCost,
      );
    }

    function evaluate(candidate) {
      const calculation = calculateFire(
        { ...inputs, ...candidate },
        calculationDate,
        { includeBridgeCapacity: false, calculationCache },
      );
      const evaluation = {
        candidate,
        annualNetCost: contributionNetBudget(
          candidate,
          ratePensionContributionTaxRelief,
        ),
        distance: contributionDistance(candidate, currentContributions),
        fireTime: calculation.fireRow
          ? calculation.fireRow.date.getTime()
          : null,
        finalReserveAfterTax: calculation.finalReserveAfterTax,
        snapshot: contributionSnapshot(candidate, calculation),
      };
      return evaluation;
    }

    const ratePensionCandidates = optimizationLocks
      .annualRatePensionContribution
      ? [currentContributions.annualRatePensionContribution]
      : contributionCandidates(
          CONTRIBUTION_LIMITS.ratePension,
          currentContributions.annualRatePensionContribution,
          pensionSearchStep,
        );
    const lifeAnnuityCandidates = optimizationLocks
      .annualLifeAnnuityContribution
      ? [currentContributions.annualLifeAnnuityContribution]
      : contributionCandidates(
          CONTRIBUTION_LIMITS.lifeAnnuity,
          currentContributions.annualLifeAnnuityContribution,
          pensionSearchStep,
        );
    const ageSavingsCandidates = optimizationLocks
      .annualAgeSavingsContribution
      ? [currentContributions.annualAgeSavingsContribution]
      : contributionCandidates(
          selectedAgeSavingsContributionLimit,
          currentContributions.annualAgeSavingsContribution,
          ageSavingsSearchStep,
        ).filter((contribution) =>
          isInRange(contribution, ageSavingsRange),
        );
    const totalPensionCandidates = new Set();
    if (optimizationLocks.annualRatePensionContribution) {
      lifeAnnuityCandidates.forEach((lifeAnnuity) => {
        totalPensionCandidates.add(
          currentContributions.annualRatePensionContribution + lifeAnnuity,
        );
      });
    } else if (optimizationLocks.annualLifeAnnuityContribution) {
      ratePensionCandidates.forEach((ratePension) => {
        totalPensionCandidates.add(
          ratePension + currentContributions.annualLifeAnnuityContribution,
        );
      });
    } else {
      ratePensionCandidates.forEach((ratePension) => {
        totalPensionCandidates.add(ratePension);
      });
      lifeAnnuityCandidates.forEach((lifeAnnuity) => {
        if (lifeAnnuity > 0) {
          totalPensionCandidates.add(
            CONTRIBUTION_LIMITS.ratePension + lifeAnnuity,
          );
        }
      });
      totalPensionCandidates.add(
        currentContributions.annualRatePensionContribution +
          currentContributions.annualLifeAnnuityContribution,
      );
    }

    function pensionSplits(totalPensionContribution) {
      if (optimizationLocks.annualRatePensionContribution) {
        return [
          {
            ratePension: currentContributions.annualRatePensionContribution,
            lifeAnnuity:
              totalPensionContribution -
              currentContributions.annualRatePensionContribution,
          },
        ];
      }
      if (optimizationLocks.annualLifeAnnuityContribution) {
        return [
          {
            ratePension:
              totalPensionContribution -
              currentContributions.annualLifeAnnuityContribution,
            lifeAnnuity: currentContributions.annualLifeAnnuityContribution,
          },
        ];
      }

      const rateFirst = Math.min(
        CONTRIBUTION_LIMITS.ratePension,
        totalPensionContribution,
      );
      const lifeFirst = Math.min(
        CONTRIBUTION_LIMITS.lifeAnnuity,
        totalPensionContribution,
      );
      return [
        {
          ratePension: rateFirst,
          lifeAnnuity: totalPensionContribution - rateFirst,
        },
        {
          ratePension: totalPensionContribution - lifeFirst,
          lifeAnnuity: lifeFirst,
        },
      ];
    }

    const evaluationsByCandidateKey = new Map();
    const contributionCombinations = [
      {
        ratePension: currentContributions.annualRatePensionContribution,
        lifeAnnuity: currentContributions.annualLifeAnnuityContribution,
        ageSavings: currentContributions.annualAgeSavingsContribution,
      },
    ];

    function evaluateCandidate(candidate) {
      if (!candidate) {
        return null;
      }
      const key = candidateKey(candidate);
      if (evaluationsByCandidateKey.has(key)) {
        return evaluationsByCandidateKey.get(key);
      }

      const evaluation = evaluate(candidate);
      evaluationsByCandidateKey.set(key, evaluation);
      return evaluation;
    }

    [...totalPensionCandidates]
      .sort((first, second) => first - second)
      .filter((totalPensionContribution) =>
        isInRange(totalPensionContribution, totalPensionRange),
      )
      .forEach((totalPensionContribution) => {
        pensionSplits(totalPensionContribution).forEach((pensionSplit) => {
          ageSavingsCandidates.forEach((ageSavingsContribution) => {
            if (
              !isNearRefinementCenter(
                totalPensionContribution,
                ageSavingsContribution,
              )
            ) {
              return;
            }
            const combination = {
              ratePension: pensionSplit.ratePension,
              lifeAnnuity: pensionSplit.lifeAnnuity,
              ageSavings: ageSavingsContribution,
            };
            contributionCombinations.push(combination);
          });
        });
      });

    function cheapestEvaluationForFireTime(
      combination,
      targetFireTime,
      maximumNetCost,
    ) {
      const { ratePension, lifeAnnuity, ageSavings } = combination;
      if (optimizationLocks.annualFreeFundsContribution) {
        const evaluation = evaluateCandidate(
          buildCandidate(
            ratePension,
            lifeAnnuity,
            ageSavings,
            currentContributions.annualFreeFundsContribution,
          ),
        );
        return evaluation && evaluationFireTime(evaluation) <= targetFireTime
          ? evaluation
          : null;
      }

      const candidateWithoutFreeFunds = buildCandidate(
        ratePension,
        lifeAnnuity,
        ageSavings,
        0,
      );
      if (!candidateWithoutFreeFunds) {
        return null;
      }
      const fixedNetCost = contributionNetBudget(
        candidateWithoutFreeFunds,
        ratePensionContributionTaxRelief,
      );
      if (fixedNetCost > maximumNetCost + MONEY_TOLERANCE) {
        return null;
      }
      const maximumFreeFunds = Math.max(0, annualNetBudget - fixedNetCost);
      let lowerStep = -1;
      let upperStep = Math.ceil(
        maximumFreeFunds / freeFundsSearchStep,
      );
      let bestEvaluation = null;

      while (upperStep - lowerStep > 1) {
        const candidateStep = Math.floor((lowerStep + upperStep) / 2);
        const freeFunds = Math.min(
          maximumFreeFunds,
          candidateStep * freeFundsSearchStep,
        );
        const evaluation = evaluateCandidate(
          buildCandidate(
            ratePension,
            lifeAnnuity,
            ageSavings,
            freeFunds,
          ),
        );
        const reachesTarget =
          evaluation && evaluationFireTime(evaluation) <= targetFireTime;

        if (reachesTarget) {
          upperStep = candidateStep;
          bestEvaluation = evaluation;
        } else {
          lowerStep = candidateStep;
        }
      }

      if (!bestEvaluation) {
        const freeFunds = Math.min(
          maximumFreeFunds,
          upperStep * freeFundsSearchStep,
        );
        const evaluation = evaluateCandidate(
          buildCandidate(
            ratePension,
            lifeAnnuity,
            ageSavings,
            freeFunds,
          ),
        );
        if (
          evaluation && evaluationFireTime(evaluation) <= targetFireTime
        ) {
          bestEvaluation = evaluation;
        }
      }

      return bestEvaluation;
    }

    function partitionCombinations(partitionIndex, partitionCount) {
      if (
        !Number.isInteger(partitionIndex) ||
        !Number.isInteger(partitionCount) ||
        partitionCount < 1 ||
        partitionIndex < 0 ||
        partitionIndex >= partitionCount
      ) {
        throw new Error("Optimeringens partition er ugyldig.");
      }

      return contributionCombinations.filter(
        (combination) =>
          contributionCombinationPartition(combination, partitionCount) ===
          partitionIndex,
      );
    }

    function retainBestEvaluation(bestEvaluations, evaluation, limit) {
      if (!evaluation) {
        return;
      }
      bestEvaluations.push(evaluation);
      bestEvaluations.sort(compareEvaluations);
      if (bestEvaluations.length > limit) {
        bestEvaluations.length = limit;
      }
    }

    function evaluateFullBudgetPartition(
      partitionIndex,
      partitionCount,
      resultLimit = 1,
    ) {
      const bestEvaluations = [];

      partitionCombinations(partitionIndex, partitionCount).forEach(
        ({ ratePension, lifeAnnuity, ageSavings }) => {
          retainBestEvaluation(
            bestEvaluations,
            evaluateCandidate(
              completeFullBudgetCandidate(
                ratePension,
                lifeAnnuity,
                ageSavings,
              ),
            ),
            resultLimit,
          );
        },
      );

      return {
        best: serializeEvaluation(bestEvaluations[0]),
        bestEvaluations: bestEvaluations.map(serializeEvaluation),
        evaluatedCandidates: evaluationsByCandidateKey.size,
      };
    }

    function evaluateCheapestPartition(
      targetFireTime,
      partitionIndex,
      partitionCount,
      resultLimit = 1,
    ) {
      const bestEvaluations = [];

      partitionCombinations(partitionIndex, partitionCount).forEach(
        (combination) => {
          const evaluation = cheapestEvaluationForFireTime(
            combination,
            targetFireTime,
            bestEvaluations[0]?.annualNetCost ?? Number.POSITIVE_INFINITY,
          );
          retainBestEvaluation(bestEvaluations, evaluation, resultLimit);
        },
      );

      return {
        best: serializeEvaluation(bestEvaluations[0]),
        bestEvaluations: bestEvaluations.map(serializeEvaluation),
        evaluatedCandidates: evaluationsByCandidateKey.size,
      };
    }

    function finalize(evaluations, evaluatedCandidates) {
      const bestEvaluation = evaluations
        .filter(Boolean)
        .reduce(
          (best, evaluation) =>
            !best || compareEvaluations(evaluation, best) < 0
              ? evaluation
              : best,
          null,
        );
      let bestSnapshot = bestEvaluation?.snapshot ?? null;
      const bestFireTime = evaluationFireTime(bestEvaluation ?? {
        fireTime: null,
      });

      const currentFireTime = currentCalculation.fireRow
        ? currentCalculation.fireRow.date.getTime()
        : Number.POSITIVE_INFINITY;
      const currentEvaluation = {
        candidate: currentContributions,
        calculation: currentCalculation,
        annualNetCost: contributionNetBudget(
          currentContributions,
          ratePensionContributionTaxRelief,
        ),
        distance: 0,
      };
      let status = "improved";

      if (!Number.isFinite(bestFireTime)) {
        status = "unachievable";
      } else if (!currentUnlockedContributionsAreWithinLimits) {
        status = "limits-applied";
      } else if (compareEvaluations(currentEvaluation, bestEvaluation) <= 0) {
        status = "current-optimal";
        bestSnapshot = contributionSnapshot(
          currentContributions,
          currentCalculation,
        );
      } else if (currentFireTime === bestFireTime) {
        status =
          bestEvaluation.annualNetCost <
          currentEvaluation.annualNetCost - MONEY_TOLERANCE
            ? "lower-cost"
            : "larger-reserve";
      }

      return {
        status,
        current: contributionSnapshot(
          currentContributions,
          currentCalculation,
        ),
        recommended: status === "unachievable" ? null : bestSnapshot,
        annualNetBudget,
        ratePensionContributionTaxRelief,
        limits: {
          ratePension: CONTRIBUTION_LIMITS.ratePension,
          lifeAnnuity: CONTRIBUTION_LIMITS.lifeAnnuity,
          ageSavings: selectedAgeSavingsContributionLimit,
        },
        precision: Math.min(
          pensionSearchStep,
          ageSavingsSearchStep,
          freeFundsSearchStep,
        ),
        evaluatedCandidates,
        searchMethod: "exhaustive-grid",
        lockedContributions: optimizationLocks,
      };
    }

    return {
      evaluateFullBudgetPartition,
      evaluateCheapestPartition,
      finalize,
    };
  }

  function completeAnnualContributionOptimization(session) {
    const fullBudget = session.evaluateFullBudgetPartition(0, 1);
    const earliestFireTime = fullBudget.best?.fireTime;

    if (earliestFireTime === null || earliestFireTime === undefined) {
      return session.finalize(
        [fullBudget.best],
        fullBudget.evaluatedCandidates,
      );
    }

    const cheapest = session.evaluateCheapestPartition(
      earliestFireTime,
      0,
      1,
    );
    return session.finalize(
      [cheapest.best],
      cheapest.evaluatedCandidates,
    );
  }

  function optimizeAnnualContributions(inputs, calculationDate = new Date()) {
    return completeAnnualContributionOptimization(
      createAnnualContributionOptimizationSession(inputs, calculationDate),
    );
  }

  function optimizeAnnualContributionsAdaptive(
    inputs,
    calculationDate = new Date(),
  ) {
    const coarsePensionStep = 10000;
    const coarseAgeSavingsStep = 2000;
    const coarseFreeFundsStep = 10000;
    const refinementRadius = 5000;
    const refinementBeamWidth = 8;
    const coarseSession = createAnnualContributionOptimizationSession(
      inputs,
      calculationDate,
      {
        pensionStep: coarsePensionStep,
        ageSavingsStep: coarseAgeSavingsStep,
        freeFundsStep: coarseFreeFundsStep,
      },
    );
    const coarseFullBudget = coarseSession.evaluateFullBudgetPartition(
      0,
      1,
      refinementBeamWidth,
    );
    const targetFireTime = coarseFullBudget.best?.fireTime;
    if (targetFireTime === null || targetFireTime === undefined) {
      const coarse = coarseSession.finalize(
        [coarseFullBudget.best],
        coarseFullBudget.evaluatedCandidates,
      );
      coarse.searchMethod = "adaptive-coarse-to-fine";
      return coarse;
    }
    const coarseCheapest = coarseSession.evaluateCheapestPartition(
      targetFireTime,
      0,
      1,
      refinementBeamWidth,
    );
    const refinementCenters = [
      ...coarseFullBudget.bestEvaluations,
      ...coarseCheapest.bestEvaluations,
    ].map(
      ({ candidate }) => ({
        totalPension:
          candidate.annualRatePensionContribution +
          candidate.annualLifeAnnuityContribution,
        ageSavings: candidate.annualAgeSavingsContribution,
        radius: refinementRadius,
      }),
    );
    const fine = completeAnnualContributionOptimization(
      createAnnualContributionOptimizationSession(inputs, calculationDate, {
        step: CONTRIBUTION_SEARCH_STEP,
        refinementCenters,
      }),
    );

    fine.evaluatedCandidates += coarseCheapest.evaluatedCandidates;
    fine.searchMethod = "adaptive-coarse-to-fine";
    return fine;
  }

  return {
    calculateFire,
    createAnnualContributionOptimizationSession,
    optimizeAnnualContributions,
    optimizeAnnualContributionsAdaptive,
    CONTRIBUTION_LIMITS,
    FREE_FUNDS_TAXATION,
    RETURN_STRATEGY,
    strategyReturnRate,
  };
});
