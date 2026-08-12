const { useMemo, useState } = React;
const {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceDot,
  ComposedChart,
  Line,
} = Recharts;

const { LOAN_TYPES, INV_LABELS, TAX_MODEL } = window.RealkreditData;
const {
  fmt,
  fmtPct,
  fmtPct1,
  fmtPct2,
  buildChartData,
  buildMilestoneData,
  getMaxBarValue,
  buildInvestmentData,
  buildEcbMsciChartData,
  breakdown,
  getLoanBandForLtv,
  isInterestOnlyEligible,
} = window.RealkreditCalculations;

function roundDownToStep(value, step) {
  return Math.floor(value / step) * step;
}

const HOME_PRICE_STEP = 100000;
const LOAN_AMOUNT_STEP = 100000;

const C = {
  card: "var(--color-surface)",
  card2: "var(--color-canvas)",
  card3: "var(--color-control)",
  text: "var(--color-text)",
  text2: "var(--color-text-secondary)",
  text3: "var(--color-text-tertiary)",
  text4: "var(--color-text-quaternary)",
  sep: "var(--color-separator)",
  blue: "var(--color-blue)",
  green: "var(--color-green)",
  red: "var(--color-red)",
  orange: "var(--color-orange)",
  purple: "var(--color-purple)",
};

function rangeStyle(value, min, max, color) {
  const progress = max <= min ? 0 : ((value - min) / (max - min)) * 100;
  return { "--range-progress": `${progress}%`, "--range-accent": color };
}

function RangeControl({
  label,
  value,
  valueLabel,
  min,
  max,
  step,
  minLabel,
  maxLabel,
  accent,
  onChange,
}) {
  return (
    <div className="range-control" style={rangeStyle(value, min, max, accent)}>
      <div className="range-control__header">
        <span className="range-control__label">{label}</span>
        <span className="range-control__value mono">{valueLabel}</span>
      </div>
      <input
        className="range-control__input"
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(+event.target.value)}
      />
      <div className="range-control__bounds">
        <span>{minLabel}</span>
        <span>{maxLabel}</span>
      </div>
    </div>
  );
}

function ChartLegend({ items, hiddenKeys, onToggle, className = "" }) {
  return (
    <div className={`chart-legend ${className}`.trim()}>
      {items.map(({ key, color, label, opacity = 1 }) => {
        const hidden = hiddenKeys.has(key);
        return (
          <button
            key={key}
            type="button"
            className={`chart-legend__item ${hidden ? "is-hidden" : ""}`}
            aria-pressed={!hidden}
            style={{ "--legend-color": color, "--legend-opacity": opacity }}
            onClick={() => onToggle(key)}
          >
            <span className="chart-legend__marker" />
            {label}
          </button>
        );
      })}
    </div>
  );
}

function SectionHeader({ title, description, meta, controls, className = "" }) {
  return (
    <div className={`section-header ${className}`.trim()}>
      <div className="section-header__copy">
        <h2 className="section-title">{title}</h2>
        {description && <p className="section-description">{description}</p>}
        {meta && <p className="section-meta">{meta}</p>}
      </div>
      {controls && <div className="section-header__controls">{controls}</div>}
    </div>
  );
}

function DataRow({ label, value, variant = "default", tone, className = "" }) {
  return (
    <div
      className={`data-row data-row--${variant} ${className}`.trim()}
      style={tone ? { "--data-tone": tone } : undefined}
    >
      <span className="data-row__label">{label}</span>
      <span className="data-row__value mono">{value}</span>
    </div>
  );
}

function SummaryCard({ title, tone, children }) {
  return (
    <div className="summary-card" style={{ "--data-tone": tone }}>
      <div className="summary-card__title">
        <span className="summary-card__marker" />
        {title}
      </div>
      <div className="summary-card__rows">{children}</div>
    </div>
  );
}

function AmountInput({ id, label, value, step, max, onChange }) {
  const updateValue = (nextValue) => {
    const upperBound = Number.isFinite(max) ? max : Number.POSITIVE_INFINITY;
    onChange(Math.min(upperBound, Math.max(0, Math.round(nextValue))));
  };

  const changeByStep = (direction) => updateValue(value + direction * step);
  const atMinimum = value <= 0;
  const atMaximum = Number.isFinite(max) && value >= max;

  return (
    <div className="amount-field">
      <label htmlFor={id}>{label}</label>
      <div className="amount-input">
        <input
          id={id}
          type="text"
          inputMode="numeric"
          className="mono"
          value={fmt(value)}
          aria-label={`${label} i kroner`}
          onChange={(event) => {
            const digits = event.target.value.replace(/\D/g, "");
            updateValue(digits ? Number(digits) : 0);
          }}
          onKeyDown={(event) => {
            if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
            event.preventDefault();
            changeByStep(event.key === "ArrowUp" ? 1 : -1);
          }}
        />
        <span className="amount-unit">kr.</span>
        <span className="amount-stepper">
          <button
            type="button"
            tabIndex={-1}
            disabled={atMaximum}
            aria-label={`Forøg ${label.toLowerCase()} med ${fmt(step)} kr.`}
            title={`Forøg med ${fmt(step)} kr.`}
            onClick={() => changeByStep(1)}
          >
            <svg viewBox="0 0 9 5" aria-hidden="true">
              <path d="M1 4 4.5 1 8 4" />
            </svg>
          </button>
          <button
            type="button"
            tabIndex={-1}
            disabled={atMinimum}
            aria-label={`Sænk ${label.toLowerCase()} med ${fmt(step)} kr.`}
            title={`Sænk med ${fmt(step)} kr.`}
            onClick={() => changeByStep(-1)}
          >
            <svg viewBox="0 0 9 5" aria-hidden="true">
              <path d="M1 1 4.5 4 8 1" />
            </svg>
          </button>
        </span>
      </div>
    </div>
  );
}

function TooltipShell({ title, children }) {
  return (
    <div className="chart-tooltip inset-panel">
      <div className="chart-tooltip__title">{title}</div>
      {children}
    </div>
  );
}

function ValueTooltipRow({ color, label, value, suffix = " kr." }) {
  return (
    <div className="chart-tooltip__row">
      <span className="chart-tooltip__label" style={{ "--tooltip-color": color }}>{label}</span>
      <span className="chart-tooltip__value mono">
        {value}
        {suffix}
      </span>
    </div>
  );
}

function CTip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <TooltipShell title={`${label}% belåning`}>
      {payload.map((entry) => {
        const loanTypeId = entry.dataKey.replace(/_.*/, "");
        const loanType = LOAN_TYPES.find((item) => item.id === loanTypeId);
        return (
          <ValueTooltipRow
            key={entry.dataKey}
            color={loanType?.color}
            label={loanType?.label}
            value={fmt(entry.value)}
          />
        );
      })}
      {label > 60 && (
        <div className="chart-tooltip__note">Inkl. afdrag</div>
      )}
    </TooltipShell>
  );
}

function InvTip({ active, payload, label, showNet }) {
  if (!active || !payload?.length) return null;
  const modeLabels = {
    afkast: showNet ? "Afkast (efter lagerbeskatning)" : "Afkast (før skat)",
    result: "Netto",
  };
  return (
    <TooltipShell title={`År ${label}`}>
      {payload.map((entry) => {
        const info = INV_LABELS[entry.dataKey] || {};
        return (
          <ValueTooltipRow
            key={entry.dataKey}
            color={info.color || entry.color}
            label={modeLabels[entry.dataKey] || info.label || entry.dataKey}
            value={fmt(entry.value)}
          />
        );
      })}
    </TooltipShell>
  );
}

function CostBar({ breakdown, maxVal, showNet }) {
  const rente = showNet ? breakdown.renteKrN : breakdown.renteKrB;
  const bidrag = showNet ? breakdown.bidragKrN : breakdown.bidragKrB;
  const afdrag = breakdown.afdragKr;
  const scale = maxVal * 1.08;
  return (
    <div className="cost-bar">
      <div className="cost-bar__segment cost-bar__segment--interest" style={{ "--bar-width": `${(rente / scale) * 100}%` }} />
      <div className="cost-bar__segment cost-bar__segment--contribution" style={{ "--bar-width": `${(bidrag / scale) * 100}%` }} />
      {afdrag > 0 && (
        <div className="cost-bar__segment cost-bar__segment--principal" style={{ "--bar-width": `${(afdrag / scale) * 100}%` }} />
      )}
    </div>
  );
}

function EcbMsciTip({ active, payload, label, avgLabel }) {
  if (!active || !payload?.length) return null;
  const colors = { ecb: C.blue, msci: C.green, avg: C.orange };
  const names = { ecb: "ECB MRO-rente", msci: "MSCI World (kv.)", avg: avgLabel };
  return (
    <TooltipShell title={label}>
      {payload
        .filter((entry) => entry.value != null)
        .map((entry) => (
          <ValueTooltipRow
            key={entry.dataKey}
            color={colors[entry.dataKey] || entry.color}
            label={names[entry.dataKey] || entry.name || entry.dataKey}
            value={entry.value.toFixed(1)}
            suffix="%"
          />
        ))}
    </TooltipShell>
  );
}

function EcbMsciChart() {
  const [startYear, setStartYear] = useState(1999);
  const [rollYears, setRollYears] = useState(5);
  const [hiddenEcbKeys, setHiddenEcbKeys] = useState(() => new Set());
  const chartData = useMemo(
    () => buildEcbMsciChartData(startYear, rollYears),
    [startYear, rollYears],
  );
  const endLabel = chartData[chartData.length - 1]?.label || "";
  const avgLabel = `${rollYears}-års annualiseret`;
  const toggleEcbKey = (key) => {
    setHiddenEcbKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="card">
      <SectionHeader
        title="ECB-rente vs. MSCI World"
        description="Kvartalsafkast med rullende annualiseret afkast"
      />

      <div className="range-grid">
        <RangeControl
          label="Fra år"
          value={startYear}
          valueLabel={startYear}
          min={1999}
          max={2020}
          step={1}
          minLabel="1999"
          maxLabel="2020"
          accent={C.blue}
          onChange={setStartYear}
        />
        <RangeControl
          label="Rullende annualiseret"
          value={rollYears}
          valueLabel={`${rollYears} år`}
          min={1}
          max={15}
          step={1}
          minLabel="1 år"
          maxLabel="15 år"
          accent={C.blue}
          onChange={setRollYears}
        />
      </div>

      <div className="chart-context">
        {startYear}–{endLabel} · Rullende annualiseret afkast:{" "}
        <strong className="data-highlight" style={{ "--data-tone": C.orange }}>
          {rollYears} år
        </strong>
      </div>

      <div className="chart-frame chart-frame--large">
        <ResponsiveContainer>
          <ComposedChart data={chartData} margin={{ top: 10, right: 8, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="gEcb" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={C.blue} stopOpacity={0.15} />
                <stop offset="100%" stopColor={C.blue} stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="gAvg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={C.orange} stopOpacity={0.15} />
                <stop offset="100%" stopColor={C.orange} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(60,60,67,0.08)" />
            <XAxis
              dataKey="label"
              tick={{ fill: C.text4, fontSize: 10 }}
              axisLine={{ stroke: "rgba(60,60,67,0.08)" }}
              interval="preserveStartEnd"
              tickFormatter={(v) => (v && v.endsWith("Q1") ? v.replace(" Q1", "") : "")}
              minTickGap={30}
            />
            <YAxis
              tick={{ fill: C.text4, fontSize: 10 }}
              axisLine={{ stroke: "rgba(60,60,67,0.08)" }}
              tickFormatter={(v) => `${v}%`}
              width={45}
            />
            <Tooltip content={<EcbMsciTip avgLabel={avgLabel} />} />
            <ReferenceLine y={0} stroke={C.text4} strokeWidth={1} />
            {!hiddenEcbKeys.has("msci") && (
              <Line type="monotone" dataKey="msci" stroke={C.green} strokeWidth={2} dot={false} name="MSCI World (kv.)" />
            )}
            {!hiddenEcbKeys.has("avg") && (
              <Area type="monotone" dataKey="avg" stroke={C.orange} fill="url(#gAvg)" strokeWidth={2} dot={false} name={avgLabel} />
            )}
            {!hiddenEcbKeys.has("ecb") && (
              <Area type="stepAfter" dataKey="ecb" stroke={C.blue} fill="url(#gEcb)" strokeWidth={2.5} dot={false} name="ECB MRO-rente" />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <ChartLegend
        className="chart-legend--top-spaced"
        hiddenKeys={hiddenEcbKeys}
        onToggle={toggleEcbKey}
        items={[
          { key: "ecb", color: C.blue, label: "ECB MRO-rente" },
          { key: "msci", color: C.green, label: "MSCI World (kv.)" },
          { key: "avg", color: C.orange, label: avgLabel },
        ]}
      />
      <p className="chart-source">
        ECB Main Refinancing Rate · MSCI World gross total return USD
      </p>
    </div>
  );
}

function MilestoneCard({ milestone, showNet, maxBarVal }) {
  const [isOpen, setIsOpen] = useState(false);
  const gridColumns = `72px repeat(${milestone.rows.length}, 1fr)`;
  const contentId = `milestone-${milestone.ltv}-content`;

  const renderMetricRow = (label, renderValue, modifier = "") => (
    <div
      className={`milestone-row ${modifier}`.trim()}
      style={{ "--milestone-columns": gridColumns }}
    >
      <div className="milestone-row__label">{label}</div>
      {milestone.rows.map(({ loanType, breakdown }) => (
        <div key={loanType.id} className="milestone-row__value mono">
          {renderValue(breakdown, loanType)}
        </div>
      ))}
    </div>
  );

  return (
    <div className="milestone-card inset-panel" style={{ "--milestone-color": milestone.tc }}>
      <button
        className="milestone-toggle"
        type="button"
        aria-expanded={isOpen}
        aria-controls={contentId}
        onClick={() => setIsOpen((open) => !open)}
      >
        <div className="milestone-toggle__layout">
          <div className="milestone-toggle__copy">
            <div className="milestone-toggle__title">
              <span className="milestone-toggle__ltv mono">
                {milestone.ltv}%
              </span>
              <span className="status-tag">
                {milestone.tag}
              </span>
            </div>
            <div className="milestone-toggle__description">{milestone.desc}</div>
          </div>
          <span
            className={`milestone-toggle__chevron ${isOpen ? "is-open" : ""}`}
          >
            <svg width="14" height="8" viewBox="0 0 14 8" fill="none">
              <path d="M1 1.5L7 6.5L13 1.5" stroke={C.text3} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>
        </div>
      </button>

      {isOpen && (
        <div id={contentId} className="milestone-content">
          <div className="milestone-scroll">
            <div className="milestone-grid">
              <div className="milestone-row" style={{ "--milestone-columns": gridColumns }}>
                <div />
                {milestone.rows.map(({ loanType }) => (
                  <div
                    key={loanType.id}
                    className="milestone-row__heading"
                    style={{ "--loan-color": loanType.color }}
                  >
                    {loanType.label}
                  </div>
                ))}
              </div>

              {renderMetricRow("Rente", (result) => (
                <span className="text-interest">{fmtPct2(result.rentePct)}</span>
              ))}
              {renderMetricRow("Bidrag", (result) => (
                <span className="text-contribution">{fmtPct(result.bidragPct)}</span>
              ))}
              {renderMetricRow(
                "Samlet sats",
                (result) => <strong>{fmtPct2(result.rentePct + result.bidragPct)}</strong>,
                "milestone-row--divider",
              )}

              <div className="separator" />

              {renderMetricRow("Rente kr./år", (result) => (
                <span className="text-interest">
                  {fmt(Math.round(showNet ? result.renteKrN : result.renteKrB))}
                </span>
              ))}
              {renderMetricRow("Bidrag kr./år", (result) => (
                <span className="text-contribution">
                  {fmt(Math.round(showNet ? result.bidragKrN : result.bidragKrB))}
                </span>
              ))}
              {!milestone.af &&
                renderMetricRow("Afdrag kr./år", (result) => (
                  <span className="text-tertiary">{fmt(Math.round(result.afdragKr))}</span>
                ))}

              <div className="cost-breakdown">
                <div className="cost-breakdown__legend">
                  <span className="cost-breakdown__key">
                    <span className="cost-breakdown__swatch cost-breakdown__swatch--interest" />
                    Rente
                  </span>
                  <span className="cost-breakdown__key">
                    <span className="cost-breakdown__swatch cost-breakdown__swatch--contribution" />
                    Bidrag
                  </span>
                  {!milestone.af && (
                    <span className="cost-breakdown__key">
                      <span className="cost-breakdown__swatch cost-breakdown__swatch--principal" />
                      Afdrag
                    </span>
                  )}
                </div>
                {milestone.rows.map(({ loanType, breakdown }) => (
                  <div key={loanType.id} className="cost-breakdown__bar">
                    <CostBar breakdown={breakdown} maxVal={maxBarVal} showNet={showNet} />
                  </div>
                ))}
              </div>

              <div className="separator" />

              {renderMetricRow(
                "Ydelse/år",
                (result) => <strong>{fmt(Math.round(showNet ? result.ydelseN : result.ydelseB))}</strong>,
              )}
              {!milestone.af &&
                renderMetricRow("+ Afdrag", (result) => (
                  <strong className="text-secondary">{fmt(Math.round(result.afdragKr))}</strong>
                ))}
              {milestone.af &&
                renderMetricRow("Likviditet/md.", (result) => (
                  <span className="text-blue">+{fmt(result.likviditetMd)}</span>
                ),
                "milestone-row--spaced",
                )}
              {renderMetricRow(
                "Mdl. total",
                (result) => (
                  <span className="milestone-total">
                    {fmt(Math.round((showNet ? result.totalN : result.totalB) / 12))}
                  </span>
                ),
                "milestone-row--total",
              )}
            </div>
          </div>

          {!milestone.af && (
            <div className="milestone-note">
              Afdrag er opsparing i boligen — du får pengene igen ved salg/omlægning
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function App() {
  const [loanAmount, setLoanAmount] = useState(3000000);
  const [homePrice, setHomePrice] = useState(5000000);
  const [selectedTypes, setSelectedTypes] = useState(() =>
    LOAN_TYPES.map((loanType) => loanType.id),
  );
  const [showNet, setShowNet] = useState(false);
  const [chartMode, setChartMode] = useState("total");
  const [investReturn, setInvestReturn] = useState(7);
  const [investYears, setInvestYears] = useState(15);
  const [investOwners, setInvestOwners] = useState(1);
  const [taxHousehold, setTaxHousehold] = useState("single");
  const [hiddenCostKeys, setHiddenCostKeys] = useState(() => new Set());
  const [hiddenInvKeys, setHiddenInvKeys] = useState(() => new Set());

  const activeLoanTypes = LOAN_TYPES.filter((loanType) => selectedTypes.includes(loanType.id));
  const activeTypeKey = activeLoanTypes.map((loanType) => loanType.id).join(",");
  const maxLoanAmount = roundDownToStep(homePrice * 0.8, LOAN_AMOUNT_STEP);
  const taxHouseholdLabel =
    TAX_MODEL.households.find((household) => household.id === taxHousehold)?.label || "Enlig";
  const taxThreshold = TAX_MODEL.thresholds[taxHousehold] || TAX_MODEL.thresholds.single;
  const cycleTaxHousehold = () => {
    setTaxHousehold((current) => (current === "single" ? "couple" : "single"));
  };
  const updateHomePrice = (nextHomePrice) => {
    const nextMaxLoanAmount = roundDownToStep(nextHomePrice * 0.8, LOAN_AMOUNT_STEP);
    setHomePrice(nextHomePrice);
    setLoanAmount((current) => Math.min(current, nextMaxLoanAmount));
  };
  const toggleLoanType = (loanTypeId) => {
    setSelectedTypes((current) => {
      const isSelected = current.includes(loanTypeId);
      if (isSelected) {
        return current.filter((id) => id !== loanTypeId);
      }
      return [...current, loanTypeId];
    });
  };
  const toggleHidden = (setter) => (key) => {
    setter((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const toggleCostKey = toggleHidden(setHiddenCostKeys);
  const toggleInvKey = toggleHidden(setHiddenInvKeys);

  const chartData = useMemo(
    () => buildChartData(loanAmount, taxHousehold),
    [loanAmount, taxHousehold],
  );
  const milestoneData = useMemo(
    () => buildMilestoneData(activeLoanTypes, loanAmount, taxHousehold),
    [activeTypeKey, loanAmount, taxHousehold],
  );
  const maxBarVal = useMemo(
    () => getMaxBarValue(milestoneData, showNet),
    [milestoneData, showNet],
  );
  const cSuffix =
    chartMode === "total" ? (showNet ? "_netto" : "_brutto") : showNet ? "_yn" : "_yb";

  const hasValidInputs = homePrice > 0 && loanAmount >= 0;
  const currentLtv = hasValidInputs ? (loanAmount / homePrice) * 100 : null;
  const currentBand = getLoanBandForLtv(currentLtv ?? 0);
  const investmentAvailable =
    currentLtv !== null && isInterestOnlyEligible(currentLtv);

  const investData = useMemo(
    () => {
      if (!investmentAvailable) return {};

      return buildInvestmentData(
        activeLoanTypes,
        loanAmount,
        investReturn,
        investYears,
        taxHousehold,
        investOwners,
        currentLtv,
        showNet,
      );
    },
    [activeTypeKey, loanAmount, investReturn, investYears, taxHousehold, investOwners, currentLtv, showNet, investmentAvailable],
  );

  const investChartType = activeLoanTypes[0]?.id;
  const investChartData = investData[investChartType] || [];
  const selectedCaseData = activeLoanTypes.map((loanType) => ({
    loanType,
    breakdown: breakdown(
      loanType.id,
      loanType.rate,
      currentLtv ?? 0,
      currentBand.af,
      loanAmount,
      taxHousehold,
    ),
  }));
  const selectedCaseByType = Object.fromEntries(
    selectedCaseData.map(({ loanType, breakdown: result }) => [loanType.id, result]),
  );
  const selectedEquity = Math.max(0, homePrice - loanAmount);

  return (
    <main className="app-shell">
      <div className="app-container">
        <header className="hero">
          <div className="hero__eyebrow">Realkreditberegner</div>
          <h1 className="hero__title">Se hvad dit lån koster</h1>
          <p className="hero__lead">
            Sammenlign renter, bidrag og skatteværdi på tværs af belåningsgrader — og se om
            afdragsfrihed med investering kan betale sig mod historisk aktieafkast.
          </p>
        </header>

        <section className="card card--rule">
          <h2 className="rule-title">60/4-reglen</h2>
          <p className="body-copy body-copy--spacious">
            Hvis belåningsgraden er over <strong>60%</strong>{" "}
            <em>og</em> den samlede gæld er mere end{" "}
            <strong>4 gange husstandens bruttoindkomst</strong>,
            kan du ikke vælge et "risikabelt lån" (variabel rente uden renteloft eller
            afdragsfrihed).
          </p>
          <p className="supporting-copy supporting-copy--spaced">
            Begge betingelser skal være opfyldt. Har du lav gældsfaktor ({`<`} 4× indkomst)
            kan du godt vælge flekslån over 60% — men afdragsfrihed kræver stadig belåning
            under 60%.
          </p>
        </section>

        <section className="card">
          <div className="loan-toolbar">
            <div className="loan-selector">
              <span className="loan-selector__label">Vælg lån:</span>
              {LOAN_TYPES.map((loanType) => (
                <button
                  key={loanType.id}
                  type="button"
                  title={loanType.label}
                  className={`chip loan-chip ${selectedTypes.includes(loanType.id) ? "active" : ""}`}
                  aria-pressed={selectedTypes.includes(loanType.id)}
                  style={{ "--loan-color": loanType.color }}
                  onClick={() => toggleLoanType(loanType.id)}
                >
                  <span className="loan-chip__dot" />
                  {loanType.label}
                </button>
              ))}
            </div>
            <div className="loan-toolbar-actions">
              <div className={`tax-household ${showNet ? "is-visible" : ""}`}>
                <button
                  className="toggle-button toggle-button--active tax-household__button"
                  onClick={cycleTaxHousehold}
                >
                  {taxHouseholdLabel}
                </button>
              </div>
              <div className="segmented-control">
                <button className={showNet ? "on" : ""} onClick={() => setShowNet(true)}>
                  Netto
                </button>
                <button className={!showNet ? "on" : ""} onClick={() => setShowNet(false)}>
                  Brutto
                </button>
              </div>
            </div>
          </div>

          <div className="amount-grid">
            <AmountInput
              id="home-price"
              label="Boligpris"
              value={homePrice}
              step={HOME_PRICE_STEP}
              onChange={updateHomePrice}
            />

            <AmountInput
              id="loan-amount"
              label="Restgæld"
              value={loanAmount}
              step={LOAN_AMOUNT_STEP}
              max={maxLoanAmount}
              onChange={setLoanAmount}
            />
          </div>
        </section>

        <section className="card">
          <SectionHeader
            title="Årlig omkostning"
            meta={`${showNet ? `Netto efter skat · ${taxHouseholdLabel}` : "Brutto"} · Belåning høj → lav`}
            controls={(
              <div className="segmented-control">
              <button className={chartMode === "total" ? "on" : ""} onClick={() => setChartMode("total")}>
                Inkl. afdrag
              </button>
              <button className={chartMode === "ydelse" ? "on" : ""} onClick={() => setChartMode("ydelse")}>
                Kun rente+bidrag
              </button>
              </div>
            )}
          />

          <div className="chart-frame">
            <ResponsiveContainer>
              <AreaChart data={chartData} margin={{ top: 10, right: 8, left: -10, bottom: 0 }}>
                <defs>
                  {LOAN_TYPES.map((loanType) => (
                    <linearGradient key={loanType.id} id={`g-${loanType.id}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={loanType.color} stopOpacity={0.15} />
                      <stop offset="100%" stopColor={loanType.color} stopOpacity={0.02} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(60,60,67,0.08)" />
                <XAxis
                  dataKey="ltv"
                  type="number"
                  domain={[10, 80]}
                  ticks={[10, 20, 30, 40, 50, 60, 70, 80]}
                  tickFormatter={(value) => `${value}%`}
                  tick={{ fill: C.text4, fontSize: 10 }}
                  axisLine={{ stroke: "rgba(60,60,67,0.08)" }}
                  reversed
                />
                <YAxis
                  tickFormatter={(value) => `${Math.round(value / 1000)}k`}
                  tick={{ fill: C.text4, fontSize: 10 }}
                  axisLine={{ stroke: "rgba(60,60,67,0.08)" }}
                  width={45}
                />
                <Tooltip content={<CTip />} />
                <ReferenceLine x={80} stroke={C.red} strokeDasharray="4 4" strokeWidth={1} />
                <ReferenceLine x={60} stroke={C.blue} strokeDasharray="4 4" strokeWidth={1} />
                <ReferenceLine x={40} stroke={C.green} strokeDasharray="4 4" strokeWidth={1} />
                {currentLtv !== null && currentLtv <= 80 && (
                  <ReferenceLine x={currentLtv} stroke={C.orange} strokeDasharray="6 3" strokeWidth={1.5} />
                )}
                {activeLoanTypes.map((loanType) => (
                  <React.Fragment key={loanType.id}>
                    {!hiddenCostKeys.has(loanType.id) && (
                      <Area
                        type="linear"
                        dataKey={`${loanType.id}${cSuffix}`}
                        stroke={loanType.color}
                        fill={`url(#g-${loanType.id})`}
                        strokeWidth={2}
                        dot={false}
                        activeDot={{
                          r: 4,
                          stroke: loanType.color,
                          fill: C.card,
                          strokeWidth: 2,
                        }}
                      />
                    )}
                    {!hiddenCostKeys.has(loanType.id) && currentLtv !== null && currentLtv <= 80 && (
                      <ReferenceDot
                        x={currentLtv}
                        y={
                          chartMode === "total"
                            ? showNet
                              ? selectedCaseByType[loanType.id]?.totalN
                              : selectedCaseByType[loanType.id]?.totalB
                            : showNet
                              ? selectedCaseByType[loanType.id]?.ydelseN
                              : selectedCaseByType[loanType.id]?.ydelseB
                        }
                        r={4.5}
                        fill={C.card}
                        stroke={loanType.color}
                        strokeWidth={2}
                      />
                    )}
                  </React.Fragment>
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <ChartLegend
            className="chart-legend--cost"
            hiddenKeys={hiddenCostKeys}
            onToggle={toggleCostKey}
            items={activeLoanTypes.map((loanType) => ({
              key: loanType.id,
              color: loanType.color,
              label: `${loanType.label} (${loanType.rateLabel})`,
            }))}
          />

          <div className="loan-snapshot inset-panel">
            <div className="loan-snapshot__header">
              <div>
                <div className="loan-snapshot__label">belåning</div>
                <div className="loan-snapshot__ltv mono">
                  {currentLtv === null ? "—" : fmtPct2(currentLtv)}
                </div>
              </div>
              <div className="loan-snapshot__facts">
                <span>
                  Boligpris: <strong className="mono">{fmt(homePrice)}</strong>
                </span>
                <span>
                  Egenkapital: <strong className="mono">{fmt(selectedEquity)}</strong>
                </span>
                <span className={`loan-snapshot__status ${currentBand.af ? "is-positive" : "is-negative"}`}>
                  {currentBand.af ? "Afdragsfri mulig" : "Tvunget afdrag"}
                </span>
              </div>
            </div>
            <div className="summary-grid">
              {selectedCaseData.map(({ loanType, breakdown: result }) => (
                <SummaryCard
                  key={loanType.id}
                  title={loanType.label}
                  tone={loanType.color}
                >
                  <DataRow
                    label="Rente + bidrag"
                    value={fmt(Math.round(showNet ? result.ydelseN : result.ydelseB))}
                    variant="compact"
                  />
                  <DataRow label="Afdrag" value={fmt(Math.round(result.afdragKr))} variant="compact" />
                  <DataRow
                    label="Samlet pr. år"
                    value={fmt(Math.round(showNet ? result.totalN : result.totalB))}
                    variant="compact"
                  />
                  <DataRow
                    label="Pr. måned"
                    value={fmt(Math.round((showNet ? result.totalN : result.totalB) / 12))}
                    variant="total"
                    tone={loanType.color}
                  />
                    {result.likviditetMd > 0 && (
                      <DataRow
                        label="Likviditet/md."
                        value={`+${fmt(result.likviditetMd)}`}
                        variant="compact"
                        tone={C.blue}
                      />
                    )}
                </SummaryCard>
              ))}
            </div>
          </div>

          <div className="loan-bands">
            <div className="loan-band loan-band--high">
              <div className="loan-band__range">60–80%</div>
              <div className="loan-band__label">Tvunget afdrag</div>
            </div>
            <div className="loan-band loan-band--mid">
              <div className="loan-band__range">40–60%</div>
              <div className="loan-band__label">Afdragsfri mulig</div>
            </div>
            <div className="loan-band loan-band--low">
              <div className="loan-band__range">Under 40%</div>
              <div className="loan-band__label">Laveste bidrag</div>
            </div>
          </div>
        </section>

        <section className="card">
          <SectionHeader
            title="Milepæle"
            description="Udvid hver belåningsgrad for at se rente, bidrag og månedlig ydelse opdelt på lånertype."
          />
          {milestoneData.map((milestone) => (
            <MilestoneCard
              key={milestone.ltv}
              milestone={milestone}
              showNet={showNet}
              maxBarVal={maxBarVal}
            />
          ))}
        </section>

        <section className="card">
          <div className="section-content">
            <SectionHeader
              title="Investér vs. afdrag"
              controls={investmentAvailable ? (
                <div className="investment-controls">
                {showNet && (
                  <>
                    {investOwners > 1 && (
                      <button
                        className="toggle-button toggle-button--active owner-count"
                        onClick={() => setInvestOwners((v) => (v >= 5 ? 2 : v + 1))}
                      >
                        {investOwners}
                      </button>
                    )}
                    <div className="segmented-control">
                      <button className={investOwners === 1 ? "on" : ""} onClick={() => setInvestOwners(1)}>
                        Enkelt
                      </button>
                      <button
                        className={investOwners > 1 ? "on" : ""}
                        onClick={() => setInvestOwners((v) => (v === 1 ? 2 : v))}
                      >
                        Flere
                      </button>
                    </div>
                  </>
                )}
                <div className="segmented-control">
                  <button className={showNet ? "on" : ""} onClick={() => setShowNet(true)}>
                    Netto
                  </button>
                  <button className={!showNet ? "on" : ""} onClick={() => setShowNet(false)}>
                    Brutto
                  </button>
                </div>
                </div>
              ) : null}
            />
            {investmentAvailable ? (
              <>
                <p className="body-copy">
                  Udgangspunkt: {fmtPct2(currentLtv)} belåning med {fmt(loanAmount)} kr. lån. Pengene er de samme i begge scenarier — enten som egenkapital
                  i boligen (afdrag) eller som indskud i en portefølje (investering).
                </p>
                <div className="key-list">
              <div className="key-item" style={{ "--key-color": C.orange }}>
                <span className="key-item__marker" />
                <strong className="key-item__label">Afkast</strong>
                <span className="key-item__description">
                  — hvad investeringen kaster af sig ({showNet ? "efter lagerbeskatning" : "før skat"})
                </span>
              </div>
              <div className="key-item" style={{ "--key-color": C.red }}>
                <span className="key-item__marker" />
                <strong className="key-item__label">Ekstra rente+bidrag</strong>
                <span className="key-item__description">— prisen for at holde højere gæld</span>
              </div>
              <div className="key-item" style={{ "--key-color": C.green }}>
                <span className="key-item__marker" />
                <strong className="key-item__label">Netto</strong>
                <span className="key-item__description">
                  — afkast minus meromkostning = den reelle gevinst/tab
                </span>
              </div>
              <div className="key-item" style={{ "--key-color": C.blue }}>
                <span className="key-item__marker" />
                <strong className="key-item__label">Likviditet</strong>
                <span className="key-item__description">
                  — porteføljens værdi: indbetalinger plus investeringsafkast
                </span>
              </div>
                </div>
              </>
            ) : (
              <p className="body-copy">
                Dette lån giver først adgang til afdragsfrihed ved højst 60 % belåning.
                Der er derfor ingen lavere ydelse at investere nu.
              </p>
            )}
          </div>

          {investmentAvailable && (
            <>
              <div className="investment-analysis">
            <div className="range-grid">
              <RangeControl
                label="Forventet afkast"
                value={investReturn}
                valueLabel={fmtPct1(investReturn)}
                min={0}
                max={20}
                step={0.5}
                minLabel="0%"
                maxLabel="20%"
                accent={C.orange}
                onChange={setInvestReturn}
              />
              <RangeControl
                label="Tidshorisont"
                value={investYears}
                valueLabel={`${investYears} år`}
                min={5}
                max={30}
                step={1}
                minLabel="5 år"
                maxLabel="30 år"
                accent={C.orange}
                onChange={setInvestYears}
              />
            </div>

            {investChartType && (
              <>
                <div className="chart-context chart-context--compact">
                  Viser:{" "}
                  <strong className="dynamic-loan-text" style={{ "--loan-color": activeLoanTypes[0]?.color }}>
                    {activeLoanTypes[0]?.label}
                  </strong>{" "}
                  ({activeLoanTypes[0]?.rateLabel}) · {fmt(loanAmount)} kr.
                </div>
                <div className="chart-frame chart-frame--bottom-spaced">
                <ResponsiveContainer>
                  <ComposedChart
                    data={investChartData}
                    margin={{ top: 10, right: 8, left: -10, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="gAfk" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={C.orange} stopOpacity={0.15} />
                        <stop offset="100%" stopColor={C.orange} stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="gNet" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={C.green} stopOpacity={0.15} />
                        <stop offset="100%" stopColor={C.green} stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="gLiq" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={C.blue} stopOpacity={0.12} />
                        <stop offset="100%" stopColor={C.blue} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(60,60,67,0.08)" />
                    <XAxis
                      dataKey="year"
                      tick={{ fill: C.text4, fontSize: 10 }}
                      axisLine={{ stroke: "rgba(60,60,67,0.08)" }}
                      label={{
                        value: "År",
                        position: "insideBottomRight",
                        offset: -5,
                        fill: C.text4,
                        fontSize: 10,
                      }}
                    />
                    <YAxis
                      tickFormatter={(value) =>
                        value >= 1000000
                          ? `${(value / 1000000).toFixed(1)}m`
                          : value <= -100000
                            ? `-${Math.round(Math.abs(value) / 1000)}k`
                            : `${Math.round(value / 1000)}k`
                      }
                      tick={{ fill: C.text4, fontSize: 10 }}
                      axisLine={{ stroke: "rgba(60,60,67,0.08)" }}
                      width={48}
                    />
                    <Tooltip content={<InvTip showNet={showNet} />} />
                    <ReferenceLine y={0} stroke={C.text4} strokeWidth={1} />
                    {!hiddenInvKeys.has("afkast") && (
                      <Area type="monotone" dataKey="afkast" stroke={C.orange} fill="url(#gAfk)" strokeWidth={2} dot={false} />
                    )}
                    {!hiddenInvKeys.has("extraCost") && (
                      <Line
                        type="monotone"
                        dataKey="extraCost"
                        stroke={C.red}
                        strokeWidth={2}
                        strokeDasharray="6 3"
                        dot={false}
                      />
                    )}
                    {!hiddenInvKeys.has("result") && (
                      <Area
                        type="monotone"
                        dataKey="result"
                        stroke={C.green}
                        fill="url(#gNet)"
                        strokeWidth={2}
                        dot={false}
                        activeDot={{
                          r: 4,
                          stroke: C.green,
                          fill: C.card,
                          strokeWidth: 2,
                        }}
                      />
                    )}
                    {!hiddenInvKeys.has("portfolio") && (
                      <Area
                        type="monotone"
                        dataKey="portfolio"
                        stroke={C.blue}
                        fill="url(#gLiq)"
                        strokeWidth={2}
                        strokeDasharray="4 3"
                        dot={false}
                        activeDot={{
                          r: 4,
                          stroke: C.blue,
                          fill: C.card,
                          strokeWidth: 2,
                        }}
                      />
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
                </div>
                <ChartLegend
                  className="chart-legend--bottom-spaced"
                  hiddenKeys={hiddenInvKeys}
                  onToggle={toggleInvKey}
                  items={[
                    {
                      key: "afkast",
                      color: C.orange,
                      label: showNet ? "Afkast (efter lagerbeskatning)" : "Afkast (før skat)",
                    },
                    { key: "extraCost", color: C.red, label: "Ekstra rente+bidrag (kum.)" },
                    {
                      key: "result",
                      color: C.green,
                      label: "Netto",
                    },
                    { key: "portfolio", color: C.blue, label: "Likviditet" },
                  ]}
                />
              </>
            )}

            <div className="summary-grid inset-panel">
              {activeLoanTypes.map((loanType) => {
                const series = investData[loanType.id];
                if (!series) return null;
                const finalPoint = series[series.length - 1];
                const netResult = finalPoint.result ?? finalPoint.nettoAfkast;
                const positive = netResult > 0;

                return (
                  <SummaryCard
                    key={loanType.id}
                    title={`${loanType.label} · ${investYears} år`}
                    tone={loanType.color}
                  >
                    <DataRow
                      label="Likviditet"
                      value={`+${fmt(finalPoint.portfolio)}`}
                      variant="compact"
                      tone={C.blue}
                    />
                    <DataRow
                      label="Afkast"
                      value={`+${fmt(finalPoint.afkast)}`}
                      variant="compact"
                      tone={C.orange}
                    />
                    <DataRow
                      label="Ekstra rente+bidrag"
                      value={`−${fmt(finalPoint.extraCost)}`}
                      variant="compact"
                      tone={C.red}
                    />
                    <DataRow
                      label="Netto"
                      value={`${positive ? "+" : ""}${fmt(netResult)}`}
                      variant="total"
                      tone={positive ? C.green : C.red}
                    />
                  </SummaryCard>
                );
              })}
            </div>
              </div>

              <div className="chart-explanation">
            <strong>Sådan læses grafen:</strong> Hovedstolen
            (indskud vs. egenkapital) holdes ude — den er ens i begge scenarier. "Afkast" er ren
            merværdi fra investering {showNet ? "efter lagerbeskatning" : "før skat"}. "Ekstra rente+bidrag" er den
            akkumulerede meromkostning ved at holde konstant gæld i stedet for at afdrage.
            "Likviditet" er porteføljens aktuelle værdi og inkluderer både indbetalinger og afkast.
            Når den grønne linje er over nul, tjener du på at investere. Resultatet er
            {showNet ? " efter lagerbeskatning og rentefradrag." : " før skat og uden rentefradrag."}
              </div>
              <div className="chart-disclaimer">
            {showNet
              ? `Lagerbeskatning: 27% op til ${fmt(79400 * investOwners)} kr., 42% derover. `
              : "Lagerbeskatning og rentefradrag er ikke medregnet. "}
            Ved afdrag falder den vægtede bidragssats løbende, efterhånden som LTV falder.
            Inkluderet i beregningen.
              </div>
            </>
          )}
        </section>

        <EcbMsciChart />

        <footer className="calculator-notes">
          <p>
            <strong>Bidragssatser:</strong> Nordea Kredit, nye lån fra
            23. feb. 2026, helårsbolig. Beregnet som vægtet sats over belåningsintervallerne,
            inkl. afdragsfrihedstillæg ved ≤60%.
          </p>
          <p>
            <strong>Renter:</strong> Fast rente 4%, F5 2,90%, F3 2,75%,
            Kort Rente 2,59% (Nordea, 6. aug. 2026).
          </p>
          <p>
            <strong>60/4-reglen:</strong> Ved belåning {">"} 60% og
            gæld {">"} 4× bruttoindkomst kan man ikke vælge risikable lån (variabel rente uden
            renteloft, afdragsfrihed).
          </p>
          <p>
            <strong>Investering:</strong> Netto medregner
            lagerbeskatning på 27%/42%. Brutto er før skat og uden rentefradrag. Afdragsscenariet
            inkl. faldende rente+bidrag og løbende lavere vægtet bidragssats, når LTV falder.
            Sammenligningen vises kun ved højst 60 % belåning.
          </p>
          <p>
            <strong>Skat:</strong> Netto bruger 33,7% fradragsværdi
            på de første {fmt(taxThreshold)} kr. af rente+bidrag pr. år og 25,7% derefter.
            Når Netto er valgt, kan du skifte mellem Enlig/Ægtepar for 50.000/100.000 kr.-grænsen.
            Afdrag er ikke fradragsberettiget.
          </p>
          <p className="source-link">
            <a
              href="https://www.buymeacoffee.com/martinlikesfilter"
            >
              Buy me a coffee
            </a>
            <a
              href="https://heymartin.net/git/?p=www.git;a=tree;f=realkreditberegner;hb=HEAD"
            >
              Kildekode
            </a>
          </p>
        </footer>
      </div>
    </main>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
