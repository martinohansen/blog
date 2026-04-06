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
} = window.RealkreditCalculations;

function TooltipShell({ title, children }) {
  return (
    <div
      style={{
        background: "#141b24ee",
        border: "1px solid #1e2a3a",
        borderRadius: 10,
        padding: "10px 14px",
        fontSize: 12,
        boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 6, color: "#8fa8c4" }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function ValueTooltipRow({ color, label, value, suffix = " kr." }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 20,
        marginBottom: 2,
      }}
    >
      <span style={{ color }}>{label}</span>
      <span className="mono" style={{ color: "#e8ecf1" }}>
        {value}
        {suffix}
      </span>
    </div>
  );
}

function CTip({ active, payload, label }) {
  if (!active || !payload?.length) {
    return null;
  }

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
        <div style={{ fontSize: 10, color: "#e07a5f", marginTop: 4 }}>
          Inkl. afdrag
        </div>
      )}
    </TooltipShell>
  );
}

function InvTip({ active, payload, label }) {
  if (!active || !payload?.length) {
    return null;
  }

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
        borderRadius: 5,
        overflow: "hidden",
        background: "#0a0f16",
      }}
    >
      <div
        style={{
          width: `${(rente / scale) * 100}%`,
          background: "#e07a5f",
          transition: "width 0.4s",
        }}
      />
      <div
        style={{
          width: `${(bidrag / scale) * 100}%`,
          background: "#c75f45",
          transition: "width 0.4s",
        }}
      />
      {afdrag > 0 && (
        <div
          style={{
            width: `${(afdrag / scale) * 100}%`,
            background: "#475569",
            transition: "width 0.4s",
          }}
        />
      )}
    </div>
  );
}

function EcbMsciTip({ active, payload, label, avgLabel }) {
  if (!active || !payload?.length) {
    return null;
  }

  const colors = { ecb: "#3b82f6", msci: "#34d399", avg: "#c9a87c" };
  const names = {
    ecb: "ECB MRO-rente",
    msci: "MSCI World (ann.)",
    avg: avgLabel,
  };

  return (
    <TooltipShell title={label}>
      {payload.map((entry) => (
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

  const chartData = useMemo(
    () => buildEcbMsciChartData(startYear, rollYears),
    [startYear, rollYears],
  );

  const avgLabel = `${rollYears}-års gns.`;

  return (
    <div
      className="card"
      style={{
        borderColor: "#2d4a6a55",
        background: "linear-gradient(135deg,#101828,#141e30)",
      }}
    >
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 14 }}>
        <div style={{ fontSize: 22 }}>📊</div>
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>
            <span className="glow">ECB-rente vs. MSCI World afkast</span>
          </h2>
          <p style={{ fontSize: 12, color: "#6b7f99", lineHeight: 1.5 }}>
            Kvartalsafkast annualiseret med rullende gennemsnit
          </p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: "#6b7f99" }}>Fra år</span>
            <span className="mono" style={{ fontSize: 14, fontWeight: 600, color: "#6db3e8" }}>
              {startYear}
            </span>
          </div>
          <input
            type="range"
            className="sl-blue"
            min={1999}
            max={2020}
            step={1}
            value={startYear}
            onChange={(event) => setStartYear(+event.target.value)}
          />
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: 3,
              fontSize: 9,
              color: "#3d5068",
            }}
          >
            <span>1999</span>
            <span>2020</span>
          </div>
        </div>
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: "#6b7f99" }}>Rullende gennemsnit</span>
            <span className="mono" style={{ fontSize: 14, fontWeight: 600, color: "#6db3e8" }}>
              {rollYears} år
            </span>
          </div>
          <input
            type="range"
            className="sl-blue"
            min={1}
            max={15}
            step={1}
            value={rollYears}
            onChange={(event) => setRollYears(+event.target.value)}
          />
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: 3,
              fontSize: 9,
              color: "#3d5068",
            }}
          >
            <span>1 år</span>
            <span>15 år</span>
          </div>
        </div>
      </div>

      <div style={{ fontSize: 11, color: "#6b7f99", marginBottom: 8 }}>
        {startYear}–2026 Q1 · Rullende gennemsnit:{" "}
        <strong style={{ color: "#c9a87c" }}>{rollYears} år</strong>
      </div>

      <div style={{ width: "100%", height: 280 }}>
        <ResponsiveContainer>
          <ComposedChart data={chartData} margin={{ top: 10, right: 8, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="gEcb" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.25} />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="gAvg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#c9a87c" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#c9a87c" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1a2332" />
            <XAxis
              dataKey="label"
              tick={{ fill: "#4a5e75", fontSize: 9 }}
              axisLine={{ stroke: "#1e2a3a" }}
              interval="preserveStartEnd"
              tickFormatter={(value) =>
                value && value.endsWith("Q1") ? value.replace(" Q1", "") : ""
              }
              minTickGap={30}
            />
            <YAxis
              tick={{ fill: "#4a5e75", fontSize: 10 }}
              axisLine={{ stroke: "#1e2a3a" }}
              tickFormatter={(value) => `${value}%`}
              width={45}
            />
            <Tooltip content={<EcbMsciTip avgLabel={avgLabel} />} />
            <ReferenceLine y={0} stroke="#3d5068" strokeWidth={1} />
            <Line
              type="monotone"
              dataKey="msci"
              stroke="#34d399"
              strokeWidth={2}
              dot={false}
              name="MSCI World (ann.)"
            />
            <Area
              type="monotone"
              dataKey="avg"
              stroke="#c9a87c"
              fill="url(#gAvg)"
              strokeWidth={2}
              dot={false}
              name={avgLabel}
            />
            <Area
              type="stepAfter"
              dataKey="ecb"
              stroke="#3b82f6"
              fill="url(#gEcb)"
              strokeWidth={2.5}
              dot={false}
              name="ECB MRO-rente"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 8, justifyContent: "center", fontSize: 11 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 4, color: "#3b82f6" }}>
          <span style={{ width: 14, height: 3, borderRadius: 2, background: "#3b82f6" }} />
          ECB MRO-rente
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4, color: "#34d399" }}>
          <span style={{ width: 14, height: 3, borderRadius: 2, background: "#34d399" }} />
          MSCI World (ann.)
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4, color: "#c9a87c" }}>
          <span style={{ width: 14, height: 3, borderRadius: 2, background: "#c9a87c" }} />
          {avgLabel}
        </span>
      </div>
      <p style={{ fontSize: 10, color: "#3d5068", marginTop: 10, lineHeight: 1.4, textAlign: "center" }}>
        ECB Main Refinancing Rate · MSCI World gross total return USD · Kilder: ECB, MSCI factsheets, ycharts
      </p>
    </div>
  );
}

function MilestoneCard({ milestone, showNet, maxBarVal }) {
  const gridColumns = `72px repeat(${milestone.rows.length}, 1fr)`;

  const renderMetricRow = (label, renderValue, extraStyle) => (
    <div className="row" style={{ gridTemplateColumns: gridColumns, ...extraStyle }}>
      <div className="lbl">{label}</div>
      {milestone.rows.map(({ loanType, breakdown }) => (
        <div
          key={loanType.id}
          className="mono"
          style={{ textAlign: "center", fontSize: 11 }}
        >
          {renderValue(breakdown, loanType)}
        </div>
      ))}
    </div>
  );

  return (
    <div>
      <div className="msc" style={{ borderColor: `${milestone.tc}33` }}>
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 3,
            background: milestone.tc,
          }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span className="mono" style={{ fontSize: 20, fontWeight: 700, color: milestone.tc }}>
            {milestone.ltv}%
          </span>
          <span className="tag" style={{ background: `${milestone.tc}22`, color: milestone.tc }}>
            {milestone.tag}
          </span>
        </div>
        <div style={{ fontSize: 11, color: "#6b7f99", marginBottom: 12 }}>
          {milestone.desc}
        </div>

        <div className="row" style={{ gridTemplateColumns: gridColumns }}>
          <div />
          {milestone.rows.map(({ loanType }) => (
            <div
              key={loanType.id}
              style={{
                textAlign: "center",
                color: loanType.color,
                fontWeight: 600,
                fontSize: 10,
              }}
            >
              {loanType.label}
            </div>
          ))}
        </div>

        {renderMetricRow("Rente", (result) => (
          <span style={{ color: "#e07a5f" }}>{fmtPct2(result.rentePct)}</span>
        ))}
        {renderMetricRow("Bidrag", (result) => fmtPct(result.bidragPct))}
        {renderMetricRow(
          "Samlet sats",
          (result) => <strong>{fmtPct2(result.rentePct + result.bidragPct)}</strong>,
          { borderTop: "1px solid #1a2332", paddingTop: 6 },
        )}

        <div className="sep" />

        {renderMetricRow("Rente kr./år", (result) => (
          <span style={{ color: "#e07a5f" }}>
            {fmt(Math.round(showNet ? result.renteKrN : result.renteKrB))}
          </span>
        ))}
        {renderMetricRow("Bidrag kr./år", (result) =>
          fmt(Math.round(showNet ? result.bidragKrN : result.bidragKrB)),
        )}
        {!milestone.af &&
          renderMetricRow("Afdrag kr./år", (result) => (
            <span style={{ color: "#94a3b8" }}>{fmt(Math.round(result.afdragKr))}</span>
          ))}

        <div style={{ marginTop: 8 }}>
          <div style={{ display: "flex", gap: 10, marginBottom: 4, fontSize: 10 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
              <span
                style={{
                  width: 10,
                  height: 8,
                  borderRadius: 2,
                  background: "#e07a5f",
                  display: "inline-block",
                }}
              />
              Rente
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
              <span
                style={{
                  width: 10,
                  height: 8,
                  borderRadius: 2,
                  background: "#c75f45",
                  display: "inline-block",
                }}
              />
              Bidrag
            </span>
            {!milestone.af && (
              <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                <span
                  style={{
                    width: 10,
                    height: 8,
                    borderRadius: 2,
                    background: "#475569",
                    display: "inline-block",
                  }}
                />
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
            <strong style={{ color: "#94a3b8" }}>{fmt(Math.round(result.afdragKr))}</strong>
          ))}
        {renderMetricRow(
          "Mdl. total",
          (result) => (
            <span style={{ fontSize: 13, fontWeight: 700, color: milestone.tc }}>
              {fmt(Math.round((showNet ? result.totalN : result.totalB) / 12))}
            </span>
          ),
          {
            background: "#0a0f16",
            borderRadius: 8,
            padding: "8px 6px",
            marginTop: 6,
          },
        )}

        {!milestone.af && (
          <div style={{ fontSize: 10, color: "#3d5068", marginTop: 4 }}>
            Afdrag er opsparing i boligen — du får pengene igen ved salg/omlægning
          </div>
        )}
      </div>

    </div>
  );
}

function App() {
  const [loanAmount, setLoanAmount] = useState(3000000);
  const [selectedTypes, setSelectedTypes] = useState(() =>
    LOAN_TYPES.map((loanType) => loanType.id),
  );
  const [showNet, setShowNet] = useState(false);
  const [chartMode, setChartMode] = useState("total");
  const [investReturn, setInvestReturn] = useState(7);
  const [investYears, setInvestYears] = useState(15);
  const [taxHousehold, setTaxHousehold] = useState("single");

  const activeLoanTypes = LOAN_TYPES.filter((loanType) => selectedTypes.includes(loanType.id));
  const activeTypeKey = activeLoanTypes.map((loanType) => loanType.id).join(",");
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

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0c1117",
        color: "#e8ecf1",
        fontFamily: "'DM Sans','Segoe UI',sans-serif",
        padding: "20px 16px",
      }}
    >
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <div style={{ marginBottom: 18 }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: "#4a90c4",
              letterSpacing: 2,
              textTransform: "uppercase",
              marginBottom: 6,
            }}
          >
            Nordea Kredit · Helårsbolig · Feb 2026
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.25, marginBottom: 6 }}>
            Belåningsmilepæle: <span className="glow">80% → 60% → 40%</span>
          </h1>
          <p style={{ fontSize: 12, color: "#6b7f99", lineHeight: 1.5 }}>
            Fra tvunget afdrag til afdragsfrihed — og hvad det reelt koster og giver at
            investere i stedet for at afdrage.
          </p>
        </div>

        <div
          className="card"
          style={{ borderColor: "#2d4a6a", background: "linear-gradient(135deg,#0f1a28,#162030)" }}
        >
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <div style={{ fontSize: 20 }}>⚖️</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4, color: "#8fc9e8" }}>
                60/4-reglen
              </div>
              <p style={{ fontSize: 12, color: "#7a99b8", lineHeight: 1.7 }}>
                Hvis belåningsgraden er over <strong style={{ color: "#e8ecf1" }}>60%</strong>{" "}
                <em>og</em> den samlede gæld er mere end{" "}
                <strong style={{ color: "#e8ecf1" }}>4 gange husstandens bruttoindkomst</strong>,
                kan du ikke vælge et "risikabelt lån" (variabel rente uden renteloft eller
                afdragsfrihed).
              </p>
              <p style={{ fontSize: 11, color: "#5a7a9a", lineHeight: 1.6, marginTop: 6 }}>
                Begge betingelser skal være opfyldt. Har du lav gældsfaktor ({`<`} 4× indkomst)
                kan du godt vælge flekslån over 60% — men afdragsfrihed kræver stadig belåning
                under 60%.
              </p>
            </div>
          </div>
        </div>

        <div className="card" style={{ padding: 16 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              marginBottom: 10,
            }}
          >
            <span style={{ fontSize: 11, color: "#6b7f99" }}>Restgæld</span>
            <span className="mono" style={{ fontSize: 20, fontWeight: 600 }}>
              {fmt(loanAmount)} kr.
            </span>
          </div>
          <input
            type="range"
            className="sl-blue"
            min={500000}
            max={6000000}
            step={100000}
            value={loanAmount}
            onChange={(event) => setLoanAmount(+event.target.value)}
          />
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: 4,
              fontSize: 10,
              color: "#3d5068",
            }}
          >
            <span>500.000</span>
            <span>6.000.000</span>
          </div>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14, alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "#6b7f99", marginRight: 2 }}>Vælg lån:</span>
          {LOAN_TYPES.map((loanType) => (
            <button
              key={loanType.id}
              type="button"
              className={`pill ${selectedTypes.includes(loanType.id) ? "active" : ""}`}
              style={{
                background: selectedTypes.includes(loanType.id) ? `${loanType.color}22` : "transparent",
                color: loanType.color,
              }}
              onClick={() => toggleLoanType(loanType.id)}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: loanType.color,
                }}
              />
              {loanType.label}
            </button>
          ))}
          <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
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
            <button className={`tb ${showNet ? "on" : ""}`} onClick={() => setShowNet(true)}>
              Netto
            </button>
            <button className={`tb ${!showNet ? "on" : ""}`} onClick={() => setShowNet(false)}>
              Brutto
            </button>
          </div>
        </div>

        <div className="card">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              marginBottom: 12,
              flexWrap: "wrap",
              gap: 8,
            }}
          >
            <div>
              <h2 style={{ fontSize: 13, fontWeight: 600, color: "#8fa8c4" }}>
                Samlet ud af lommen pr. år
              </h2>
              <p style={{ fontSize: 10, color: "#4a5e75", marginTop: 2 }}>
                {showNet ? `Netto efter skat · ${taxHouseholdLabel}` : "Brutto"} · Belåning høj → lav
              </p>
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              <button className={`tb ${chartMode === "total" ? "on" : ""}`} onClick={() => setChartMode("total")}>
                Inkl. afdrag
              </button>
              <button className={`tb ${chartMode === "ydelse" ? "on" : ""}`} onClick={() => setChartMode("ydelse")}>
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
                      <stop offset="0%" stopColor={loanType.color} stopOpacity={0.25} />
                      <stop offset="100%" stopColor={loanType.color} stopOpacity={0.02} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a2332" />
                <XAxis
                  dataKey="ltv"
                  type="number"
                  domain={[10, 80]}
                  ticks={[10, 20, 30, 40, 50, 60, 70, 80]}
                  tickFormatter={(value) => `${value}%`}
                  tick={{ fill: "#4a5e75", fontSize: 10 }}
                  axisLine={{ stroke: "#1e2a3a" }}
                  reversed
                />
                <YAxis
                  tickFormatter={(value) => `${Math.round(value / 1000)}k`}
                  tick={{ fill: "#4a5e75", fontSize: 10 }}
                  axisLine={{ stroke: "#1e2a3a" }}
                  width={45}
                />
                <Tooltip content={<CTip />} />
                <ReferenceLine x={80} stroke="#e07a5f" strokeDasharray="4 4" strokeWidth={1.5} />
                <ReferenceLine x={60} stroke="#6db3e8" strokeDasharray="4 4" strokeWidth={1.5} />
                <ReferenceLine x={40} stroke="#34d399" strokeDasharray="4 4" strokeWidth={1.5} />
                {activeLoanTypes.map((loanType) => (
                  <Area
                    key={loanType.id}
                    type="linear"
                    dataKey={`${loanType.id}${cSuffix}`}
                    stroke={loanType.color}
                    fill={`url(#g-${loanType.id})`}
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{
                      r: 4,
                      stroke: loanType.color,
                      fill: "#0c1117",
                      strokeWidth: 2,
                    }}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 6, justifyContent: "center" }}>
            {activeLoanTypes.map((loanType) => (
              <span
                key={loanType.id}
                style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: loanType.color }}
              >
                <span style={{ width: 14, height: 3, borderRadius: 2, background: loanType.color }} />
                {loanType.label} ({loanType.rateLabel})
              </span>
            ))}
          </div>
          <div style={{ display: "flex", marginTop: 12, fontSize: 10, borderRadius: 8, overflow: "hidden" }}>
            <div
              style={{
                flex: 2,
                background: "#e07a5f18",
                padding: "6px 8px",
                borderRight: "1px solid #1e2a3a",
                textAlign: "center",
              }}
            >
              <div style={{ color: "#e07a5f", fontWeight: 600 }}>60–80%</div>
              <div style={{ color: "#6b7f99" }}>Tvunget afdrag</div>
            </div>
            <div
              style={{
                flex: 2,
                background: "#6db3e818",
                padding: "6px 8px",
                borderRight: "1px solid #1e2a3a",
                textAlign: "center",
              }}
            >
              <div style={{ color: "#6db3e8", fontWeight: 600 }}>40–60%</div>
              <div style={{ color: "#6b7f99" }}>Afdragsfri mulig</div>
            </div>
            <div style={{ flex: 3, background: "#34d39918", padding: "6px 8px", textAlign: "center" }}>
              <div style={{ color: "#34d399", fontWeight: 600 }}>Under 40%</div>
              <div style={{ color: "#6b7f99" }}>Laveste bidrag</div>
            </div>
          </div>
        </div>

        <div className="card">
          <h2 style={{ fontSize: 13, fontWeight: 600, color: "#8fa8c4", marginBottom: 14 }}>
            Milepæle — rente, bidrag og afdrag
          </h2>
          {milestoneData.map((milestone) => (
            <MilestoneCard
              key={milestone.ltv}
              milestone={milestone}
              showNet={showNet}
              maxBarVal={maxBarVal}
            />
          ))}
        </div>

        <div
          className="card"
          style={{ borderColor: "#92400e55", background: "linear-gradient(135deg,#1a1710,#1f1c14)" }}
        >
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 14 }}>
            <div style={{ fontSize: 22 }}>📈</div>
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>
                <span className="glow-gold">Afdragsfri + investér vs. fortsæt afdrag</span>
              </h2>
              <p style={{ fontSize: 12, color: "#9a8a6e", lineHeight: 1.6 }}>
                Udgangspunkt: 60% LTV. Pengene er de samme i begge scenarier — enten som egenkapital
                i boligen (afdrag) eller som indskud i en portefølje (investering). Forskellen er
                udelukkende:
              </p>
              <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12 }}>
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 3,
                      background: "#c9a87c",
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ color: "#c9a87c" }}>
                    <strong>Afkast</strong>
                  </span>
                  <span style={{ color: "#7a6a4e" }}>
                    — hvad investeringen kaster af sig (efter lagerbeskatning)
                  </span>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12 }}>
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 3,
                      background: "#e07a5f",
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ color: "#e07a5f" }}>
                    <strong>Ekstra rente+bidrag</strong>
                  </span>
                  <span style={{ color: "#7a6a4e" }}>— prisen for at holde højere gæld</span>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12 }}>
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 3,
                      background: "#34d399",
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ color: "#34d399" }}>
                    <strong>Netto afkast</strong>
                  </span>
                  <span style={{ color: "#7a6a4e" }}>
                    — afkast minus meromkostning = den reelle gevinst/tab
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 11, color: "#9a8a6e" }}>Forventet afkast</span>
                <span className="mono" style={{ fontSize: 14, fontWeight: 600, color: "#c9a87c" }}>
                  {fmtPct1(investReturn)}
                </span>
              </div>
              <input
                type="range"
                className="sl-amber"
                min={0}
                max={20}
                step={0.5}
                value={investReturn}
                onChange={(event) => setInvestReturn(+event.target.value)}
              />
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3, fontSize: 9, color: "#3d4028" }}>
                <span>0%</span>
                <span>20%</span>
              </div>
            </div>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 11, color: "#9a8a6e" }}>Tidshorisont</span>
                <span className="mono" style={{ fontSize: 14, fontWeight: 600, color: "#c9a87c" }}>
                  {investYears} år
                </span>
              </div>
              <input
                type="range"
                className="sl-amber"
                min={5}
                max={30}
                step={1}
                value={investYears}
                onChange={(event) => setInvestYears(+event.target.value)}
              />
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3, fontSize: 9, color: "#3d4028" }}>
                <span>5 år</span>
                <span>30 år</span>
              </div>
            </div>
          </div>

          {investChartType && (
            <>
              <div style={{ fontSize: 11, color: "#6b7f99", marginBottom: 8 }}>
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
                        <stop offset="0%" stopColor="#c9a87c" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#c9a87c" stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="gNet" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#34d399" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="#34d399" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1a2332" />
                    <XAxis
                      dataKey="year"
                      tick={{ fill: "#4a5e75", fontSize: 10 }}
                      axisLine={{ stroke: "#1e2a3a" }}
                      label={{
                        value: "År",
                        position: "insideBottomRight",
                        offset: -5,
                        fill: "#3d5068",
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
                      tick={{ fill: "#4a5e75", fontSize: 10 }}
                      axisLine={{ stroke: "#1e2a3a" }}
                      width={48}
                    />
                    <Tooltip content={<InvTip />} />
                    <ReferenceLine y={0} stroke="#3d5068" strokeWidth={1} />
                    <Area type="monotone" dataKey="afkast" stroke="#c9a87c" fill="url(#gAfk)" strokeWidth={2} dot={false} />
                    <Line
                      type="monotone"
                      dataKey="extraCost"
                      stroke="#e07a5f"
                      strokeWidth={2}
                      strokeDasharray="6 3"
                      dot={false}
                    />
                    <Area
                      type="monotone"
                      dataKey="nettoAfkast"
                      stroke="#34d399"
                      fill="url(#gNet)"
                      strokeWidth={2.5}
                      dot={false}
                      activeDot={{
                        r: 4,
                        stroke: "#34d399",
                        fill: "#0c1117",
                        strokeWidth: 2,
                      }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center", fontSize: 11, marginBottom: 14 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ width: 14, height: 3, borderRadius: 2, background: "#c9a87c" }} />
                  Afkast (efter inv.skat)
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ width: 14, height: 3, borderRadius: 2, background: "#e07a5f", opacity: 0.7 }} />
                  Ekstra rente+bidrag (kum.)
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ width: 14, height: 3, borderRadius: 2, background: "#34d399" }} />
                  Netto afkast
                </span>
              </div>
            </>
          )}

          <div style={{ display: "grid", gridTemplateColumns: `repeat(${activeLoanTypes.length}, 1fr)`, gap: 10 }}>
            {activeLoanTypes.map((loanType) => {
              const series = investData[loanType.id];
              if (!series) {
                return null;
              }

              const finalPoint = series[series.length - 1];
              const positive = finalPoint.nettoAfkast > 0;

              return (
                <div
                  key={loanType.id}
                  style={{
                    background: "#0e1117",
                    borderRadius: 12,
                    padding: 14,
                    border: `1px solid ${loanType.color}22`,
                  }}
                >
                  <div
                    style={{
                      fontSize: 10,
                      color: loanType.color,
                      fontWeight: 600,
                      marginBottom: 8,
                      textAlign: "center",
                    }}
                  >
                    {loanType.label} · {investYears} år
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#6b7f99", marginBottom: 2 }}>
                    <span>Afkast</span>
                    <span className="mono" style={{ color: "#c9a87c" }}>
                      +{fmt(finalPoint.afkast)}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#6b7f99", marginBottom: 2 }}>
                    <span>Ekstra rente+bidrag</span>
                    <span className="mono" style={{ color: "#e07a5f" }}>
                      −{fmt(finalPoint.extraCost)}
                    </span>
                  </div>
                  <div className="sep" style={{ margin: "6px 0" }} />
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 700 }}>
                    <span style={{ color: positive ? "#34d399" : "#e07a5f" }}>Netto afkast</span>
                    <span className="mono" style={{ color: positive ? "#34d399" : "#e07a5f" }}>
                      {positive ? "+" : ""}
                      {fmt(finalPoint.nettoAfkast)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ fontSize: 10, color: "#3d3520", marginTop: 14, lineHeight: 1.6 }}>
            <strong style={{ color: "#6b5a3a" }}>Sådan læses grafen:</strong> Hovedstolen
            (indskud vs. egenkapital) holdes ude — den er ens i begge scenarier. "Afkast" er ren
            merværdi fra investering efter lagerbeskatning. "Ekstra rente+bidrag" er den
            akkumulerede meromkostning ved at holde konstant gæld i stedet for at afdrage. Når den
            grønne linje er over nul, tjener du på at investere.
          </div>
          <div style={{ fontSize: 10, color: "#2d2a1a", marginTop: 6, lineHeight: 1.5 }}>
            Lagerbeskatning: 27% op til 61.000 kr., 42% derover. Ved afdrag falder den vægtede
            bidragssats løbende, efterhånden som LTV falder. Inkluderet i beregningen.
          </div>
        </div>

        <EcbMsciChart />

        <div style={{ fontSize: 10, color: "#3d5068", lineHeight: 1.6, padding: "0 4px" }}>
          <p>
            <strong style={{ color: "#4a5e75" }}>Bidragssatser:</strong> Nordea Kredit, nye lån fra
            23. feb. 2026, helårsbolig. Beregnet som vægtet sats over belåningsintervallerne,
            inkl. afdragsfrihedstillæg ved ≤60%.
          </p>
          <p>
            <strong style={{ color: "#4a5e75" }}>Renter:</strong> Fast rente ~4%, F5 ~2,6%, F3 ~2,4%,
            Kort Rente ~2,3% (marts 2026).
          </p>
          <p>
            <strong style={{ color: "#4a5e75" }}>60/4-reglen:</strong> Ved belåning {">"} 60% og
            gæld {">"} 4× bruttoindkomst kan man ikke vælge risikable lån (variabel rente uden
            renteloft, afdragsfrihed).
          </p>
          <p>
            <strong style={{ color: "#4a5e75" }}>Investering:</strong> Lagerbeskatning 27%/42%.
            Afdragsscenariet inkl. faldende rente+bidrag og løbende lavere vægtet bidragssats, når
            LTV falder.
          </p>
          <p>
            <strong style={{ color: "#4a5e75" }}>Skat:</strong> Netto bruger 33,7% fradragsværdi
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
