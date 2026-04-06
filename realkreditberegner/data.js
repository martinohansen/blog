(function () {
  const LOAN_TYPES = [
    {
      id: "fast",
      label: "Fast",
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
      label: "Kort",
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

  const TAX_MODEL = {
    lowRate: 0.337,
    highRate: 0.257,
    thresholds: {
      single: 50000,
      couple: 100000,
    },
    households: [
      { id: "single", label: "Enlig" },
      { id: "couple", label: "Ægtepar" },
    ],
  };
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
    // Derived from MSCI index 990100 monthly performance history
    // (variant GRTR, currency USD) using quarter-end trading months.
    const msciQ = [
      3.651352, 5.005966, -1.415415, 16.83152, 1.089812, -3.361388, -4.97421, -6.205243,
      -12.774722, 2.773747, -14.301854, 8.662773, 0.428082, -8.992685, -18.298782, 7.748987,
      -4.943904, 17.246555, 4.940171, 14.369372, 2.719295, 1.042509, -0.904183, 12.051267,
      -1.008267, 0.612032, 7.084125, 3.159757, 6.715303, -0.327777, 4.571407, 8.472987,
      2.60201, 6.708333, 2.457034, -2.325843, -8.945216, -1.428075, -15.151611, -21.652069,
      -11.780543, 21.048309, 17.568202, 4.176587, 3.35443, -12.492372, 13.891293, 9.059304,
      4.913232, 0.675038, -16.517683, 7.721263, 11.715027, -4.855808, 6.83487, 2.626095,
      7.87299, 0.845554, 8.294012, 8.112589, 1.395636, 5.053477, -2.052503, 1.121764,
      2.453576, 0.487147, -8.334194, 5.623102, -0.193071, 1.212693, 4.992728, 1.972787,
      6.526561, 4.214991, 4.963667, 5.616867, -1.151214, 1.929472, 5.098659, -13.313319,
      12.64559, 4.199003, 0.658594, 8.678409, -20.932417, 19.542346, 8.046681, 14.072308,
      5.040065, 7.88736, 0.09318, 7.861131, -5.043863, -16.052564, -6.082006, 9.887432,
      7.876829, 7.003951, -3.362323, 11.531969, 9.005899, 2.779004, 6.463105, -0.068512,
      -1.684904, 11.63123, 7.361411, 3.199428, -3.474716,
    ];
    // Hidden lookback for rolling annualized lines. MSCI's public monthly API
    // starts at 1998-12-31, so pre-1999 values use published annual gross
    // returns split evenly across quarters. They are not plotted as quarter data.
    const msciAnnualLookback = {
      1984: 5.77,
      1985: 41.77,
      1986: 42.8,
      1987: 16.76,
      1988: 23.95,
      1989: 17.19,
      1990: -16.52,
      1991: 18.97,
      1992: -4.66,
      1993: 23.13,
      1994: 5.58,
      1995: 21.32,
      1996: 14.0,
      1997: 16.23,
      1998: 24.8,
    };
    const msciLookbackQ = [];
    Object.keys(msciAnnualLookback).forEach((yearValue) => {
      const year = +yearValue;
      const quarterlyReturn = (Math.pow(1 + msciAnnualLookback[year] / 100, 1 / 4) - 1) * 100;
      const firstQuarter = year === 1984 ? 2 : 1;

      for (let quarter = firstQuarter; quarter <= 4; quarter += 1) {
        msciLookbackQ.push(+quarterlyReturn.toFixed(6));
      }
    });
    const msciHistoryQ = msciLookbackQ.concat(msciQ);
    const msciVisibleStartIndex = msciLookbackQ.length;
    const labels = [];

    for (let year = 1999; year <= 2025; year += 1) {
      for (let quarter = 1; quarter <= 4; quarter += 1) {
        labels.push(`${year} Q${quarter}`);
      }
    }
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

    return { labels, msciQ, msciHistoryQ, msciVisibleStartIndex, ecb };
  }

  window.RealkreditData = {
    LOAN_TYPES,
    BASE_BIDRAG,
    AF_TILLAEG,
    TAX_MODEL,
    LOAN_YEARS,
    MILESTONES,
    INV_LABELS,
    ECB_MSCI_RAW: buildEcbMsciRaw(),
  };
})();
