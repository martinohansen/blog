(function () {
  const {
    LOAN_TYPES,
    BASE_BIDRAG,
    AF_TILLAEG,
    TAX_MODEL,
    LOAN_YEARS,
    MILESTONES,
    ECB_MSCI_RAW,
  } = window.RealkreditData;

  const numberFormat = new Intl.NumberFormat("da-DK", {
    maximumFractionDigits: 0,
  });

  function fmt(number) {
    return numberFormat.format(number);
  }

  function fmtPct(value) {
    return `${value.toFixed(3).replace(".", ",")}%`;
  }

  function fmtPct2(value) {
    return `${value.toFixed(2).replace(".", ",")}%`;
  }

  function fmtPct1(value) {
    return `${value.toFixed(1).replace(".", ",")}%`;
  }

  const BIDRAG_INTERVALS = [
    { band: "0-40", from: 0, to: 40 },
    { band: "40-60", from: 40, to: 60 },
    { band: "60-80", from: 60, to: 80 },
  ];

  function getBidrag(loanTypeId, band, isInterestOnly) {
    return (
      BASE_BIDRAG[loanTypeId][band] +
      (isInterestOnly ? AF_TILLAEG[loanTypeId][band] : 0)
    );
  }

  function getEffectiveBidragPct(loanTypeId, ltv, isInterestOnly) {
    if (ltv <= 0) {
      return 0;
    }

    const weightedBidrag = BIDRAG_INTERVALS.reduce((sum, interval) => {
      const coveredSpan = Math.max(0, Math.min(ltv, interval.to) - interval.from);
      if (coveredSpan === 0) {
        return sum;
      }

      return sum + coveredSpan * getBidrag(loanTypeId, interval.band, isInterestOnly);
    }, 0);

    return weightedBidrag / ltv;
  }

  function annuityYearly(principal, annualRate) {
    if (annualRate === 0) {
      return principal / LOAN_YEARS;
    }

    const rate = annualRate / 100;
    return principal * (rate / (1 - Math.pow(1 + rate, -LOAN_YEARS)));
  }

  function getTaxThreshold(taxHousehold) {
    return TAX_MODEL.thresholds[taxHousehold] || TAX_MODEL.thresholds.single;
  }

  function getTaxRelief(deductibleAmount, taxHousehold) {
    if (deductibleAmount <= 0) {
      return 0;
    }

    const threshold = getTaxThreshold(taxHousehold);
    const lowBandAmount = Math.min(deductibleAmount, threshold);
    const highBandAmount = Math.max(0, deductibleAmount - threshold);

    return (
      lowBandAmount * TAX_MODEL.lowRate +
      highBandAmount * TAX_MODEL.highRate
    );
  }

  function getNetDeductibleCost(deductibleAmount, taxHousehold) {
    return Math.max(0, deductibleAmount - getTaxRelief(deductibleAmount, taxHousehold));
  }

  function breakdown(loanTypeId, rate, ltv, isInterestOnly, amount, taxHousehold = "single") {
    const bidragPct = getEffectiveBidragPct(loanTypeId, ltv, isInterestOnly);
    const renteKrB = (rate / 100) * amount;
    const bidragKrB = (bidragPct / 100) * amount;
    const afdragKr = isInterestOnly
      ? 0
      : annuityYearly(amount, rate) - renteKrB;
    const deductibleCost = renteKrB + bidragKrB;
    const taxRelief = getTaxRelief(deductibleCost, taxHousehold);
    const effectiveReliefRate = deductibleCost === 0 ? 0 : taxRelief / deductibleCost;
    const renteKrN = renteKrB * (1 - effectiveReliefRate);
    const bidragKrN = bidragKrB * (1 - effectiveReliefRate);

    return {
      bidragPct,
      rentePct: rate,
      afdragsfri: isInterestOnly,
      renteKrB,
      renteKrN,
      bidragKrB,
      bidragKrN,
      taxRelief,
      afdragKr,
      ydelseB: renteKrB + bidragKrB,
      ydelseN: renteKrN + bidragKrN,
      totalB: renteKrB + bidragKrB + afdragKr,
      totalN: renteKrN + bidragKrN + afdragKr,
    };
  }

  function getLoanBandForLtv(ltv) {
    if (ltv > 60) {
      return { band: "60-80", af: false };
    }
    if (ltv > 40) {
      return { band: "40-60", af: true };
    }
    return { band: "0-40", af: true };
  }

  function buildChartData(amount, taxHousehold = "single") {
    const points = [];

    for (let ltv = 80; ltv >= 10; ltv -= 1) {
      const point = { ltv };
      const config = getLoanBandForLtv(ltv);

      LOAN_TYPES.forEach((loanType) => {
        const result = breakdown(
          loanType.id,
          loanType.rate,
          ltv,
          config.af,
          amount,
          taxHousehold,
        );
        point[`${loanType.id}_netto`] = Math.round(result.totalN);
        point[`${loanType.id}_brutto`] = Math.round(result.totalB);
        point[`${loanType.id}_yn`] = Math.round(result.ydelseN);
        point[`${loanType.id}_yb`] = Math.round(result.ydelseB);
      });

      points.push(point);
    }

    return points.reverse();
  }

  function buildMilestoneData(activeLoanTypes, loanAmount, taxHousehold = "single") {
    return MILESTONES.map((milestone) => ({
      ...milestone,
      rows: activeLoanTypes.map((loanType) => ({
        loanType,
        breakdown: breakdown(
          loanType.id,
          loanType.rate,
          milestone.ltv,
          milestone.af,
          loanAmount,
          taxHousehold,
        ),
      })),
    }));
  }

  function getMaxBarValue(milestoneData, showNet) {
    return Math.max(
      ...milestoneData.map((milestone) =>
        Math.max(
          ...milestone.rows.map(({ breakdown: result }) =>
            showNet ? result.totalN : result.totalB,
          ),
        ),
      ),
    );
  }

  function fairComparison(
    loanTypeId,
    rate,
    loanAmount,
    investReturnPct,
    years,
    taxHousehold = "single",
  ) {
    const propertyValue = loanAmount / 0.6;
    const annuity = annuityYearly(loanAmount, rate);
    const bidragPctAfdragsfri = getEffectiveBidragPct(loanTypeId, 60, true);
    const monthlyReturn = Math.pow(1 + investReturnPct / 100, 1 / 12) - 1;

    let principalA = loanAmount;
    let cumulativeCostA = 0;
    let cumulativeCostB = 0;
    let portfolio = 0;
    let totalInvested = 0;

    const points = [
      {
        year: 0,
        afkast: 0,
        extraCost: 0,
        nettoAfkast: 0,
        invested: 0,
        equityBuilt: 0,
      },
    ];

    for (let year = 1; year <= years; year += 1) {
      const ltvA = (principalA / propertyValue) * 100;
      const bidragPctA = getEffectiveBidragPct(loanTypeId, ltvA, false);
      const renteA = (rate / 100) * principalA;
      const bidragA = (bidragPctA / 100) * principalA;
      const afdragA = annuity - renteA;
      principalA = Math.max(0, principalA - afdragA);

      const costA = getNetDeductibleCost(renteA + bidragA, taxHousehold);
      cumulativeCostA += costA;

      const renteB = (rate / 100) * loanAmount;
      const bidragB = (bidragPctAfdragsfri / 100) * loanAmount;
      const costB = getNetDeductibleCost(renteB + bidragB, taxHousehold);
      cumulativeCostB += costB;

      const monthlyFreed = Math.max(0, (costA + afdragA - costB) / 12);
      for (let month = 0; month < 12; month += 1) {
        portfolio += monthlyFreed;
        totalInvested += monthlyFreed;
        portfolio *= 1 + monthlyReturn;
      }

      const previousAfkast = points[year - 1].afkast;
      const currentAfkast = portfolio - totalInvested;
      const taxableGain = Math.max(0, currentAfkast - previousAfkast);
      const lowRateThreshold = 61000;

      let taxDue = 0;
      if (taxableGain > 0) {
        taxDue =
          taxableGain <= lowRateThreshold
            ? taxableGain * 0.27
            : lowRateThreshold * 0.27 + (taxableGain - lowRateThreshold) * 0.42;
      }
      portfolio -= taxDue;

      const afkast = portfolio - totalInvested;
      const extraCost = cumulativeCostB - cumulativeCostA;

      points.push({
        year,
        afkast: Math.round(afkast),
        extraCost: Math.round(extraCost),
        nettoAfkast: Math.round(afkast - extraCost),
        invested: Math.round(totalInvested),
        equityBuilt: Math.round(loanAmount - principalA),
        portfolio: Math.round(portfolio),
        freedYearly: Math.round(costA + afdragA - costB),
      });
    }

    return points;
  }

  function buildInvestmentData(
    activeLoanTypes,
    loanAmount,
    investReturn,
    investYears,
    taxHousehold = "single",
  ) {
    const data = {};

    activeLoanTypes.forEach((loanType) => {
      data[loanType.id] = fairComparison(
        loanType.id,
        loanType.rate,
        loanAmount,
        investReturn,
        investYears,
        taxHousehold,
      );
    });

    return data;
  }

  function buildEcbMsciChartData(startYear, rollYears) {
    const { labels, msciQ, ecb } = ECB_MSCI_RAW;
    const rollingWindow = rollYears * 4;
    const averages = msciQ.map((_, index) => {
      const start = Math.max(0, index - rollingWindow + 1);
      const slice = msciQ.slice(start, index + 1);
      return +(slice.reduce((sum, value) => sum + value, 0) / slice.length).toFixed(1);
    });
    const startIndex = (startYear - 1999) * 4;

    return labels.slice(startIndex).map((label, index) => ({
      label,
      ecb: ecb[startIndex + index],
      msci: msciQ[startIndex + index],
      avg: averages[startIndex + index],
    }));
  }

  window.RealkreditCalculations = {
    fmt,
    fmtPct,
    fmtPct1,
    fmtPct2,
    getBidrag,
    getEffectiveBidragPct,
    getTaxThreshold,
    getTaxRelief,
    getNetDeductibleCost,
    annuityYearly,
    breakdown,
    getLoanBandForLtv,
    buildChartData,
    buildMilestoneData,
    getMaxBarValue,
    fairComparison,
    buildInvestmentData,
    buildEcbMsciChartData,
  };
})();
