(function (root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  root.FireCalculations = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function getAge(birthDate, asOfDate) {
    let age = asOfDate.getFullYear() - birthDate.getFullYear();
    const birthdayHasPassed =
      asOfDate.getMonth() > birthDate.getMonth() ||
      (asOfDate.getMonth() === birthDate.getMonth() &&
        asOfDate.getDate() >= birthDate.getDate());

    if (!birthdayHasPassed) {
      age -= 1;
    }

    return age;
  }

  function addYears(date, years) {
    const result = new Date(date);
    result.setFullYear(result.getFullYear() + years);
    return result;
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

  function allocateWithdrawal(
    firstCapacity,
    secondCapacity,
    desiredWithdrawal,
  ) {
    const totalCapacity = firstCapacity + secondCapacity;
    const withdrawal = Math.min(desiredWithdrawal, totalCapacity);

    if (totalCapacity <= 0) {
      return { first: 0, second: 0, total: 0 };
    }

    return {
      first: withdrawal * (firstCapacity / totalCapacity),
      second: withdrawal * (secondCapacity / totalCapacity),
      total: withdrawal,
    };
  }

  function realContribution(inputs, contribution, elapsedYears) {
    if (inputs.contributionsFollowInflation !== false) {
      return contribution;
    }

    return contribution / Math.pow(1 + inputs.inflationRate, elapsedYears);
  }

  function buildPlanRows(
    inputs,
    asOfDate,
    currentAge,
    pensionStopRow,
    fireRow,
    returns,
  ) {
    const lastAge = inputs.retirementAge + inputs.payoutYears;
    const fireAge = fireRow ? fireRow.age : inputs.retirementAge;
    const pensionStopAge = pensionStopRow
      ? pensionStopRow.age
      : inputs.retirementAge;
    const rows = [];
    let ratePension = inputs.ratePensionBalance;
    let ageSavings = inputs.ageSavingsBalance;
    let freeFunds = inputs.freeFundsBalance;
    let ask = inputs.askBalance;

    for (let age = currentAge; age <= lastAge; age += 1) {
      const elapsedYears = age - currentAge;
      const ratePensionContribution = realContribution(
        inputs,
        inputs.annualRatePensionContribution,
        elapsedYears,
      );
      const ageSavingsContribution = realContribution(
        inputs,
        inputs.annualAgeSavingsContribution,
        elapsedYears,
      );
      const freeFundsContribution = realContribution(
        inputs,
        inputs.annualFreeFundsContribution,
        elapsedYears,
      );
      let phase = "Slut";
      let contribution = 0;
      let withdrawal = 0;
      let withdrawalSource = "—";
      let bridgeAllocation = null;
      let pensionAllocation = null;

      if (age < fireAge) {
        phase = "Opsparing";
        contribution =
          (age < pensionStopAge
            ? ratePensionContribution + ageSavingsContribution
            : 0) + freeFundsContribution;
      } else if (age < inputs.retirementAge) {
        phase = "FIRE";
        withdrawalSource = "Frie midler";
        const yearsRemaining = inputs.retirementAge - age;
        bridgeAllocation = allocateWithdrawal(
          annualWithdrawalFromBalance(
            freeFunds,
            returns.realFreeFundsReturn,
            yearsRemaining,
          ),
          annualWithdrawalFromBalance(
            ask,
            returns.realAskReturn,
            yearsRemaining,
          ),
          inputs.desiredAnnualWithdrawal,
        );
        withdrawal = bridgeAllocation.total;
      } else if (age < lastAge) {
        phase = "Pension";
        withdrawalSource = "Pension";
        const yearsRemaining = lastAge - age;
        pensionAllocation = allocateWithdrawal(
          annualEndWithdrawalFromBalance(
            ratePension,
            returns.realPensionReturn,
            yearsRemaining,
          ),
          annualEndWithdrawalFromBalance(
            ageSavings,
            returns.realPensionReturn,
            yearsRemaining,
          ),
          inputs.desiredAnnualWithdrawal,
        );
        withdrawal = pensionAllocation.total;
      }

      rows.push({
        age,
        date: addYears(asOfDate, age - currentAge),
        phase,
        ratePension,
        ageSavings,
        freeFunds,
        ask,
        totalBalance: ratePension + ageSavings + freeFunds + ask,
        contribution,
        withdrawal,
        withdrawalSource,
        withdrawalShortfall:
          (phase === "FIRE" || phase === "Pension") &&
          inputs.desiredAnnualWithdrawal > 0 &&
          withdrawal < inputs.desiredAnnualWithdrawal,
      });

      if (age === lastAge) {
        break;
      }

      if (phase === "Opsparing") {
        ratePension =
          ratePension * (1 + returns.realPensionReturn) +
          (age < pensionStopAge ? ratePensionContribution : 0);
        ageSavings =
          ageSavings * (1 + returns.realPensionReturn) +
          (age < pensionStopAge ? ageSavingsContribution : 0);
        freeFunds =
          freeFunds * (1 + returns.realFreeFundsReturn) + freeFundsContribution;
        ask *= 1 + returns.realAskReturn;
      } else if (phase === "FIRE") {
        ratePension *= 1 + returns.realPensionReturn;
        ageSavings *= 1 + returns.realPensionReturn;
        freeFunds =
          Math.max(0, freeFunds - bridgeAllocation.first) *
          (1 + returns.realFreeFundsReturn);
        ask =
          Math.max(0, ask - bridgeAllocation.second) *
          (1 + returns.realAskReturn);
      } else {
        ratePension = Math.max(
          0,
          ratePension * (1 + returns.realPensionReturn) -
            pensionAllocation.first,
        );
        ageSavings = Math.max(
          0,
          ageSavings * (1 + returns.realPensionReturn) -
            pensionAllocation.second,
        );
        freeFunds *= 1 + returns.realFreeFundsReturn;
        ask *= 1 + returns.realAskReturn;
      }
    }

    return rows;
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

  function calculateFire(inputs, asOfDate = new Date()) {
    const birthDate = inputs.birthDate;
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
    const realReturns = [realPensionReturn, realAskReturn, realFreeFundsReturn];

    if (realReturns.some((rate) => !Number.isFinite(rate) || rate <= -1)) {
      throw new Error("Forudsætningerne giver et ugyldigt reelt afkast.");
    }

    const yearsToRetirement = inputs.retirementAge - currentAge;
    const requiredAtRetirement = presentValueOfWithdrawals(
      realPensionReturn,
      inputs.payoutYears,
      inputs.desiredAnnualWithdrawal,
    );
    const pensionTargetToday =
      requiredAtRetirement / Math.pow(1 + realPensionReturn, yearsToRetirement);

    if (
      !Number.isFinite(requiredAtRetirement) ||
      !Number.isFinite(pensionTargetToday)
    ) {
      throw new Error("Forudsætningerne giver et ugyldigt pensionsmål.");
    }

    const rows = [];
    let ratePension = inputs.ratePensionBalance;
    let ageSavings = inputs.ageSavingsBalance;
    let freeFunds = inputs.freeFundsBalance;
    let ask = inputs.askBalance;

    for (let age = currentAge; age <= inputs.retirementAge; age += 1) {
      const elapsedYears = age - currentAge;
      const bridgeYears = inputs.retirementAge - age;
      const coastFinanced =
        (ratePension + ageSavings) *
          Math.pow(1 + realPensionReturn, bridgeYears) >=
        requiredAtRetirement;
      const possibleBridgeWithdrawal =
        annualWithdrawalFromBalance(
          freeFunds,
          realFreeFundsReturn,
          bridgeYears,
        ) + annualWithdrawalFromBalance(ask, realAskReturn, bridgeYears);
      const fireReady =
        coastFinanced &&
        (bridgeYears === 0 ||
          possibleBridgeWithdrawal >= inputs.desiredAnnualWithdrawal);

      rows.push({
        age,
        date: addYears(asOfDate, age - currentAge),
        ratePension,
        ageSavings,
        freeFunds,
        ask,
        bridgeYears,
        coastFinanced,
        possibleBridgeWithdrawal,
        fireReady,
      });

      ratePension =
        ratePension * (1 + realPensionReturn) +
        realContribution(
          inputs,
          inputs.annualRatePensionContribution,
          elapsedYears,
        );
      ageSavings =
        ageSavings * (1 + realPensionReturn) +
        realContribution(
          inputs,
          inputs.annualAgeSavingsContribution,
          elapsedYears,
        );
      freeFunds =
        freeFunds * (1 + realFreeFundsReturn) +
        realContribution(
          inputs,
          inputs.annualFreeFundsContribution,
          elapsedYears,
        );
      ask *= 1 + realAskReturn;
    }

    const pensionStopRow = rows.find((row) => row.coastFinanced) || null;
    const fireRow = rows.find((row) => row.fireReady) || null;
    const pensionTargetAtStop = pensionStopRow
      ? requiredAtRetirement /
        Math.pow(
          1 + realPensionReturn,
          inputs.retirementAge - pensionStopRow.age,
        )
      : null;
    const planRows = buildPlanRows(
      inputs,
      asOfDate,
      currentAge,
      pensionStopRow,
      fireRow,
      {
        realPensionReturn,
        realAskReturn,
        realFreeFundsReturn,
      },
    );
    const finalRow = planRows[planRows.length - 1];

    return {
      currentAge,
      netPensionReturn,
      realPensionReturn,
      realAskReturn,
      realFreeFundsReturn,
      yearsToRetirement,
      requiredAtRetirement,
      pensionTargetToday,
      pensionStopRow,
      pensionTargetAtStop,
      fireRow,
      rows,
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
  };
});
