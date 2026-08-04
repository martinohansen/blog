(function (root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  root.FireCalculations = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const DAYS_PER_YEAR = 365.2425;
  const MONEY_TOLERANCE = 0.01;
  const CALCULATION_TOLERANCE = 1e-7;
  const RATE_EPSILON = 1e-12;

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
    return new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      12,
    );
  }

  function dayNumber(date) {
    return (
      Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS
    );
  }

  function dateFromDayNumber(value) {
    const utcDate = new Date(value * DAY_MS);
    return new Date(
      utcDate.getUTCFullYear(),
      utcDate.getUTCMonth(),
      utcDate.getUTCDate(),
      12,
    );
  }

  function daysInMonth(year, month) {
    return new Date(year, month + 1, 0).getDate();
  }

  function addYears(date, years) {
    const normalized = normalizeDate(date);
    const targetYear = normalized.getFullYear() + years;
    const month = normalized.getMonth();
    const day = Math.min(
      normalized.getDate(),
      daysInMonth(targetYear, month),
    );

    return new Date(targetYear, month, day, 12);
  }

  function dateAtAge(birthDate, age) {
    return addYears(birthDate, age);
  }

  function getAge(birthDate, asOfDate) {
    const normalizedBirthDate = normalizeDate(birthDate);
    const normalizedAsOfDate = normalizeDate(asOfDate);
    let age =
      normalizedAsOfDate.getFullYear() - normalizedBirthDate.getFullYear();

    if (dateAtAge(normalizedBirthDate, age) > normalizedAsOfDate) {
      age -= 1;
    }

    return age;
  }

  function yearsBetween(startDate, endDate) {
    if (dayNumber(endDate) <= dayNumber(startDate)) {
      return 0;
    }

    return (dayNumber(endDate) - dayNumber(startDate)) / DAYS_PER_YEAR;
  }

  function ageAtDate(birthDate, date) {
    const age = getAge(birthDate, date);
    const previousBirthday = dateAtAge(birthDate, age);
    const nextBirthday = dateAtAge(birthDate, age + 1);
    const intervalDays = dayNumber(nextBirthday) - dayNumber(previousBirthday);

    if (intervalDays <= 0) {
      return age;
    }

    return (
      age +
      (dayNumber(date) - dayNumber(previousBirthday)) / intervalDays
    );
  }

  function presentValueOfWithdrawals(rate, years, annualWithdrawal) {
    if (years <= 0) {
      return 0;
    }

    if (rate === 0) {
      return annualWithdrawal * years;
    }

    return annualWithdrawal * ((1 - Math.pow(1 + rate, -years)) / rate);
  }

  function annualWithdrawalFromBalance(balance, rate, years) {
    if (years <= 0 || balance <= 0) {
      return 0;
    }

    if (rate === 0) {
      return balance / years;
    }

    const annuityDueFactor =
      ((1 - Math.pow(1 + rate, -years)) / rate) * (1 + rate);

    return balance / annuityDueFactor;
  }

  function annualEndWithdrawalFromBalance(balance, rate, years) {
    if (years <= 0 || balance <= 0) {
      return 0;
    }

    if (rate === 0) {
      return balance / years;
    }

    const annuityFactor = (1 - Math.pow(1 + rate, -years)) / rate;
    return balance / annuityFactor;
  }

  function buildAnnualDates(startDate, endDate) {
    const start = normalizeDate(startDate);
    const end = normalizeDate(endDate);
    const dates = [start];

    for (let years = 1; ; years += 1) {
      const anniversary = addYears(start, years);
      if (anniversary >= end) {
        break;
      }
      dates.push(anniversary);
    }

    if (dates[dates.length - 1].getTime() !== end.getTime()) {
      dates.push(end);
    }

    return dates;
  }

  function buildDrawdownSchedule(startDate, endDate, prorateFinalPeriod) {
    const dates = buildAnnualDates(startDate, endDate);
    const factors = [];

    for (let index = 0; index < dates.length - 1; index += 1) {
      const isFinalPeriod = index === dates.length - 2;
      const nextFullAnniversary = addYears(startDate, index + 1);
      const isPartialFinalPeriod =
        prorateFinalPeriod &&
        isFinalPeriod &&
        nextFullAnniversary > normalizeDate(endDate);
      factors.push(
        isPartialFinalPeriod
          ? yearsBetween(dates[index], dates[index + 1])
          : 1,
      );
    }

    return { dates, factors };
  }

  function presentValueFactor(rate, dates, factors, startIndex = 0) {
    let factor = 0;
    const startDate = dates[startIndex];

    for (let index = startIndex; index < factors.length; index += 1) {
      const elapsedYears = yearsBetween(startDate, dates[index]);
      factor += factors[index] / Math.pow(1 + rate, elapsedYears);
    }

    assertFinite(factor);
    return factor;
  }

  function annualCapacity(balance, rate, dates, factors, startIndex) {
    if (balance <= 0 || startIndex >= factors.length) {
      return 0;
    }

    const factor = presentValueFactor(rate, dates, factors, startIndex);
    const capacity = factor > 0 ? balance / factor : 0;
    assertFinite(capacity);
    return capacity;
  }

  function presentValueFactorsByPeriod(rate, schedule) {
    const factors = Array(schedule.factors.length).fill(0);

    for (let index = schedule.factors.length - 1; index >= 0; index -= 1) {
      const discountedFuture =
        index < schedule.factors.length - 1
          ? factors[index + 1] /
            Math.pow(
              1 + rate,
              yearsBetween(schedule.dates[index], schedule.dates[index + 1]),
            )
          : 0;
      factors[index] = schedule.factors[index] + discountedFuture;
      assertFinite(factors[index]);
    }

    return factors;
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
      return allocateWithdrawals(capacities, desiredWithdrawal);
    }

    const pensionAllocation = allocateWithdrawals(
      capacities.slice(0, 2),
      desiredWithdrawal,
    );
    const freeFundsAllocation = allocateWithdrawals(
      capacities.slice(2),
      desiredWithdrawal - pensionAllocation.total,
    );

    return {
      amounts: [
        ...pensionAllocation.amounts,
        ...freeFundsAllocation.amounts,
      ],
      total: pensionAllocation.total + freeFundsAllocation.total,
    };
  }

  function contributionValue(
    contribution,
    rate,
    inflationRate,
    followsInflation,
    elapsedAtStart,
    periodYears,
  ) {
    if (contribution <= 0 || periodYears <= 0) {
      return 0;
    }

    const growthForce = Math.log1p(rate);
    const inflationForce = followsInflation ? 0 : Math.log1p(inflationRate);
    const contributionAtStart =
      contribution * Math.exp(-inflationForce * elapsedAtStart);
    const combinedForce = growthForce + inflationForce;
    const growth = Math.exp(growthForce * periodYears);
    const factor =
      Math.abs(combinedForce) < RATE_EPSILON
        ? growth * periodYears
        : growth *
          (-Math.expm1(-combinedForce * periodYears)) /
          combinedForce;
    const value = contributionAtStart * factor;
    assertFinite(value);
    return value;
  }

  function contributionAmount(
    contribution,
    inflationRate,
    followsInflation,
    elapsedAtStart,
    periodYears,
  ) {
    if (contribution <= 0 || periodYears <= 0) {
      return 0;
    }

    const inflationForce = followsInflation ? 0 : Math.log1p(inflationRate);
    const contributionAtStart =
      contribution * Math.exp(-inflationForce * elapsedAtStart);
    const factor =
      Math.abs(inflationForce) < RATE_EPSILON
        ? periodYears
        : -Math.expm1(-inflationForce * periodYears) / inflationForce;
    const amount = contributionAtStart * factor;
    assertFinite(amount);
    return amount;
  }

  function growBalance(balance, rate, periodYears) {
    const value = balance * Math.pow(1 + rate, periodYears);
    assertFinite(value);
    return value;
  }

  function assertInputs(inputs, age) {
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

    if (!Number.isFinite(age) || age < 0) {
      throw new Error("Fødselsdatoen er ugyldig.");
    }

    if (
      !Number.isInteger(inputs.retirementAge) ||
      inputs.retirementAge <= age
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
    const asOfDate = normalizeDate(calculationDate);
    const birthDate = normalizeDate(inputs.birthDate);
    const currentAge = getAge(birthDate, asOfDate);
    assertInputs(inputs, currentAge);

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

    const retirementDate = dateAtAge(birthDate, inputs.retirementAge);
    const finalDate = addYears(retirementDate, inputs.payoutYears);
    if (
      !Number.isFinite(retirementDate.getTime()) ||
      !Number.isFinite(finalDate.getTime())
    ) {
      throw calculationError();
    }
    const retirementSchedule = buildDrawdownSchedule(
      retirementDate,
      finalDate,
      false,
    );
    const requiredAtRetirement =
      inputs.desiredAnnualWithdrawal *
      presentValueFactor(
        realPensionReturn,
        retirementSchedule.dates,
        retirementSchedule.factors,
      );
    const yearsToRetirement = yearsBetween(asOfDate, retirementDate);
    const pensionTargetToday =
      requiredAtRetirement /
      Math.pow(1 + realPensionReturn, yearsToRetirement);
    assertFinite(requiredAtRetirement, pensionTargetToday);

    const initialBalances = [
      inputs.ratePensionBalance,
      inputs.ageSavingsBalance,
      inputs.freeFundsBalance,
      inputs.askBalance,
    ];
    const followsInflation = inputs.contributionsFollowInflation !== false;
    const ledger = new Map();
    const milestoneRows = [];
    let pensionCoastRow = null;
    let pensionStopRow = null;
    let fireRow = null;

    function baseRow(date, balances) {
      assertFinite(...balances);
      return {
        age: getAge(birthDate, date),
        exactAge: ageAtDate(birthDate, date),
        date: new Date(date),
        phase: "Opsparing",
        ratePension: balances[0],
        ageSavings: balances[1],
        freeFunds: balances[2],
        ask: balances[3],
        totalBalance: balances.reduce((total, balance) => total + balance, 0),
        contribution: 0,
        withdrawal: 0,
        withdrawalSource: "—",
        withdrawalShortfall: false,
      };
    }

    function writeLedgerRow(date, balances, values = {}) {
      const key = dayNumber(date);
      const existing = ledger.get(key) || baseRow(date, balances);
      Object.assign(existing, values);
      existing.date = new Date(date);
      existing.age = getAge(birthDate, date);
      existing.exactAge = ageAtDate(birthDate, date);
      existing.ratePension = balances[0];
      existing.ageSavings = balances[1];
      existing.freeFunds = balances[2];
      existing.ask = balances[3];
      existing.totalBalance = balances.reduce(
        (total, balance) => total + balance,
        0,
      );
      assertFinite(
        existing.exactAge,
        existing.ratePension,
        existing.ageSavings,
        existing.freeFunds,
        existing.ask,
        existing.totalBalance,
        existing.contribution,
        existing.withdrawal,
      );
      ledger.set(key, existing);
      return existing;
    }

    function addMilestoneRow(row) {
      const key = dayNumber(row.date);
      const index = milestoneRows.findIndex(
        (candidate) => dayNumber(candidate.date) === key,
      );
      if (index >= 0) {
        milestoneRows[index] = row;
      } else {
        milestoneRows.push(row);
        milestoneRows.sort((first, second) => first.date - second.date);
      }
    }

    function projectBalances(
      balances,
      startDate,
      endDate,
      includePensionContributions,
    ) {
      const periodYears = yearsBetween(startDate, endDate);
      const elapsedAtStart = yearsBetween(asOfDate, startDate);
      const projected = balances.map((balance, index) =>
        growBalance(balance, rates[index], periodYears),
      );

      if (includePensionContributions) {
        projected[0] += contributionValue(
          inputs.annualRatePensionContribution,
          realPensionReturn,
          inputs.inflationRate,
          followsInflation,
          elapsedAtStart,
          periodYears,
        );
        projected[1] += contributionValue(
          inputs.annualAgeSavingsContribution,
          realPensionReturn,
          inputs.inflationRate,
          followsInflation,
          elapsedAtStart,
          periodYears,
        );
      }
      projected[2] += contributionValue(
        inputs.annualFreeFundsContribution,
        realFreeFundsReturn,
        inputs.inflationRate,
        followsInflation,
        elapsedAtStart,
        periodYears,
      );
      assertFinite(...projected);
      return projected;
    }

    function contributionDuring(
      startDate,
      endDate,
      includePensionContributions,
    ) {
      const periodYears = yearsBetween(startDate, endDate);
      const elapsedAtStart = yearsBetween(asOfDate, startDate);
      let total = contributionAmount(
        inputs.annualFreeFundsContribution,
        inputs.inflationRate,
        followsInflation,
        elapsedAtStart,
        periodYears,
      );

      if (includePensionContributions) {
        total += contributionAmount(
          inputs.annualRatePensionContribution,
          inputs.inflationRate,
          followsInflation,
          elapsedAtStart,
          periodYears,
        );
        total += contributionAmount(
          inputs.annualAgeSavingsContribution,
          inputs.inflationRate,
          followsInflation,
          elapsedAtStart,
          periodYears,
        );
      }
      assertFinite(total);
      return total;
    }

    function recordAccumulationSegment(
      startDate,
      startBalances,
      endDate,
      endBalances,
      includePensionContributions,
    ) {
      const row = writeLedgerRow(startDate, startBalances, {
        phase: "Opsparing",
      });
      row.contribution = contributionDuring(
        startDate,
        endDate,
        includePensionContributions,
      );
      writeLedgerRow(endDate, endBalances, { phase: "Opsparing" });
    }

    function runPhase(
      balances,
      schedule,
      beforeRetirement,
      shouldRecord,
      status,
    ) {
      const projected = [...balances];
      const eligibleIndexes = beforeRetirement ? [2, 3] : [0, 1, 2, 3];
      const capacityFactors = eligibleIndexes.map((assetIndex) =>
        presentValueFactorsByPeriod(rates[assetIndex], schedule),
      );

      for (let index = 0; index < schedule.factors.length; index += 1) {
        const capacities = eligibleIndexes.map(
          (assetIndex, allocationIndex) => {
            const factor = capacityFactors[allocationIndex][index];
            const capacity = factor > 0 ? projected[assetIndex] / factor : 0;
            assertFinite(capacity);
            return capacity;
          },
        );
        const allocation = allocateForPhase(
          capacities,
          inputs.desiredAnnualWithdrawal,
          beforeRetirement,
        );
        const factor = schedule.factors[index];
        const withdrawal = allocation.total * factor;
        const shortfall =
          withdrawal + MONEY_TOLERANCE <
          inputs.desiredAnnualWithdrawal * factor;
        const actualAmounts = allocation.amounts.map(
          (amount) => amount * factor,
        );

        if (shortfall && !status.firstShortfallDate) {
          status.firstShortfallDate = new Date(schedule.dates[index]);
        }
        status.isFullyFunded = status.isFullyFunded && !shortfall;

        if (shouldRecord) {
          const pensionWithdrawal = beforeRetirement
            ? 0
            : actualAmounts[0] + actualAmounts[1];
          const freeWithdrawal = beforeRetirement
            ? actualAmounts[0] + actualAmounts[1]
            : actualAmounts[2] + actualAmounts[3];
          const withdrawalSource = beforeRetirement
            ? "Frie midler"
            : pensionWithdrawal > MONEY_TOLERANCE &&
                freeWithdrawal > MONEY_TOLERANCE
              ? "Pension og frie midler"
              : freeWithdrawal > MONEY_TOLERANCE
                ? "Frie midler"
                : "Pension";
          writeLedgerRow(schedule.dates[index], projected, {
            phase: beforeRetirement ? "FIRE" : "Pension",
            contribution: 0,
            withdrawal,
            withdrawalSource,
            withdrawalShortfall: shortfall,
          });
        }

        eligibleIndexes.forEach((assetIndex, allocationIndex) => {
          projected[assetIndex] = Math.max(
            0,
            projected[assetIndex] - actualAmounts[allocationIndex],
          );
        });

        const periodYears = yearsBetween(
          schedule.dates[index],
          schedule.dates[index + 1],
        );
        projected.forEach((balance, assetIndex) => {
          projected[assetIndex] = growBalance(
            balance,
            rates[assetIndex],
            periodYears,
          );
        });
      }

      return projected;
    }

    function simulateDrawdown(startDate, balances, shouldRecord) {
      const status = { isFullyFunded: true, firstShortfallDate: null };
      let projected = [...balances];

      if (startDate < retirementDate) {
        const bridgeSchedule = buildDrawdownSchedule(
          startDate,
          retirementDate,
          true,
        );
        projected = runPhase(
          projected,
          bridgeSchedule,
          true,
          shouldRecord,
          status,
        );
      }

      projected = runPhase(
        projected,
        retirementSchedule,
        false,
        shouldRecord,
        status,
      );

      if (shouldRecord) {
        writeLedgerRow(finalDate, projected, {
          phase: "Slut",
          contribution: 0,
          withdrawal: 0,
          withdrawalSource: "—",
          withdrawalShortfall: false,
        });
      }

      return { ...status, finalBalances: projected };
    }

    function evaluateMilestone(date, balances) {
      const bridgeYears = yearsBetween(date, retirementDate);
      const pensionAtRetirement =
        growBalance(balances[0], realPensionReturn, bridgeYears) +
        growBalance(balances[1], realPensionReturn, bridgeYears);
      const coastFinanced =
        pensionAtRetirement + CALCULATION_TOLERANCE >= requiredAtRetirement;
      const drawdown = simulateDrawdown(date, balances, false);
      let possibleBridgeWithdrawal = 0;

      if (date < retirementDate) {
        const bridgeSchedule = buildDrawdownSchedule(
          date,
          retirementDate,
          true,
        );
        possibleBridgeWithdrawal =
          annualCapacity(
            balances[2],
            realFreeFundsReturn,
            bridgeSchedule.dates,
            bridgeSchedule.factors,
            0,
          ) +
          annualCapacity(
            balances[3],
            realAskReturn,
            bridgeSchedule.dates,
            bridgeSchedule.factors,
            0,
          );
      }

      return {
        age: getAge(birthDate, date),
        exactAge: ageAtDate(birthDate, date),
        date: new Date(date),
        ratePension: balances[0],
        ageSavings: balances[1],
        freeFunds: balances[2],
        ask: balances[3],
        bridgeYears,
        coastFinanced,
        possibleBridgeWithdrawal,
        fireReady: drawdown.isFullyFunded,
      };
    }

    function findFirstDay(startDate, endDate, predicate) {
      const startDay = dayNumber(startDate);
      const endDay = dayNumber(endDate);

      if (predicate(startDate)) {
        return new Date(startDate);
      }
      if (!predicate(endDate)) {
        return null;
      }

      let lowerDay = startDay;
      let upperDay = endDay;
      while (upperDay - lowerDay > 1) {
        const middleDay = Math.floor((lowerDay + upperDay) / 2);
        const middleDate = dateFromDayNumber(middleDay);
        if (predicate(middleDate)) {
          upperDay = middleDay;
        } else {
          lowerDay = middleDay;
        }
      }

      return dateFromDayNumber(upperDay);
    }

    const accumulationDates = buildAnnualDates(asOfDate, retirementDate);
    let stateDate = asOfDate;
    let stateBalances = [...initialBalances];
    let pensionContributionsActive = true;
    writeLedgerRow(stateDate, stateBalances);

    for (
      let boundaryIndex = 1;
      boundaryIndex < accumulationDates.length && !fireRow;
      boundaryIndex += 1
    ) {
      const boundaryDate = accumulationDates[boundaryIndex];

      while (stateDate < boundaryDate && !fireRow) {
        const startingMilestone = evaluateMilestone(stateDate, stateBalances);
        addMilestoneRow(startingMilestone);

        if (!pensionCoastRow && startingMilestone.coastFinanced) {
          pensionCoastRow = startingMilestone;
          pensionStopRow = pensionStopRow || startingMilestone;
          pensionContributionsActive = false;
        }
        if (startingMilestone.fireReady) {
          fireRow = startingMilestone;
          pensionStopRow = pensionStopRow || startingMilestone;
          break;
        }

        const balancesAt = (date) =>
          projectBalances(
            stateBalances,
            stateDate,
            date,
            pensionContributionsActive,
          );
        const coastDate = pensionCoastRow
          ? null
          : findFirstDay(stateDate, boundaryDate, (date) =>
              evaluateMilestone(date, balancesAt(date)).coastFinanced,
            );
        const fireSearchEnd = coastDate || boundaryDate;
        const candidateFireDate = findFirstDay(
          stateDate,
          fireSearchEnd,
          (date) => evaluateMilestone(date, balancesAt(date)).fireReady,
        );

        if (
          candidateFireDate &&
          (!coastDate || candidateFireDate <= coastDate)
        ) {
          const nextBalances = balancesAt(candidateFireDate);
          recordAccumulationSegment(
            stateDate,
            stateBalances,
            candidateFireDate,
            nextBalances,
            pensionContributionsActive,
          );
          stateDate = candidateFireDate;
          stateBalances = nextBalances;
          const milestone = evaluateMilestone(stateDate, stateBalances);
          addMilestoneRow(milestone);
          if (!pensionCoastRow && milestone.coastFinanced) {
            pensionCoastRow = milestone;
          }
          pensionStopRow = pensionStopRow || milestone;
          fireRow = milestone;
          break;
        }

        if (coastDate) {
          const nextBalances = balancesAt(coastDate);
          recordAccumulationSegment(
            stateDate,
            stateBalances,
            coastDate,
            nextBalances,
            pensionContributionsActive,
          );
          stateDate = coastDate;
          stateBalances = nextBalances;
          const milestone = evaluateMilestone(stateDate, stateBalances);
          addMilestoneRow(milestone);
          pensionCoastRow = milestone;
          pensionStopRow = pensionStopRow || milestone;
          pensionContributionsActive = false;
          continue;
        }

        const nextBalances = balancesAt(boundaryDate);
        recordAccumulationSegment(
          stateDate,
          stateBalances,
          boundaryDate,
          nextBalances,
          pensionContributionsActive,
        );
        stateDate = boundaryDate;
        stateBalances = nextBalances;
      }
    }

    if (!fireRow) {
      const retirementMilestone = evaluateMilestone(
        retirementDate,
        stateBalances,
      );
      addMilestoneRow(retirementMilestone);
      if (!pensionCoastRow && retirementMilestone.coastFinanced) {
        pensionCoastRow = retirementMilestone;
      }
      if (retirementMilestone.fireReady) {
        fireRow = retirementMilestone;
        pensionStopRow = pensionStopRow || retirementMilestone;
      }
    }

    const drawdownStartDate = fireRow ? fireRow.date : retirementDate;
    const drawdownStartBalances = fireRow
      ? [
          fireRow.ratePension,
          fireRow.ageSavings,
          fireRow.freeFunds,
          fireRow.ask,
        ]
      : stateBalances;
    const drawdown = simulateDrawdown(
      drawdownStartDate,
      drawdownStartBalances,
      true,
    );
    const planRows = [...ledger.values()].sort(
      (first, second) => first.date - second.date,
    );
    const finalRow = planRows[planRows.length - 1];
    const pensionTargetAtStop = pensionStopRow
      ? requiredAtRetirement /
        Math.pow(
          1 + realPensionReturn,
          yearsBetween(pensionStopRow.date, retirementDate),
        )
      : null;
    assertFinite(pensionTargetAtStop ?? 0);

    planRows.forEach((row) => {
      Object.values(row)
        .filter((value) => typeof value === "number")
        .forEach((value) => assertFinite(value));
    });

    return {
      currentAge,
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

  return {
    addYears,
    annualEndWithdrawalFromBalance,
    annualWithdrawalFromBalance,
    calculateFire,
    getAge,
    presentValueOfWithdrawals,
    yearsBetween,
  };
});
