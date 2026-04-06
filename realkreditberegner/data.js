(function () {
  const LOAN_TYPES = [
    {
      id: "fast",
      label: "Fast rente",
      rate: 4.0,
      rateLabel: "4,0%",
      color: "#c9a87c",
    },
    {
      id: "f5",
      label: "F5",
      rate: 2.6,
      rateLabel: "2,6%",
      color: "#6db3e8",
    },
    {
      id: "f3",
      label: "F3",
      rate: 2.4,
      rateLabel: "2,4%",
      color: "#a78bfa",
    },
    {
      id: "kort",
      label: "Kort Rente",
      rate: 2.3,
      rateLabel: "2,3%",
      color: "#34d399",
    },
  ];

  const BASE_BIDRAG = {
    fast: { "0-40": 0.225, "40-60": 0.675, "60-80": 1.025 },
    f5: { "0-40": 0.4, "40-60": 0.925, "60-80": 1.275 },
    f3: { "0-40": 0.6, "40-60": 1.125, "60-80": 1.475 },
    kort: { "0-40": 0.4, "40-60": 0.925, "60-80": 1.275 },
  };

  const AF_TILLAEG = {
    fast: { "0-40": 0.0, "40-60": 0.05, "60-80": 0.65 },
    f5: { "0-40": 0.02, "40-60": 0.075, "60-80": 0.65 },
    f3: { "0-40": 0.02, "40-60": 0.075, "60-80": 0.65 },
    kort: { "0-40": 0.02, "40-60": 0.075, "60-80": 0.65 },
  };

  const TAX = 0.337;
  const LOAN_YEARS = 30;

  const MILESTONES = [
    {
      ltv: 80,
      band: "60-80",
      af: false,
      tag: "Med afdrag",
      tc: "#e07a5f",
      desc: "Maks. belåning · Afdragsfrihed ikke muligt",
    },
    {
      ltv: 60,
      band: "40-60",
      af: true,
      tag: "Afdragsfri",
      tc: "#6db3e8",
      desc: "Afdragsfrihed muligt · Lavere bidrag",
    },
    {
      ltv: 40,
      band: "0-40",
      af: true,
      tag: "Lavest bidrag",
      tc: "#34d399",
      desc: "Laveste bidragsinterval",
    },
  ];

  const INV_LABELS = {
    afkast: { label: "Afkast (efter inv.skat)", color: "#c9a87c" },
    extraCost: { label: "Ekstra rente+bidrag", color: "#e07a5f" },
    nettoAfkast: { label: "Netto afkast", color: "#34d399" },
  };

  function buildEcbMsciRaw() {
    const annualReturns = [
      24.9, -13.2, -16.8, -19.9, 33.1, 14.7, 9.5, 20.1, 9.0, -40.7, 30.0, 11.8,
      -5.0, 16.5, 27.4, 5.5, -0.3, 8.2, 23.1, -8.2, 28.4, 16.5, 22.4, -17.7,
      24.4, 19.2, 21.6,
    ];
    const labels = [];
    const msciQ = [];

    for (let yearIndex = 0; yearIndex < annualReturns.length; yearIndex += 1) {
      const year = 1999 + yearIndex;
      const quarterlyReturn =
        (Math.pow(1 + annualReturns[yearIndex] / 100, 0.25) - 1) * 100;
      const annualized = +(quarterlyReturn * 4).toFixed(1);

      for (let quarter = 1; quarter <= 4; quarter += 1) {
        msciQ.push(annualized);
        labels.push(`${year} Q${quarter}`);
      }
    }

    msciQ.push(+(-2.15 * 4).toFixed(1));
    labels.push("2026 Q1");

    const ecbBase = [
      2.5, 2.5, 3.75, 4.25, 3.25, 2.5, 2.0, 2.0, 2.75, 3.75, 3.75, 1.25, 1.0,
      1.25, 0.75, 0.5, 0.15, 0.05, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.4, 4.0,
      3.65, 2.35,
    ];
    const ecb = [];
    for (let yearIndex = 0; yearIndex < ecbBase.length; yearIndex += 1) {
      for (let quarter = 0; quarter < 4; quarter += 1) {
        ecb.push(ecbBase[yearIndex]);
      }
    }

    const overrideQuarter = (year, quarterIndex, value) => {
      ecb[(year - 1999) * 4 + quarterIndex] = value;
    };

    overrideQuarter(2008, 0, 4.0);
    overrideQuarter(2008, 1, 4.0);
    overrideQuarter(2008, 2, 4.25);
    overrideQuarter(2008, 3, 2.5);
    overrideQuarter(2009, 0, 2.0);
    overrideQuarter(2009, 1, 1.25);
    overrideQuarter(2009, 2, 1.0);
    overrideQuarter(2009, 3, 1.0);
    overrideQuarter(2011, 0, 1.0);
    overrideQuarter(2011, 1, 1.25);
    overrideQuarter(2011, 2, 1.5);
    overrideQuarter(2011, 3, 1.0);
    overrideQuarter(2014, 0, 0.25);
    overrideQuarter(2014, 1, 0.15);
    overrideQuarter(2014, 2, 0.05);
    overrideQuarter(2014, 3, 0.05);
    overrideQuarter(2022, 0, 0.0);
    overrideQuarter(2022, 1, 0.0);
    overrideQuarter(2022, 2, 0.5);
    overrideQuarter(2022, 3, 2.0);
    overrideQuarter(2023, 0, 3.0);
    overrideQuarter(2023, 1, 3.75);
    overrideQuarter(2023, 2, 4.25);
    overrideQuarter(2023, 3, 4.5);
    overrideQuarter(2024, 0, 4.5);
    overrideQuarter(2024, 1, 4.25);
    overrideQuarter(2024, 2, 3.65);
    overrideQuarter(2024, 3, 3.15);
    overrideQuarter(2025, 0, 2.9);
    overrideQuarter(2025, 1, 2.65);
    overrideQuarter(2025, 2, 2.15);
    overrideQuarter(2025, 3, 2.15);
    ecb.push(2.15);

    return { labels, msciQ, ecb };
  }

  window.RealkreditData = {
    LOAN_TYPES,
    BASE_BIDRAG,
    AF_TILLAEG,
    TAX,
    LOAN_YEARS,
    MILESTONES,
    INV_LABELS,
    ECB_MSCI_RAW: buildEcbMsciRaw(),
  };
})();
