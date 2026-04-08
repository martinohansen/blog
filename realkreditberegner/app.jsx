const { useEffect, useMemo, useState } = React;
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
} = window.RealkreditCalculations;

function roundDownToStep(value, step) {
  return Math.floor(value / step) * step;
}

const MIN_HOME_PRICE = 500000;
const MAX_HOME_PRICE = 30000000;
const HOME_PRICE_STEP = 100000;
const MIN_LOAN_AMOUNT = 0;
const LOAN_AMOUNT_STEP = 100000;

const C = {
  bg: "#f5f5f7",
  card: "#fff",
  card2: "#f5f5f7",
  card3: "#e8e8ed",
  text: "#1d1d1f",
  text2: "#6e6e73",
  text3: "#86868b",
  text4: "#aeaeb2",
  sep: "rgba(60,60,67,0.1)",
  blue: "#0071e3",
  link: "#2997ff",
  green: "#059669",
  red: "#D4775A",
  orange: "#c9a050",
  purple: "#8b5cf6",
  font: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', system-ui, sans-serif",
  mono: "'SF Mono', 'Menlo', 'Monaco', 'Consolas', ui-monospace, monospace",
};

function sliderBg(value, min, max, color) {
  const pct = ((value - min) / (max - min)) * 100;
  return `linear-gradient(to right, ${color} ${pct}%, ${C.card3} ${pct}%)`;
}

function TooltipShell({ title, children }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.95)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderRadius: 12,
        padding: "12px 16px",
        fontSize: 12,
        boxShadow: "0 4px 16px rgba(0,0,0,0.1)",
        border: `0.5px solid ${C.sep}`,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 6, color: C.text2, fontSize: 11, letterSpacing: 0.3 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function ValueTooltipRow({ color, label, value, suffix = " kr." }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 20, marginBottom: 2 }}>
      <span style={{ color }}>{label}</span>
      <span className="mono" style={{ color: C.text, fontFamily: C.mono }}>
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
        <div style={{ fontSize: 10, color: C.red, marginTop: 4 }}>Inkl. afdrag</div>
      )}
    </TooltipShell>
  );
}

function InvTip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <TooltipShell title={`År ${label}`}>
      {payload.map((entry) => {
        const info = INV_LABELS[entry.dataKey] || {};
        return (
          <ValueTooltipRow
            key={entry.dataKey}
            color={info.color || entry.color}
            label={info.label || entry.dataKey}
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
    <div
      style={{
        display: "flex",
        height: 20,
        borderRadius: 4,
        overflow: "hidden",
        background: C.card2,
      }}
    >
      <div style={{ width: `${(rente / scale) * 100}%`, background: "#8CA8D8", transition: "width 0.4s" }} />
      <div style={{ width: `${(bidrag / scale) * 100}%`, background: "#B8A8D0", transition: "width 0.4s" }} />
      {afdrag > 0 && (
        <div style={{ width: `${(afdrag / scale) * 100}%`, background: "#C8C8CC", transition: "width 0.4s" }} />
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
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);
  const chartData = useMemo(
    () => buildEcbMsciChartData(startYear, rollYears),
    [startYear, rollYears],
  );
  const avgLabel = `${rollYears}-års annualiseret`;
  const isNarrow = viewportWidth <= 720;

  useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <div className="card">
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 28, fontWeight: 600, marginBottom: 4, color: C.text, letterSpacing: -0.5 }}>
          ECB-rente vs. MSCI World
        </h2>
        <p style={{ fontSize: 17, color: C.text2, lineHeight: 1.5 }}>
          Kvartalsafkast med rullende annualiseret afkast
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isNarrow ? "1fr" : "1fr 1fr",
          gap: 20,
          marginBottom: 20,
        }}
      >
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 14, color: C.text2 }}>Fra år</span>
            <span className="mono" style={{ fontSize: 17, fontWeight: 600, color: C.blue, fontFamily: C.mono }}>
              {startYear}
            </span>
          </div>
          <input
            type="range"
            min={1999}
            max={2020}
            step={1}
            value={startYear}
            onChange={(e) => setStartYear(+e.target.value)}
            style={{ background: sliderBg(startYear, 1999, 2020, C.blue) }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 12, color: C.text4 }}>
            <span>1999</span>
            <span>2020</span>
          </div>
        </div>
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 14, color: C.text2 }}>Rullende annualiseret</span>
            <span className="mono" style={{ fontSize: 17, fontWeight: 600, color: C.blue, fontFamily: C.mono }}>
              {rollYears} år
            </span>
          </div>
          <input
            type="range"
            min={1}
            max={15}
            step={1}
            value={rollYears}
            onChange={(e) => setRollYears(+e.target.value)}
            style={{ background: sliderBg(rollYears, 1, 15, C.blue) }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 12, color: C.text4 }}>
            <span>1 år</span>
            <span>15 år</span>
          </div>
        </div>
      </div>

      <div style={{ fontSize: 14, color: C.text3, marginBottom: 10 }}>
        {startYear}–2026 Q1 · Rullende annualiseret afkast:{" "}
        <strong style={{ color: C.orange }}>{rollYears} år</strong>
      </div>

      <div style={{ width: "100%", height: 280 }}>
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

      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 12, justifyContent: "center", fontSize: 12 }}>
        {[
          { key: "ecb", color: C.blue, label: "ECB MRO-rente" },
          { key: "msci", color: C.green, label: "MSCI World (kv.)" },
          { key: "avg", color: C.orange, label: avgLabel },
        ].map(({ key, color, label }) => {
          const hidden = hiddenEcbKeys.has(key);
          return (
            <button
              key={key}
              type="button"
              onClick={() => setHiddenEcbKeys((prev) => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; })}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                color: hidden ? C.text4 : color,
                background: "none",
                border: 0,
                padding: 0,
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: "inherit",
                opacity: hidden ? 0.45 : 1,
                textDecoration: hidden ? "line-through" : "none",
                transition: "opacity 0.2s, color 0.2s",
              }}
            >
              <span style={{ width: 14, height: 3, borderRadius: 2, background: hidden ? C.text4 : color, transition: "background 0.2s" }} />
              {label}
            </button>
          );
        })}
      </div>
      <p style={{ fontSize: 12, color: C.text4, marginTop: 12, lineHeight: 1.5, textAlign: "center" }}>
        ECB Main Refinancing Rate · MSCI World gross total return USD
      </p>
    </div>
  );
}

function MilestoneCard({ milestone, showNet, maxBarVal }) {
  const [isOpen, setIsOpen] = useState(false);
  const gridColumns = `72px repeat(${milestone.rows.length}, 1fr)`;
  const contentId = `milestone-${milestone.ltv}-content`;

  const renderMetricRow = (label, renderValue, extraStyle) => (
    <div className="row" style={{ gridTemplateColumns: gridColumns, ...extraStyle }}>
      <div className="lbl">{label}</div>
      {milestone.rows.map(({ loanType, breakdown }) => (
        <div
          key={loanType.id}
          className="mono"
          style={{ textAlign: "center", fontSize: 13, fontFamily: C.mono, fontWeight: 500, color: C.text }}
        >
          {renderValue(breakdown, loanType)}
        </div>
      ))}
    </div>
  );

  return (
    <div className="msc">
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={contentId}
        onClick={() => setIsOpen((open) => !open)}
        style={{
          width: "100%",
          background: "transparent",
          border: 0,
          color: "inherit",
          cursor: "pointer",
          fontFamily: "inherit",
          padding: 0,
          textAlign: "left",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <span className="mono" style={{ fontSize: 24, fontWeight: 600, color: milestone.tc, fontFamily: C.mono }}>
                {milestone.ltv}%
              </span>
              <span className="tag" style={{ background: `${milestone.tc}14`, color: milestone.tc }}>
                {milestone.tag}
              </span>
            </div>
            <div style={{ fontSize: 14, color: C.text2, lineHeight: 1.4 }}>
              {milestone.desc}
            </div>
          </div>
          <span
            style={{
              marginTop: 4,
              transition: "transform 0.25s ease",
              transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 28,
              height: 28,
              borderRadius: "50%",
              background: C.card2,
            }}
          >
            <svg width="14" height="8" viewBox="0 0 14 8" fill="none">
              <path d="M1 1.5L7 6.5L13 1.5" stroke={C.text3} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>
        </div>
      </button>

      {isOpen && (
        <div id={contentId} style={{ marginTop: 14 }}>
          <div className="milestone-scroll">
            <div className="milestone-grid">
              <div className="row" style={{ gridTemplateColumns: gridColumns }}>
                <div />
                {milestone.rows.map(({ loanType }) => (
                  <div
                    key={loanType.id}
                    style={{ textAlign: "center", color: loanType.color, fontWeight: 600, fontSize: 12 }}
                  >
                    {loanType.label}
                  </div>
                ))}
              </div>

              {renderMetricRow("Rente", (result) => (
                <span style={{ color: "#8CA8D8" }}>{fmtPct2(result.rentePct)}</span>
              ))}
              {renderMetricRow("Bidrag", (result) => (
                <span style={{ color: "#B8A8D0" }}>{fmtPct(result.bidragPct)}</span>
              ))}
              {renderMetricRow(
                "Samlet sats",
                (result) => <strong>{fmtPct2(result.rentePct + result.bidragPct)}</strong>,
                { borderTop: `0.5px solid ${C.sep}`, paddingTop: 6 },
              )}

              <div className="sep" />

              {renderMetricRow("Rente kr./år", (result) => (
                <span style={{ color: "#8CA8D8" }}>
                  {fmt(Math.round(showNet ? result.renteKrN : result.renteKrB))}
                </span>
              ))}
              {renderMetricRow("Bidrag kr./år", (result) => (
                <span style={{ color: "#B8A8D0" }}>
                  {fmt(Math.round(showNet ? result.bidragKrN : result.bidragKrB))}
                </span>
              ))}
              {!milestone.af &&
                renderMetricRow("Afdrag kr./år", (result) => (
                  <span style={{ color: "#86868b" }}>{fmt(Math.round(result.afdragKr))}</span>
                ))}

              <div style={{ marginTop: 10 }}>
                <div style={{ display: "flex", gap: 10, marginBottom: 4, fontSize: 12, flexWrap: "wrap" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ width: 10, height: 8, borderRadius: 2, background: "#8CA8D8", display: "inline-block" }} />
                    Rente
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ width: 10, height: 8, borderRadius: 2, background: "#B8A8D0", display: "inline-block" }} />
                    Bidrag
                  </span>
                  {!milestone.af && (
                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ width: 10, height: 8, borderRadius: 2, background: "#C8C8CC", display: "inline-block" }} />
                      Afdrag
                    </span>
                  )}
                </div>
                {milestone.rows.map(({ loanType, breakdown }) => (
                  <div key={loanType.id} style={{ marginBottom: 4 }}>
                    <CostBar breakdown={breakdown} maxVal={maxBarVal} showNet={showNet} />
                  </div>
                ))}
              </div>

              <div className="sep" />

              {renderMetricRow(
                "Ydelse/år",
                (result) => <strong>{fmt(Math.round(showNet ? result.ydelseN : result.ydelseB))}</strong>,
              )}
              {!milestone.af &&
                renderMetricRow("+ Afdrag", (result) => (
                  <strong style={{ color: C.text2 }}>{fmt(Math.round(result.afdragKr))}</strong>
                ))}
              {milestone.af &&
                renderMetricRow("Likviditet/md.", (result) => (
                  <span style={{ color: C.blue }}>+{fmt(result.likviditetMd)}</span>
                ),
                { marginTop: 6 },
                )}
              {renderMetricRow(
                "Mdl. total",
                (result) => (
                  <span style={{ fontSize: 14, fontWeight: 600, color: milestone.tc, fontFamily: C.mono }}>
                    {fmt(Math.round((showNet ? result.totalN : result.totalB) / 12))}
                  </span>
                ),
                { background: C.card, borderRadius: 12, padding: "8px 6px", marginTop: 6 },
              )}
            </div>
          </div>

          {!milestone.af && (
            <div style={{ fontSize: 12, color: C.text3, marginTop: 8 }}>
              Afdrag er opsparing i boligen — du får pengene igen ved salg/omlægning
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function App() {
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);
  const [loanAmount, setLoanAmount] = useState(3000000);
  const [homePrice, setHomePrice] = useState(5000000);
  const [selectedTypes, setSelectedTypes] = useState(() =>
    LOAN_TYPES.map((loanType) => loanType.id),
  );
  const [showNet, setShowNet] = useState(false);
  const [chartMode, setChartMode] = useState("total");
  const [investReturn, setInvestReturn] = useState(7);
  const [investYears, setInvestYears] = useState(15);
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

  const investData = useMemo(
    () =>
      buildInvestmentData(
        activeLoanTypes,
        loanAmount,
        investReturn,
        investYears,
        taxHousehold,
      ),
    [activeTypeKey, loanAmount, investReturn, investYears, taxHousehold],
  );

  const investChartType = activeLoanTypes[0]?.id;
  const investChartData = investData[investChartType] || [];
  const hasValidInputs = homePrice > 0 && loanAmount >= 0;
  const currentLtv = hasValidInputs ? (loanAmount / homePrice) * 100 : null;
  const currentBand = getLoanBandForLtv(currentLtv ?? 0);
  const isNarrow = viewportWidth <= 720;
  const isPhone = viewportWidth <= 480;
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

  useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: C.bg,
        color: C.text,
        fontFamily: C.font,
        padding: isPhone ? "20px 12px" : "32px 16px",
      }}
    >
       <div style={{ maxWidth: 820, margin: "0 auto" }}>
        <div style={{ marginBottom: isPhone ? 24 : 32 }}>
          <div
            style={{
              fontSize: 17,
              fontWeight: 600,
              color: C.blue,
              letterSpacing: -0.2,
              marginBottom: 8,
            }}
          >
            Realkreditberegner
          </div>
          <h1 style={{
            fontSize: isPhone ? 38 : isNarrow ? 46 : 56,
            fontWeight: 600,
            lineHeight: 1.05,
            marginBottom: 12,
            letterSpacing: isPhone ? -1 : -1.5,
            background: "linear-gradient(90deg, #1d1d1f, #0071e3, #8b5cf6, #1d1d1f)",
            backgroundSize: "200% 100%",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}>
            Se hvad dit lån koster
          </h1>
          <p style={{ fontSize: 17, color: C.text2, lineHeight: 1.6, fontWeight: 400 }}>
            Sammenlign renter, bidrag og skatteværdi på tværs af belåningsgrader — og se om
            afdragsfrihed med investering kan betale sig mod historisk aktieafkast.
          </p>
        </div>

        <div
          className="card"
          style={{ borderLeft: `4px solid ${C.blue}` }}
        >
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 21, fontWeight: 600, color: C.text }}>
              60/4-reglen
            </div>
          </div>
          <p style={{ fontSize: 14, color: C.text2, lineHeight: 1.7, fontWeight: 400 }}>
            Hvis belåningsgraden er over <strong style={{ color: C.text }}>60%</strong>{" "}
            <em>og</em> den samlede gæld er mere end{" "}
            <strong style={{ color: C.text }}>4 gange husstandens bruttoindkomst</strong>,
            kan du ikke vælge et "risikabelt lån" (variabel rente uden renteloft eller
            afdragsfrihed).
          </p>
          <p style={{ fontSize: 14, color: C.text3, lineHeight: 1.6, marginTop: 8, fontWeight: 400 }}>
            Begge betingelser skal være opfyldt. Har du lav gældsfaktor ({`<`} 4× indkomst)
            kan du godt vælge flekslån over 60% — men afdragsfrihed kræver stadig belåning
            under 60%.
          </p>
        </div>

        <div className="card">
          <div
            className="loan-toolbar"
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              alignItems: "center",
              marginBottom: 24,
            }}
          >
            <div
              className="loan-selector"
              style={{
                display: "flex",
                gap: 6,
                alignItems: "center",
                minWidth: 0,
                rowGap: 6,
                flex: "1 1 auto",
              }}
            >
              <span style={{ fontSize: 14, color: C.text3, flex: "0 0 auto" }}>Vælg lån:</span>
              {LOAN_TYPES.map((loanType) => (
                <button
                  key={loanType.id}
                  type="button"
                  title={loanType.label}
                  className={`chip ${selectedTypes.includes(loanType.id) ? "active" : ""}`}
                  style={{
                    background: selectedTypes.includes(loanType.id) ? `${loanType.color}0c` : "#fff",
                    color: selectedTypes.includes(loanType.id) ? loanType.color : undefined,
                    flex: "0 0 auto",
                  }}
                  onClick={() => toggleLoanType(loanType.id)}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: loanType.color,
                      flex: "0 0 auto",
                    }}
                  />
                  {loanType.label}
                </button>
              ))}
            </div>
            <div className="loan-toolbar-actions" style={{ display: "flex", gap: 6, flex: "0 0 auto", alignItems: "center" }}>
              <div
                style={{
                  width: showNet ? 78 : 0,
                  opacity: showNet ? 1 : 0,
                  overflow: "hidden",
                  transform: showNet ? "translateX(0)" : "translateX(12px)",
                  transition: "width 0.25s ease, opacity 0.2s ease, transform 0.25s ease",
                  pointerEvents: showNet ? "auto" : "none",
                }}
              >
                <button
                  className="tb on"
                  style={{ width: "100%", whiteSpace: "nowrap" }}
                  onClick={cycleTaxHousehold}
                >
                  {taxHouseholdLabel}
                </button>
              </div>
              <div className="seg">
                <button className={showNet ? "on" : ""} onClick={() => setShowNet(true)}>
                  Netto
                </button>
                <button className={!showNet ? "on" : ""} onClick={() => setShowNet(false)}>
                  Brutto
                </button>
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: isPhone ? 18 : 24 }}>
            <div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  gap: 10,
                  flexWrap: "wrap",
                  marginBottom: 10,
                }}
              >
                <span style={{ fontSize: 14, color: C.text2 }}>Boligpris</span>
                <span className="mono" style={{ fontSize: isPhone ? 20 : 24, fontWeight: 600, fontFamily: C.mono }}>
                  {fmt(homePrice)} kr.
                </span>
              </div>
              <input
                type="range"
                min={MIN_HOME_PRICE}
                max={MAX_HOME_PRICE}
                step={HOME_PRICE_STEP}
                value={homePrice}
                style={{ background: sliderBg(homePrice, MIN_HOME_PRICE, MAX_HOME_PRICE, C.blue) }}
                onChange={(event) => {
                  const nextHomePrice = +event.target.value;
                  const nextMaxLoanAmount = roundDownToStep(nextHomePrice * 0.8, LOAN_AMOUNT_STEP);
                  setHomePrice(nextHomePrice);
                  setLoanAmount((current) => Math.min(current, nextMaxLoanAmount));
                }}
              />
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginTop: 6,
                  fontSize: 12,
                  color: C.text4,
                }}
              >
                <span>{fmt(MIN_HOME_PRICE)}</span>
                <span>{fmt(MAX_HOME_PRICE)}</span>
              </div>
            </div>

            <div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  gap: 10,
                  flexWrap: "wrap",
                  marginBottom: 10,
                }}
              >
                <span style={{ fontSize: 14, color: C.text2 }}>Restgæld</span>
                <span className="mono" style={{ fontSize: isPhone ? 20 : 24, fontWeight: 600, fontFamily: C.mono }}>
                  {fmt(loanAmount)} kr.
                </span>
              </div>
              <input
                type="range"
                min={MIN_LOAN_AMOUNT}
                max={maxLoanAmount}
                step={LOAN_AMOUNT_STEP}
                value={loanAmount}
                style={{ background: sliderBg(loanAmount, MIN_LOAN_AMOUNT, maxLoanAmount, C.blue) }}
                onChange={(event) => setLoanAmount(+event.target.value)}
              />
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginTop: 6,
                  fontSize: 12,
                  color: C.text4,
                }}
              >
                <span>{fmt(MIN_LOAN_AMOUNT)}</span>
                <span>{fmt(maxLoanAmount)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              marginBottom: 16,
              flexWrap: "wrap",
              gap: 8,
            }}
          >
            <div>
              <h2 style={{ fontSize: 28, fontWeight: 600, color: C.text, letterSpacing: -0.5 }}>
                Årlig omkostning
              </h2>
              <p style={{ fontSize: 14, color: C.text3, marginTop: 2 }}>
                {showNet ? `Netto efter skat · ${taxHouseholdLabel}` : "Brutto"} · Belåning høj → lav
              </p>
            </div>
            <div className="seg">
              <button className={chartMode === "total" ? "on" : ""} onClick={() => setChartMode("total")}>
                Inkl. afdrag
              </button>
              <button className={chartMode === "ydelse" ? "on" : ""} onClick={() => setChartMode("ydelse")}>
                Kun rente+bidrag
              </button>
            </div>
          </div>

          <div style={{ width: "100%", height: 260 }}>
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

          <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 10, justifyContent: "center", fontSize: 12 }}>
            {activeLoanTypes.map((loanType) => {
              const hidden = hiddenCostKeys.has(loanType.id);
              return (
                <button
                  key={loanType.id}
                  type="button"
                  onClick={() => toggleCostKey(loanType.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    color: hidden ? C.text4 : loanType.color,
                    background: "none",
                    border: 0,
                    padding: 0,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    fontSize: "inherit",
                    opacity: hidden ? 0.45 : 1,
                    textDecoration: hidden ? "line-through" : "none",
                    transition: "opacity 0.2s, color 0.2s",
                  }}
                >
                  <span style={{ width: 14, height: 3, borderRadius: 2, background: hidden ? C.text4 : loanType.color, transition: "background 0.2s" }} />
                  {loanType.label} ({loanType.rateLabel})
                </button>
              );
            })}
          </div>

          <div
            style={{
              marginTop: 16,
              padding: 20,
              borderRadius: 18,
              background: C.card2,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 12,
                flexWrap: "wrap",
                marginBottom: 14,
              }}
            >
              <div>
                <div style={{ fontSize: 14, color: C.text3, fontWeight: 400 }}>belåning</div>
                <div className="mono" style={{ fontSize: 48, fontWeight: 600, color: C.orange, lineHeight: 1, fontFamily: C.mono, letterSpacing: -1, marginTop: 2 }}>
                  {currentLtv === null ? "—" : fmtPct2(currentLtv)}
                </div>
              </div>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 14, alignItems: "center" }}>
                <span style={{ color: C.text2 }}>
                  Boligpris: <strong className="mono" style={{ color: C.text, fontFamily: C.mono }}>{fmt(homePrice)}</strong>
                </span>
                <span style={{ color: C.text2 }}>
                  Egenkapital: <strong className="mono" style={{ color: C.text, fontFamily: C.mono }}>{fmt(selectedEquity)}</strong>
                </span>
                <span style={{ color: currentBand.af ? C.blue : C.red, fontWeight: 600 }}>
                  {currentBand.af ? "Afdragsfri mulig" : "Tvunget afdrag"}
                </span>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 }}>
              {selectedCaseData.map(({ loanType, breakdown: result }) => (
                <div
                  key={loanType.id}
                  style={{
                    borderRadius: 14,
                    background: C.card,
                    padding: 14,
                    minWidth: 0,
                  }}
                >
                  <div style={{ fontSize: 14, fontWeight: 600, color: loanType.color, marginBottom: 8 }}>
                    {loanType.label}
                  </div>
                  <div style={{ display: "grid", gap: 4, fontSize: 13 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
                      <span style={{ color: C.text3 }}>Rente + bidrag</span>
                      <span className="mono" style={{ fontFamily: C.mono }}>{fmt(Math.round(showNet ? result.ydelseN : result.ydelseB))}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
                      <span style={{ color: C.text3 }}>Afdrag</span>
                      <span className="mono" style={{ fontFamily: C.mono }}>{fmt(Math.round(result.afdragKr))}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
                      <span style={{ color: C.text3 }}>Samlet pr. år</span>
                      <span className="mono" style={{ fontWeight: 600, fontFamily: C.mono }}>
                        {fmt(Math.round(showNet ? result.totalN : result.totalB))}
                      </span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 6,
                        marginTop: 2,
                        paddingTop: 6,
                        borderTop: `0.5px solid ${C.sep}`,
                      }}
                    >
                      <span style={{ color: C.text2, fontWeight: 500 }}>Pr. måned</span>
                      <span className="mono" style={{ fontWeight: 600, color: loanType.color, fontFamily: C.mono }}>
                        {fmt(Math.round((showNet ? result.totalN : result.totalB) / 12))}
                      </span>
                    </div>
                    {result.likviditetMd > 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 6, marginTop: 4 }}>
                        <span style={{ color: C.blue, fontSize: 12 }}>Likviditet/md.</span>
                        <span className="mono" style={{ fontFamily: C.mono, color: C.blue, fontSize: 12 }}>
                          +{fmt(result.likviditetMd)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", marginTop: 16, borderRadius: 12, overflow: "hidden" }}>
            <div
              style={{
                flex: 2,
                background: `${C.red}0a`,
                padding: "10px 12px",
                borderRight: `0.5px solid ${C.sep}`,
                textAlign: "center",
              }}
            >
              <div style={{ color: C.red, fontWeight: 600, fontSize: 14 }}>60–80%</div>
              <div style={{ color: C.text3, fontSize: 12 }}>Tvunget afdrag</div>
            </div>
            <div
              style={{
                flex: 2,
                background: `${C.blue}0a`,
                padding: "10px 12px",
                borderRight: `0.5px solid ${C.sep}`,
                textAlign: "center",
              }}
            >
              <div style={{ color: C.blue, fontWeight: 600, fontSize: 14 }}>40–60%</div>
              <div style={{ color: C.text3, fontSize: 12 }}>Afdragsfri mulig</div>
            </div>
            <div style={{ flex: 3, background: `${C.green}0a`, padding: "10px 12px", textAlign: "center" }}>
              <div style={{ color: C.green, fontWeight: 600, fontSize: 14 }}>Under 40%</div>
              <div style={{ color: C.text3, fontSize: 12 }}>Laveste bidrag</div>
            </div>
          </div>
        </div>

        <div className="card">
          <h2 style={{ fontSize: 28, fontWeight: 600, color: C.text, marginBottom: 4, letterSpacing: -0.5 }}>
            Milepæle
          </h2>
          <p style={{ fontSize: 14, color: C.text3, lineHeight: 1.5, marginBottom: 14 }}>
            Udvid hver belåningsgrad for at se rente, bidrag og månedlig ydelse opdelt på lånertype.
          </p>
          {milestoneData.map((milestone) => (
            <MilestoneCard
              key={milestone.ltv}
              milestone={milestone}
              showNet={showNet}
              maxBarVal={maxBarVal}
            />
          ))}
        </div>

        <div className="card">
          <div style={{ marginBottom: 20 }}>
            <h2 style={{ fontSize: 28, fontWeight: 600, marginBottom: 6, color: C.text, letterSpacing: -0.5 }}>
              Afdragsfri + investér vs. fortsæt afdrag
            </h2>
            <p style={{ fontSize: 14, color: C.text2, lineHeight: 1.6, fontWeight: 400 }}>
              Udgangspunkt: 60% LTV. Pengene er de samme i begge scenarier — enten som egenkapital
              i boligen (afdrag) eller som indskud i en portefølje (investering). Forskellen er
              udelukkende:
            </p>
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 14 }}>
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 3,
                    background: C.orange,
                    flexShrink: 0,
                  }}
                />
                <span style={{ color: C.orange }}>
                  <strong>Afkast</strong>
                </span>
                <span style={{ color: C.text3 }}>
                  — hvad investeringen kaster af sig (efter lagerbeskatning)
                </span>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 14 }}>
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 3,
                    background: C.red,
                    flexShrink: 0,
                  }}
                />
                <span style={{ color: C.red }}>
                  <strong>Ekstra rente+bidrag</strong>
                </span>
                <span style={{ color: C.text3 }}>— prisen for at holde højere gæld</span>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 14 }}>
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 3,
                    background: C.green,
                    flexShrink: 0,
                  }}
                />
                <span style={{ color: C.green }}>
                  <strong>Netto afkast</strong>
                </span>
                <span style={{ color: C.text3 }}>
                  — afkast minus meromkostning = den reelle gevinst/tab
                </span>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 14 }}>
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 3,
                    background: C.blue,
                    flexShrink: 0,
                  }}
                />
                <span style={{ color: C.blue }}>
                  <strong>Likviditet</strong>
                </span>
                <span style={{ color: C.text3 }}>
                  — månedlig frie midler når afdrag udgår af dit budget
                </span>
              </div>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: isNarrow ? "1fr" : "1fr 1fr",
              gap: 20,
              marginBottom: 20,
            }}
          >
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 14, color: C.text2 }}>Forventet afkast</span>
                <span className="mono" style={{ fontSize: 17, fontWeight: 600, color: C.orange, fontFamily: C.mono }}>
                  {fmtPct1(investReturn)}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={20}
                step={0.5}
                value={investReturn}
                style={{ background: sliderBg(investReturn, 0, 20, C.orange) }}
                onChange={(event) => setInvestReturn(+event.target.value)}
              />
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 12, color: C.text4 }}>
                <span>0%</span>
                <span>20%</span>
              </div>
            </div>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 14, color: C.text2 }}>Tidshorisont</span>
                <span className="mono" style={{ fontSize: 17, fontWeight: 600, color: C.orange, fontFamily: C.mono }}>
                  {investYears} år
                </span>
              </div>
              <input
                type="range"
                min={5}
                max={30}
                step={1}
                value={investYears}
                style={{ background: sliderBg(investYears, 5, 30, C.orange) }}
                onChange={(event) => setInvestYears(+event.target.value)}
              />
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 12, color: C.text4 }}>
                <span>5 år</span>
                <span>30 år</span>
              </div>
            </div>
          </div>

          {investChartType && (
            <>
              <div style={{ fontSize: 14, color: C.text3, marginBottom: 8 }}>
                Viser: <strong style={{ color: activeLoanTypes[0]?.color }}>{activeLoanTypes[0]?.label}</strong>{" "}
                ({activeLoanTypes[0]?.rateLabel}) · {fmt(loanAmount)} kr.
              </div>
              <div style={{ width: "100%", height: 260, marginBottom: 8 }}>
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
                    <Tooltip content={<InvTip />} />
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
                    {!hiddenInvKeys.has("nettoAfkast") && (
                      <Area
                        type="monotone"
                        dataKey="nettoAfkast"
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
                    {!hiddenInvKeys.has("cumulativeFreed") && (
                      <Area
                        type="monotone"
                        dataKey="cumulativeFreed"
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
              <div style={{ display: "flex", flexWrap: "wrap", gap: 16, justifyContent: "center", fontSize: 12, marginBottom: 16 }}>
                {[
                  { key: "afkast", color: C.orange, label: "Afkast (efter inv.skat)" },
                  { key: "extraCost", color: C.red, label: "Ekstra rente+bidrag (kum.)", opacity: 0.7 },
                  { key: "nettoAfkast", color: C.green, label: "Netto afkast" },
                  { key: "cumulativeFreed", color: C.blue, label: "Akkumuleret likviditet", opacity: 0.7 },
                ].map(({ key, color, label, opacity }) => {
                  const hidden = hiddenInvKeys.has(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => toggleInvKey(key)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 5,
                        color: hidden ? C.text4 : undefined,
                        background: "none",
                        border: 0,
                        padding: 0,
                        cursor: "pointer",
                        fontFamily: "inherit",
                        fontSize: "inherit",
                        opacity: hidden ? 0.45 : 1,
                        textDecoration: hidden ? "line-through" : "none",
                        transition: "opacity 0.2s, color 0.2s",
                      }}
                    >
                      <span style={{ width: 14, height: 3, borderRadius: 2, background: hidden ? C.text4 : color, opacity: !hidden && opacity ? opacity : 1, transition: "background 0.2s" }} />
                      {label}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 }}>
            {activeLoanTypes.map((loanType) => {
              const series = investData[loanType.id];
              if (!series) return null;
              const finalPoint = series[series.length - 1];
              const positive = finalPoint.nettoAfkast > 0;

              return (
                <div
                  key={loanType.id}
                  style={{
                    background: C.card2,
                    borderRadius: 14,
                    padding: 14,
                    minWidth: 0,
                  }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      color: loanType.color,
                      fontWeight: 600,
                      marginBottom: 8,
                      textAlign: "center",
                    }}
                  >
                    {loanType.label} · {investYears} år
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.text3, marginBottom: 2 }}>
                    <span style={{ color: C.blue }}>Likviditet</span>
                    <span className="mono" style={{ color: C.blue, fontFamily: C.mono }}>
                      +{fmt(finalPoint.cumulativeFreed)}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.text3, marginBottom: 2 }}>
                    <span>Afkast</span>
                    <span className="mono" style={{ color: C.orange, fontFamily: C.mono }}>
                      +{fmt(finalPoint.afkast)}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.text3, marginBottom: 2 }}>
                    <span>Ekstra rente+bidrag</span>
                    <span className="mono" style={{ color: C.red, fontFamily: C.mono }}>
                      −{fmt(finalPoint.extraCost)}
                    </span>
                  </div>
                  <div className="sep" style={{ margin: "6px 0" }} />
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 600 }}>
                    <span style={{ color: positive ? C.green : C.red }}>Netto</span>
                    <span className="mono" style={{ color: positive ? C.green : C.red, fontFamily: C.mono }}>
                      {positive ? "+" : ""}
                      {fmt(finalPoint.nettoAfkast)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ fontSize: 14, color: C.text3, marginTop: 16, lineHeight: 1.6 }}>
            <strong style={{ color: C.text2 }}>Sådan læses grafen:</strong> Hovedstolen
            (indskud vs. egenkapital) holdes ude — den er ens i begge scenarier. "Afkast" er ren
            merværdi fra investering efter lagerbeskatning. "Ekstra rente+bidrag" er den
            akkumulerede meromkostning ved at holde konstant gæld i stedet for at afdrage.
            "Akkumuleret likviditet" er den samlede kontantstrøm frigjort af at droppe afdraget.
            Når den grønne linje er over nul, tjener du på at investere.
          </div>
          <div style={{ fontSize: 14, color: C.text4, marginTop: 6, lineHeight: 1.5 }}>
            Lagerbeskatning: 27% op til 61.000 kr., 42% derover. Ved afdrag falder den vægtede
            bidragssats løbende, efterhånden som LTV falder. Inkluderet i beregningen.
          </div>
        </div>

        <EcbMsciChart />

        <div style={{ fontSize: 12, color: C.text4, lineHeight: 1.7, padding: "0 4px" }}>
          <p>
            <strong style={{ color: C.text3 }}>Bidragssatser:</strong> Nordea Kredit, nye lån fra
            23. feb. 2026, helårsbolig. Beregnet som vægtet sats over belåningsintervallerne,
            inkl. afdragsfrihedstillæg ved ≤60%.
          </p>
          <p>
            <strong style={{ color: C.text3 }}>Renter:</strong> Fast rente ~4%, F5 ~2,6%, F3 ~2,4%,
            Kort Rente ~2,3% (marts 2026).
          </p>
          <p>
            <strong style={{ color: C.text3 }}>60/4-reglen:</strong> Ved belåning {">"} 60% og
            gæld {">"} 4× bruttoindkomst kan man ikke vælge risikable lån (variabel rente uden
            renteloft, afdragsfrihed).
          </p>
          <p>
            <strong style={{ color: C.text3 }}>Investering:</strong> Lagerbeskatning 27%/42%.
            Afdragsscenariet inkl. faldende rente+bidrag og løbende lavere vægtet bidragssats, når
            LTV falder.
          </p>
          <p>
            <strong style={{ color: C.text3 }}>Skat:</strong> Netto bruger 33,7% fradragsværdi
            på de første {fmt(taxThreshold)} kr. af rente+bidrag pr. år og 25,7% derefter.
            Når Netto er valgt, kan du skifte mellem Enlig/Ægtepar for 50.000/100.000 kr.-grænsen.
            Afdrag er ikke fradragsberettiget.
          </p>
        </div>
      </div>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
