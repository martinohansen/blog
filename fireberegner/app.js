(function () {
  const form = document.querySelector("#fire-form");
  const errorBox = document.querySelector("#error");
  const results = document.querySelector("#results");
  const tableBody = document.querySelector("#projection-body");
  const chart = document.querySelector("#wealth-chart");
  const resultHeading = document.querySelector("#result-heading");
  const inflationState = document.querySelector("#inflation-state");
  const pensionRedirectState = document.querySelector(
    "#pension-redirect-state",
  );
  const withdrawalTaxState = document.querySelector("#withdrawal-tax-state");
  const optimizeButton = document.querySelector("#optimize-contributions");
  const optimizeButtonLabel = optimizeButton.querySelector("span");
  const optimizationResult = document.querySelector("#optimization-result");
  const optimizationHeading = document.querySelector(
    "#optimization-heading",
  );
  const optimizationComparison = document.querySelector(
    "#optimization-comparison",
  );
  const optimizationFireShift = document.querySelector(
    "#optimization-fire-shift",
  );
  const optimizationNote = document.querySelector("#optimization-note");
  const optimizationAllocationBar = document.querySelector(
    "#optimization-allocation-bar",
  );
  const applyOptimizationButton = document.querySelector(
    "#apply-optimization",
  );
  const { calculateFire, optimizeAnnualContributions } =
    window.FireCalculations;
  let latestOptimization = null;
  const inputLocale =
    document.documentElement.lang || navigator.language || "da-DK";
  const inputNumber = new Intl.NumberFormat(inputLocale, {
    maximumFractionDigits: 0,
  });
  const inputNumberParts = inputNumber.formatToParts(12345.6);
  const inputGroupSeparator =
    inputNumberParts.find((part) => part.type === "group")?.value || ".";
  const inputDecimalSeparator =
    inputNumberParts.find((part) => part.type === "decimal")?.value || ",";
  const formattedNumberInputs = [
    ...form.querySelectorAll("[data-number-format='integer']"),
  ];
  const nativeNumberInputs = [...form.querySelectorAll("input[type='number']")];

  const currency = new Intl.NumberFormat("da-DK", {
    style: "currency",
    currency: "DKK",
    maximumFractionDigits: 0,
  });
  const percent = new Intl.NumberFormat("da-DK", {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  const years = new Intl.NumberFormat("da-DK", {
    maximumFractionDigits: 1,
  });
  const ages = new Intl.NumberFormat("da-DK", {
    maximumFractionDigits: 0,
  });
  const compactNumber = new Intl.NumberFormat("da-DK", {
    notation: "compact",
    maximumFractionDigits: 1,
  });
  const dateFormat = new Intl.DateTimeFormat("da-DK", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  function parseLocalizedNumber(value) {
    let normalized = String(value).trim();
    normalized = normalized.split(inputGroupSeparator).join("");
    normalized = normalized.replace(/\s/g, "");
    normalized = normalized.split(inputDecimalSeparator).join(".");
    normalized = normalized.replace(/[^0-9.-]/g, "");
    return normalized ? Number(normalized) : Number.NaN;
  }

  function readNumber(name, divisor = 1) {
    const input = form.elements[name];
    const value = input.dataset.numberFormat
      ? parseLocalizedNumber(input.value)
      : Number(input.value);
    return value / divisor;
  }

  function formatNumberInput(input, preserveCaret = false) {
    if (!input.value.trim()) {
      return;
    }

    const caret = input.selectionStart ?? input.value.length;
    const digitsBeforeCaret = input.value
      .slice(0, caret)
      .replace(/\D/g, "").length;
    const value = parseLocalizedNumber(input.value);
    if (!Number.isFinite(value)) {
      return;
    }

    input.value = inputNumber.format(Math.max(0, Math.round(value)));
    if (!preserveCaret) {
      return;
    }

    let nextCaret = input.value.length;
    let digitCount = 0;
    for (let index = 0; index < input.value.length; index += 1) {
      if (/\d/.test(input.value[index])) {
        digitCount += 1;
      }
      if (digitCount === digitsBeforeCaret) {
        nextCaret = index + 1;
        break;
      }
    }
    input.setSelectionRange(nextCaret, nextCaret);
  }

  function changeNumberInput(input, direction) {
    const currentValue = parseLocalizedNumber(input.value);
    const startingValue = Number.isFinite(currentValue) ? currentValue : 0;
    const nextValue = Math.max(
      0,
      Math.round(startingValue + direction * 10000),
    );
    input.value = inputNumber.format(nextValue);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.focus();
  }

  function changeNativeNumberInput(input, direction) {
    if (direction > 0) {
      input.stepUp();
    } else {
      input.stepDown();
    }
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.focus();
  }

  function addNumberSteppers(input) {
    const stepper = document.createElement("span");
    const field = input.closest(".field");
    const inputSuffix = input.closest(".input-suffix");
    const inputUnit = inputSuffix?.querySelector("b")?.textContent.trim();
    const inputUnitLabel = inputUnit === "%" ? "procent" : inputUnit;
    const isFormattedAmount = input.matches("[data-number-format='integer']");
    const fieldLabel =
      field?.querySelector("span")?.textContent.trim().replace(/\s+i$/, "") ||
      "beløbet";
    const groupLabel = field
      ?.closest("fieldset")
      ?.querySelector("legend")
      ?.textContent.trim();
    const controlLabel =
      groupLabel && groupLabel !== "Din plan"
        ? `${fieldLabel} under ${groupLabel}`
        : fieldLabel;

    stepper.className = "amount-stepper";
    input.setAttribute(
      "aria-label",
      inputUnitLabel ? `${fieldLabel} i ${inputUnitLabel}` : fieldLabel,
    );

    [
      {
        direction: 1,
        label: `Forøg ${controlLabel}${isFormattedAmount ? " med 10.000 kr." : ""}`,
        path: "M1 4 4.5 1 8 4",
      },
      {
        direction: -1,
        label: `Sænk ${controlLabel}${isFormattedAmount ? " med 10.000 kr." : ""}`,
        path: "M1 1 4.5 4 8 1",
      },
    ].forEach(({ direction, label, path }) => {
      const button = document.createElement("button");
      button.className = "amount-step-button";
      button.type = "button";
      button.setAttribute("aria-label", label);
      button.title = label;
      button.innerHTML = `<svg viewBox="0 0 9 5" aria-hidden="true"><path d="${path}" /></svg>`;
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (isFormattedAmount) {
          changeNumberInput(input, direction);
        } else {
          changeNativeNumberInput(input, direction);
        }
      });
      stepper.append(button);
    });

    if (inputSuffix) {
      inputSuffix.append(stepper);
    } else {
      const wrapper = document.createElement("span");
      wrapper.className = "stepper-input";
      input.before(wrapper);
      wrapper.append(input, stepper);
    }

    if (isFormattedAmount) {
      input.addEventListener("keydown", (event) => {
        if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
          return;
        }
        event.preventDefault();
        changeNumberInput(input, event.key === "ArrowUp" ? 1 : -1);
      });
    }
  }

  function readInputs() {
    return {
      currentAge: readNumber("currentAge"),
      retirementAge: readNumber("retirementAge"),
      payoutYears: readNumber("payoutYears"),
      desiredAnnualWithdrawal: readNumber("desiredAnnualWithdrawal"),
      ratePensionBalance: readNumber("ratePensionBalance"),
      ageSavingsBalance: readNumber("ageSavingsBalance"),
      freeFundsBalance: readNumber("freeFundsBalance"),
      freeFundsCostBasis: readNumber("freeFundsCostBasis"),
      askBalance: readNumber("askBalance"),
      annualRatePensionContribution: readNumber(
        "annualRatePensionContribution",
      ),
      annualAgeSavingsContribution: readNumber("annualAgeSavingsContribution"),
      annualFreeFundsContribution: readNumber("annualFreeFundsContribution"),
      pensionTax: readNumber("pensionTax", 100),
      askTax: readNumber("askTax", 100),
      returnRate: readNumber("returnRate", 100),
      inflationRate: readNumber("inflationRate", 100),
      withdrawalAfterTax: form.elements.withdrawalAfterTax.checked,
      contributionsFollowInflation:
        form.elements.contributionsFollowInflation.checked,
      redirectPensionContributionsToFreeFunds:
        form.elements.redirectPensionContributionsToFreeFunds.checked,
    };
  }

  function setText(id, value) {
    document.querySelector(`#${id}`).textContent = value;
  }

  function renderInflationState() {
    inflationState.textContent = form.elements.contributionsFollowInflation
      .checked
      ? "Følger inflationen"
      : "Følger ikke inflationen";
  }

  function renderPensionRedirectState() {
    pensionRedirectState.textContent = form.elements
      .redirectPensionContributionsToFreeFunds.checked
      ? "Omdirigeres"
      : "Omdirigeres ikke";
  }

  function renderWithdrawalTaxState() {
    withdrawalTaxState.textContent = form.elements.withdrawalAfterTax.checked
      ? "Efter skat"
      : "Før skat";
  }

  function hideOptimizationResult() {
    latestOptimization = null;
    optimizationResult.hidden = true;
    applyOptimizationButton.disabled = true;
  }

  function fireAgeLabel(fireAge) {
    return fireAge === null ? "Ikke opnået" : `${ages.format(fireAge)} år`;
  }

  function renderOptimization(optimization) {
    latestOptimization = optimization;
    optimizationResult.hidden = false;
    optimizationResult.removeAttribute("aria-busy");

    if (optimization.status === "unachievable") {
      optimizationHeading.textContent = "Ingen fordeling kan nå FIRE";
      optimizationComparison.hidden = true;
      optimizationFireShift.hidden = true;
      applyOptimizationButton.disabled = true;
      optimizationNote.textContent =
        "Den nuværende årlige opsparing kan ikke finansiere hele planen. Prøv at øge opsparingen eller sænke den ønskede hævning.";
      return;
    }

    const { current, recommended, totalAnnualContribution, precision } =
      optimization;
    const headings = {
      improved: "Du kan nå FIRE tidligere",
      "current-optimal": "Din fordeling er allerede optimal",
      "limits-applied": "Fordelingen holder sig under 2026-lofterne",
    };
    const valueIds = [
      ["rate", "annualRatePensionContribution"],
      ["age-savings", "annualAgeSavingsContribution"],
      ["free", "annualFreeFundsContribution"],
    ];

    optimizationHeading.textContent = headings[optimization.status];
    optimizationComparison.hidden = false;
    optimizationFireShift.hidden = false;
    applyOptimizationButton.disabled =
      optimization.status === "current-optimal";
    setText("optimization-current-fire", fireAgeLabel(current.fireAge));
    setText(
      "optimization-recommended-fire",
      fireAgeLabel(recommended.fireAge),
    );

    valueIds.forEach(([id, key]) => {
      setText(`optimization-current-${id}`, currency.format(current[key]));
      setText(
        `optimization-recommended-${id}`,
        currency.format(recommended[key]),
      );
    });

    const safeTotal = Math.max(1, totalAnnualContribution);
    optimizationAllocationBar.style.setProperty(
      "--rate-share",
      `${(recommended.annualRatePensionContribution / safeTotal) * 100}%`,
    );
    optimizationAllocationBar.style.setProperty(
      "--age-share",
      `${(recommended.annualAgeSavingsContribution / safeTotal) * 100}%`,
    );
    optimizationAllocationBar.style.setProperty(
      "--free-share",
      `${(recommended.annualFreeFundsContribution / safeTotal) * 100}%`,
    );

    optimizationNote.textContent =
      optimization.status === "limits-applied"
        ? `Din nuværende fordeling overskrider et pensionsloft. Anbefalingen bevarer ${currency.format(totalAnnualContribution)} om året og bruger 2026-lofterne.`
        : `Samme årlige opsparing på ${currency.format(totalAnnualContribution)} Den samlede pensionsandel er afprøvet i trin på ${currency.format(precision)}`;
  }

  function runContributionOptimization() {
    optimizeButton.disabled = true;
    optimizeButtonLabel.textContent = "Optimerer…";
    optimizationResult.setAttribute("aria-busy", "true");

    window.setTimeout(() => {
      try {
        renderOptimization(optimizeAnnualContributions(readInputs()));
        errorBox.hidden = true;
      } catch (error) {
        hideOptimizationResult();
        errorBox.textContent = error.message;
        errorBox.hidden = false;
      } finally {
        optimizeButton.disabled = false;
        optimizeButtonLabel.textContent = "Optimér for tidligere FIRE";
        optimizationResult.removeAttribute("aria-busy");
      }
    }, 0);
  }

  function applyOptimization() {
    const recommended = latestOptimization?.recommended;

    if (!recommended) {
      return;
    }

    [
      "annualRatePensionContribution",
      "annualAgeSavingsContribution",
      "annualFreeFundsContribution",
    ].forEach((name) => {
      form.elements[name].value = inputNumber.format(
        Math.round(recommended[name]),
      );
    });

    update();
    optimizationHeading.textContent = "Fordelingen er anvendt";
    optimizationNote.textContent =
      "Planen er genberegnet med den anbefalede fordeling.";
    applyOptimizationButton.disabled = true;
  }

  function rowMarkup(row) {
    return `
      <tr data-phase="${row.phase}">
        <td>${dateFormat.format(row.date)}</td>
        <td>${ages.format(row.age)}</td>
        <td>${row.phase}</td>
        <td>${currency.format(row.ratePension)}</td>
        <td>${currency.format(row.ageSavings)}</td>
        <td>${currency.format(row.freeFunds)}</td>
        <td>${currency.format(row.ask)}</td>
        <td>${currency.format(row.totalBalance)}</td>
        <td>${row.contribution ? currency.format(row.contribution) : "—"}</td>
        <td>${row.withdrawal ? currency.format(row.withdrawal) : "—"}</td>
        <td>${row.freeFundsWithdrawal ? percent.format(row.effectiveFreeFundsWithdrawalTaxRate) : "—"}</td>
        <td>${row.withdrawalSource}</td>
      </tr>`;
  }

  function pointPath(points) {
    return points
      .map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`)
      .join(" ");
  }

  function areaPath(points, baseline) {
    if (!points.length) {
      return "";
    }

    return `${pointPath(points)} L${points[points.length - 1].x},${baseline} L${points[0].x},${baseline} Z`;
  }

  function setPhaseWidth(element, years, totalYears) {
    element.hidden = years <= 0;
    const percentage = years > 0 ? (years / totalYears) * 100 : 0;
    element.style.flex = `0 0 ${percentage}%`;
  }

  function setPhaseGroupWidth(element, years, totalYears) {
    const percentage = (years / totalYears) * 100;
    element.style.flex = `0 0 ${percentage}%`;
  }

  function renderPhases(calculation, inputs) {
    const currentAge = calculation.planRows[0].age;
    const fireAge = calculation.fireRow
      ? calculation.fireRow.age
      : inputs.retirementAge;
    const pensionStopAge = calculation.pensionStopRow
      ? Math.min(calculation.pensionStopRow.age, fireAge)
      : fireAge;
    const finalAge = calculation.finalRow.age;
    const totalYears = Math.max(1, finalAge - currentAge);
    const pensionSavingYears = Math.max(0, pensionStopAge - currentAge);
    const freeFundsOnlyYears = Math.max(0, fireAge - pensionStopAge);
    const fireYears = calculation.fireRow
      ? Math.max(0, inputs.retirementAge - fireAge)
      : 0;
    const pensionYears = Math.max(0, finalAge - inputs.retirementAge);
    const savingYears = Math.max(0, fireAge - currentAge);
    const drawdownYears = Math.max(0, finalAge - fireAge);

    setPhaseGroupWidth(
      document.querySelector("#phase-group-saving"),
      savingYears,
      totalYears,
    );
    setPhaseGroupWidth(
      document.querySelector("#phase-group-drawdown"),
      drawdownYears,
      totalYears,
    );

    const phases = [
      {
        element: document.querySelector("#phase-saving-pension"),
        years: pensionSavingYears,
      },
      {
        element: document.querySelector("#phase-saving-free"),
        years: freeFundsOnlyYears,
      },
      { element: document.querySelector("#phase-fire"), years: fireYears },
      {
        element: document.querySelector("#phase-pension"),
        years: pensionYears,
      },
    ];

    phases.forEach(({ element, years }) => {
      setPhaseWidth(element, years, totalYears);
    });

    const firstVisiblePhase = phases.find(({ years }) => years > 0)?.element;
    phases.forEach(({ element, years }) => {
      const connector = element.querySelector(".phase-connector");
      connector.hidden = years <= 0 || element === firstVisiblePhase;
    });
    setText(
      "phase-saving-pension-ages",
      `${ages.format(currentAge)} – ${ages.format(pensionStopAge)} år`,
    );
    setText(
      "phase-saving-free-ages",
      `${ages.format(pensionStopAge)} – ${ages.format(fireAge)} år`,
    );
    setText(
      "phase-fire-ages",
      `${ages.format(fireAge)} – ${inputs.retirementAge} år`,
    );
    setText(
      "phase-pension-ages",
      `${inputs.retirementAge} – ${ages.format(finalAge)} år`,
    );
  }

  function renderChart(calculation, inputs) {
    const width = 1120;
    const height = 236;
    const margin = { top: 4, right: 76, bottom: 44, left: 76 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const plotBottom = margin.top + plotHeight;
    const rows = calculation.planRows;
    const minAge = rows[0].age;
    const maxAge = rows[rows.length - 1].age;
    const fireAge = calculation.fireRow
      ? calculation.fireRow.age
      : inputs.retirementAge;
    const pensionStopAge = calculation.pensionStopRow
      ? Math.min(calculation.pensionStopRow.age, fireAge)
      : fireAge;
    const pensionValue = (row) => row.ratePension + row.ageSavings;
    const freeFundsValue = (row) => row.freeFunds + row.ask;
    const rawMax = Math.max(
      ...rows.map((row) => Math.max(pensionValue(row), freeFundsValue(row))),
      1,
    );
    const magnitude = 10 ** Math.floor(Math.log10(rawMax));
    const yMax = Math.ceil(rawMax / magnitude) * magnitude;
    const xForAge = (age) =>
      margin.left + ((age - minAge) / Math.max(1, maxAge - minAge)) * plotWidth;
    const yForValue = (value) => plotBottom - (value / yMax) * plotHeight;
    const pensionPoints = rows.map((row) => ({
      age: row.age,
      x: xForAge(row.age).toFixed(2),
      y: yForValue(pensionValue(row)).toFixed(2),
    }));
    const freeFundsPoints = rows.map((row) => ({
      age: row.age,
      x: xForAge(row.age).toFixed(2),
      y: yForValue(freeFundsValue(row)).toFixed(2),
    }));
    const yTicks = Array.from({ length: 5 }, (_, index) => (yMax / 4) * index);
    const axisRows = rows.filter(
      (row, index) => index === 0 || row.age !== rows[index - 1].age,
    );
    const phaseRects = [
      {
        className: "chart-phase-saving-pension",
        from: minAge,
        to: pensionStopAge,
      },
      {
        className: "chart-phase-saving-free",
        from: pensionStopAge,
        to: fireAge,
      },
      {
        className: "chart-phase-fire",
        from: fireAge,
        to: inputs.retirementAge,
      },
      {
        className: "chart-phase-pension",
        from: inputs.retirementAge,
        to: maxAge,
      },
    ]
      .filter((phase) => phase.to > phase.from)
      .map(
        (phase) =>
          `<rect class="${phase.className}" x="${xForAge(phase.from)}" y="${margin.top}" width="${xForAge(phase.to) - xForAge(phase.from)}" height="${plotHeight}" />`,
      )
      .join("");
    const gridLines = yTicks
      .map((value) => {
        const y = yForValue(value);
        return `<line class="chart-grid-line" x1="${margin.left}" x2="${width - margin.right}" y1="${y}" y2="${y}" />`;
      })
      .join("");
    const yAxisLabels = yTicks
      .map((value) => {
        const y = yForValue(value);
        return `<text class="chart-axis-label" x="${margin.left - 12}" y="${y + 4}" text-anchor="end">${compactNumber.format(value)} kr.</text>`;
      })
      .join("");
    const boundaries = [pensionStopAge, fireAge, inputs.retirementAge]
      .filter(
        (age, index, ages) =>
          age > minAge && age < maxAge && ages.indexOf(age) === index,
      )
      .map(
        (age) =>
          `<line class="chart-boundary" x1="${xForAge(age)}" x2="${xForAge(age)}" y1="${margin.top}" y2="${plotBottom}" />`,
      )
      .join("");
    const yearAxis = axisRows
      .map((row, index) => {
        const x = xForAge(row.age);
        const nowLabel =
          index === 0
            ? `<text class="chart-now-label" x="${x}" y="${plotBottom + 29}">nu</text>`
            : "";
        return `
          <line class="chart-year-tick" x1="${x}" x2="${x}" y1="${plotBottom}" y2="${plotBottom + 4}" />
          <text class="chart-year-label" x="${x}" y="${plotBottom + 14}">${row.age}</text>
          ${nowLabel}`;
      })
      .join("");
    chart.innerHTML = `
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="wealth-chart-title wealth-chart-description">
        <title id="wealth-chart-title">Pension og frie midler fra ${ages.format(minAge)} til ${ages.format(maxAge)} år</title>
        <desc id="wealth-chart-description">Grafen viser pension og frie midler for hvert år. Hold markøren over grafen for at se beløbene og den samlede formue.</desc>
        <defs>
          <clipPath id="chart-plot-clip">
            <rect x="${margin.left}" y="${margin.top}" width="${plotWidth}" height="${plotHeight}" rx="10" />
          </clipPath>
        </defs>
        <rect class="chart-plot-surface" x="${margin.left}" y="${margin.top}" width="${plotWidth}" height="${plotHeight}" rx="10" />
        <g clip-path="url(#chart-plot-clip)">
          ${phaseRects}
          <path class="chart-area-pension" d="${areaPath(pensionPoints, plotBottom)}" />
          <path class="chart-area-free-funds" d="${areaPath(freeFundsPoints, plotBottom)}" />
          ${gridLines}
          ${boundaries}
          <path class="chart-line-pension" d="${pointPath(pensionPoints)}" />
          <path class="chart-line-free-funds" d="${pointPath(freeFundsPoints)}" />
        </g>
        ${yAxisLabels}
        ${yearAxis}
        <rect class="chart-hover-target" x="${margin.left}" y="${margin.top}" width="${plotWidth}" height="${plotHeight}" tabindex="0" role="img" aria-label="Vis beløb for et bestemt år" />
        <g class="chart-hover-layer" style="display: none" aria-hidden="true">
          <line class="chart-hover-line" x1="0" x2="0" y1="${margin.top}" y2="${plotBottom}" />
          <circle class="chart-hover-point-pension" cx="0" cy="0" r="4" />
          <circle class="chart-hover-point-free-funds" cx="0" cy="0" r="4" />
          <g class="chart-tooltip">
            <rect class="chart-tooltip-box" width="184" height="84" rx="6" />
            <text id="chart-tooltip-title" class="chart-tooltip-title" x="10" y="17"></text>
            <text class="chart-tooltip-label" x="10" y="36">Pension</text>
            <text id="chart-tooltip-pension" class="chart-tooltip-value" x="174" y="36"></text>
            <text class="chart-tooltip-label" x="10" y="52">Frie midler</text>
            <text id="chart-tooltip-free-funds" class="chart-tooltip-value" x="174" y="52"></text>
            <line class="chart-tooltip-total-rule" x1="10" x2="174" y1="61" y2="61" />
            <text class="chart-tooltip-label" x="10" y="76">Samlet formue</text>
            <text id="chart-tooltip-total" class="chart-tooltip-value" x="174" y="76"></text>
          </g>
        </g>
      </svg>`;

    const svg = chart.querySelector("svg");
    const hoverTarget = svg.querySelector(".chart-hover-target");
    const hoverLayer = svg.querySelector(".chart-hover-layer");
    const hoverLine = svg.querySelector(".chart-hover-line");
    const hoverPensionPoint = svg.querySelector(".chart-hover-point-pension");
    const hoverFreeFundsPoint = svg.querySelector(
      ".chart-hover-point-free-funds",
    );
    const tooltip = svg.querySelector(".chart-tooltip");
    let activeIndex = 0;

    function showYear(index) {
      activeIndex = Math.max(0, Math.min(rows.length - 1, index));
      const row = rows[activeIndex];
      const pensionPoint = pensionPoints[activeIndex];
      const freeFundsPoint = freeFundsPoints[activeIndex];
      const x = Number(pensionPoint.x);
      const pensionY = Number(pensionPoint.y);
      const freeFundsY = Number(freeFundsPoint.y);
      const tooltipWidth = 184;
      const tooltipX =
        x > width - margin.right - tooltipWidth - 16
          ? x - tooltipWidth - 12
          : x + 12;
      const tooltipY = margin.top + 8;

      hoverLine.setAttribute("x1", x);
      hoverLine.setAttribute("x2", x);
      hoverPensionPoint.setAttribute("cx", x);
      hoverPensionPoint.setAttribute("cy", pensionY);
      hoverFreeFundsPoint.setAttribute("cx", x);
      hoverFreeFundsPoint.setAttribute("cy", freeFundsY);
      tooltip.setAttribute("transform", `translate(${tooltipX} ${tooltipY})`);
      svg.querySelector("#chart-tooltip-title").textContent =
        `${row.date.getFullYear()} · ${ages.format(row.age)} år`;
      svg.querySelector("#chart-tooltip-pension").textContent = currency.format(
        pensionValue(row),
      );
      svg.querySelector("#chart-tooltip-free-funds").textContent =
        currency.format(freeFundsValue(row));
      svg.querySelector("#chart-tooltip-total").textContent = currency.format(
        row.totalBalance,
      );
      hoverTarget.setAttribute(
        "aria-label",
        `${row.date.getFullYear()}, ${ages.format(row.age)} år. Pension ${currency.format(pensionValue(row))} Frie midler ${currency.format(freeFundsValue(row))} Samlet formue ${currency.format(row.totalBalance)}`,
      );
      hoverLayer.style.display = "block";
    }

    function showPointerYear(event) {
      const rect = svg.getBoundingClientRect();
      const viewBoxX = ((event.clientX - rect.left) / rect.width) * width;
      const progress = Math.max(
        0,
        Math.min(1, (viewBoxX - margin.left) / plotWidth),
      );
      const targetAge = minAge + progress * (maxAge - minAge);
      const nearestIndex = rows.reduce(
        (bestIndex, row, index) =>
          Math.abs(row.age - targetAge) <
          Math.abs(rows[bestIndex].age - targetAge)
            ? index
            : bestIndex,
        0,
      );
      showYear(nearestIndex);
    }

    hoverTarget.addEventListener("pointermove", showPointerYear);
    hoverTarget.addEventListener("pointerdown", showPointerYear);
    hoverTarget.addEventListener("pointerleave", () => {
      hoverLayer.style.display = "none";
    });
    hoverTarget.addEventListener("focus", () => showYear(activeIndex));
    hoverTarget.addEventListener("blur", () => {
      hoverLayer.style.display = "none";
    });
    hoverTarget.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
        return;
      }
      event.preventDefault();
      if (event.key === "Home") {
        showYear(0);
      } else if (event.key === "End") {
        showYear(rows.length - 1);
      } else {
        showYear(activeIndex + (event.key === "ArrowRight" ? 1 : -1));
      }
    });
  }

  function render(calculation, inputs) {
    const stop = calculation.pensionStopRow;
    const fire = calculation.fireRow;

    resultHeading.textContent = fire
      ? `FIRE fra ${ages.format(fire.age)} år`
      : "FIRE-ikke nået";
    setText(
      "result-withdrawal",
      inputs.withdrawalAfterTax
        ? `${currency.format(inputs.desiredAnnualWithdrawal)} om året efter skat på frie midler`
        : `${currency.format(inputs.desiredAnnualWithdrawal)} om året før skat`,
    );
    setText(
      "result-final-balance",
      currency.format(calculation.finalRow.totalBalance),
    );
    setText("result-final-age", ages.format(calculation.finalRow.age));
    setText(
      "result-pension-stop-age",
      stop ? `${ages.format(stop.age)} år` : "—",
    );
    setText(
      "result-pension-stop-label",
      stop ? "Stop pensionsindbetaling" : "Fortsæt pensionsindbetaling",
    );
    setText(
      "result-pension-stop-note",
      stop
        ? stop.coastFinanced
          ? "Pensionen kan vokse videre uden nye indbetalinger."
          : "Den samlede formue finansierer planen uden nye indbetalinger."
        : "Pensionsmålet er ikke nået før pensionsalderen.",
    );
    setText(
      "result-fire-milestone-age",
      fire ? `${ages.format(fire.age)} år` : "—",
    );
    setText(
      "result-fire-milestone-label",
      fire ? "Start FIRE" : "FIRE-målet er ikke nået",
    );
    setText(
      "result-fire-milestone-note",
      fire
        ? `Frie midler finansierer de næste ${years.format(fire.bridgeYears)} år.`
        : "De valgte indbetalinger finansierer ikke hele FIRE-perioden.",
    );
    setText("result-retirement-age", `${inputs.retirementAge} år`);
    setText(
      "result-retirement-note",
      calculation.isFullyFunded
        ? `Pension og eventuelle frie midler finansierer perioden frem til ${ages.format(calculation.finalRow.age)} år.`
        : calculation.firstShortfallDate
          ? `Formuen dækker ikke den ønskede hævning fra ${dateFormat.format(calculation.firstShortfallDate)}.`
          : "Formuen dækker ikke den ønskede hævning gennem hele perioden.",
    );

    renderPhases(calculation, inputs);
    renderChart(calculation, inputs);

    setText("current-age", `${calculation.currentAge} år`);
    setText(
      "real-pension-return",
      percent.format(calculation.realPensionReturn),
    );
    setText("real-ask-return", percent.format(calculation.realAskReturn));
    setText(
      "real-free-return",
      percent.format(calculation.realFreeFundsReturn),
    );
    setText(
      "total-free-funds-tax",
      currency.format(calculation.totalFreeFundsTax),
    );
    setText(
      "effective-free-funds-tax-rate",
      percent.format(calculation.effectiveFreeFundsWithdrawalTaxRate),
    );
    setText(
      "required-at-retirement",
      currency.format(calculation.requiredAtRetirement),
    );
    setText(
      "pension-target-today",
      currency.format(calculation.pensionTargetToday),
    );
    setText(
      "pension-stop-age",
      stop ? `${ages.format(stop.age)} år` : "Ikke nået",
    );
    setText("pension-stop-date", stop ? dateFormat.format(stop.date) : "—");
    setText(
      "pension-at-stop",
      stop ? currency.format(stop.ratePension + stop.ageSavings) : "—",
    );
    setText(
      "pension-target-at-stop",
      stop ? currency.format(calculation.pensionTargetAtStop) : "—",
    );
    setText(
      "fire-age",
      fire ? `${ages.format(fire.age)} år` : "Ikke nået før pension",
    );
    setText("fire-date", fire ? dateFormat.format(fire.date) : "—");
    setText(
      "bridge-years",
      fire ? `${years.format(fire.bridgeYears)} år` : "—",
    );
    setText("free-at-fire", fire ? currency.format(fire.freeFunds) : "—");
    setText("ask-at-fire", fire ? currency.format(fire.ask) : "—");
    setText(
      "bridge-withdrawal",
      fire ? currency.format(fire.possibleBridgeWithdrawal) : "—",
    );
    setText("final-date", dateFormat.format(calculation.finalRow.date));
    setText(
      "final-balance",
      currency.format(calculation.finalRow.totalBalance),
    );
    setText(
      "final-pension",
      currency.format(
        calculation.finalRow.ratePension + calculation.finalRow.ageSavings,
      ),
    );
    setText(
      "final-free-funds",
      currency.format(
        calculation.finalRow.freeFunds + calculation.finalRow.ask,
      ),
    );

    tableBody.innerHTML = calculation.planRows.map(rowMarkup).join("");
    errorBox.hidden = true;
    results.hidden = false;
  }

  function update(event) {
    if (event) {
      event.preventDefault();
    }

    try {
      const inputs = readInputs();
      render(calculateFire(inputs), inputs);
    } catch (error) {
      errorBox.textContent = error.message;
      errorBox.hidden = false;
      results.hidden = true;
    }
  }

  form.addEventListener("submit", update);
  form.addEventListener("input", (event) => {
    hideOptimizationResult();
    if (event.target.matches("[data-number-format='integer']")) {
      formatNumberInput(event.target, true);
    }
    if (event.target === form.elements.contributionsFollowInflation) {
      renderInflationState();
    }
    if (
      event.target ===
      form.elements.redirectPensionContributionsToFreeFunds
    ) {
      renderPensionRedirectState();
    }
    if (event.target === form.elements.withdrawalAfterTax) {
      renderWithdrawalTaxState();
    }
    update(event);
  });
  optimizeButton.addEventListener("click", runContributionOptimization);
  applyOptimizationButton.addEventListener("click", applyOptimization);

  formattedNumberInputs.forEach((input) => {
    formatNumberInput(input);
    addNumberSteppers(input);
  });
  nativeNumberInputs.forEach((input) => addNumberSteppers(input));
  renderInflationState();
  renderPensionRedirectState();
  renderWithdrawalTaxState();

  update();
})();
