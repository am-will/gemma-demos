export const scenario = {
  slug: "portfolio-shock",
  theme: "portfolio",
  eyebrow: "PORTFOLIO SHOCK ANALYSIS",
  title: "Find the exposure no ticker shows.",
  subtitle: "A key materials plant shuts down. The model finds which portfolio companies rely on it, including through their suppliers, then reranks the biggest risks when the expected outage changes from 30 to 90 days.",
  trigger: "Kensei Materials halts production after a fire at its only high-purity resin plant.",
  prompt: "Which holdings are exposed, including indirect exposure, and what changes if disruption lasts 90 days?",
  newEvidence: "Scenario changed: 90-day outage and no replacement supplier qualifies before day 76.",
  artifactLabel: "RANKED EXPOSURE BRIEF",
  emptyState: "The portfolio exposure ranking will appear here.",
  sectionLabels: ["EXPOSURE CHAIN", "FINANCIAL IMPACT", "ANALYST PRIORITY"],
  stages: ["Mapping supplier relationships", "Reading inventory disclosures", "Recalculating revenue sensitivity", "Ranking portfolio attention"],
  replay: {
    ultrafast: { initial: [360, 480, 540, 620], revised: [280, 390, 470, 560] },
    standard: { initial: [1300, 1500, 1850, 2100], revised: [1100, 1400, 1750, 1950] }
  },
  artifacts: {
    initial: {
      headline: "Two direct holdings need review",
      status: "Elevated",
      summary: "Morrow Devices and Calder Optics name Kensei directly. Both carry enough inventory for a short disruption; no immediate portfolio-wide action is supported.",
      change: "",
      primaryFinding: "Morrow → Kensei resin; Calder → Kensei coating. Asteron appears unexposed in direct supplier records.",
      impact: "At 30 days, modeled EBITDA impact is below 2.4% for every holding.",
      nextAction: "Confirm Morrow's 42-day inventory buffer and Calder's alternate coating qualification.",
      confidence: 78,
      metrics: [
        { label: "DIRECT HOLDINGS", value: "2", tone: "warning" },
        { label: "HIGHEST EBITDA HIT", value: "−2.4%", tone: "warning" },
        { label: "REVIEW NOW", value: "MORROW", tone: "neutral" }
      ],
      sources: ["Kensei notice", "Morrow 10-Q", "Calder supplier note"]
    },
    revised: {
      headline: "Asteron becomes the highest-risk position",
      status: "Critical review",
      summary: "The 90-day case exposes a second-order dependency: Asteron's sole module assembler uses Kensei resin and has only 18 days of qualified stock.",
      change: "ASTERON #4 → #1 RISK",
      primaryFinding: "Asteron → Nori Modules → Kensei resin. No substitute completes qualification before inventory is exhausted.",
      impact: "Modeled Q3 revenue falls 11.6% and covenant headroom compresses from 3.1× to 1.5×.",
      nextAction: "Escalate Asteron first; verify covenant add-backs and Nori's allocation policy before changing the position.",
      confidence: 91,
      metrics: [
        { label: "ASTERON Q3 REV.", value: "−11.6%", tone: "negative" },
        { label: "INVENTORY BUFFER", value: "18 DAYS", tone: "negative" },
        { label: "COVENANT HEADROOM", value: "1.5×", tone: "warning" }
      ],
      sources: ["Nori qualification log", "Asteron 10-Q", "Supplier graph", "90-day scenario"]
    }
  },
  api: {
    role: "You are a portfolio risk analyst producing auditable decision support, never trading instructions.",
    context: `FICTIONAL EVENT: Kensei Materials' only high-purity resin plant is offline. Initial expected outage: 30 days.\nFICTIONAL PORTFOLIO:\nMorrow Devices 4.8% weight: names Kensei resin directly; 42 days inventory; modeled 30-day EBITDA impact -2.4%.\nCalder Optics 3.2% weight: uses Kensei coating; 51 days inventory; alternate supplier qualification expected day 35; impact -1.1%.\nAsteron Systems 5.4% weight: no direct Kensei link in its filings; sole module supplier is Nori Modules.\nNori Modules uses Kensei resin for 71% of Asteron-bound modules and has 18 days qualified stock.\nAsteron Q3 revenue base: $612M. Covenant headroom: 3.1x.\nSources: Kensei notice, portfolio holdings, supplier graph, company 10-Qs, internal models.`,
    newEvidence: `COUNTERFACTUAL: outage lasts 90 days. No replacement resin supplier qualifies until day 76. Nori allocates remaining stock pro rata and cannot redesign Asteron's module.\nGround-truth scenario model: Asteron Q3 revenue -11.6%; covenant headroom falls to 1.5x. Morrow EBITDA -7.9%; Calder EBITDA -4.2%.`
  }
};
