export const scenario = {
  slug: "live-earnings",
  theme: "earnings",
  eyebrow: "LIVE EARNINGS INTELLIGENCE",
  title: "The call changes the thesis.",
  subtitle: "Reconcile the quarter, update the operating view, then revise it before management moves to the next question.",
  trigger: "Northstar Cloud Q2 results posted. Revenue beats consensus by 4.1% as the earnings call begins.",
  prompt: "Is this a clean beat, and what should the analyst ask management next?",
  newEvidence: "CEO: A $28M three-year renewal closed two weeks early and was recognized in Q2.",
  artifactLabel: "LIVE RESEARCH BRIEF",
  emptyState: "The supported thesis will appear here.",
  sectionLabels: ["WHAT CHANGED", "WHY IT MATTERS", "ASK NEXT"],
  stages: ["Reconciling release and consensus", "Checking internal operating model", "Comparing prior guidance language", "Updating research brief"],
  replay: {
    ultrafast: { initial: [320, 440, 520, 600], revised: [260, 380, 420, 520] },
    standard: { initial: [1200, 1500, 1700, 1900], revised: [1050, 1350, 1650, 1800] }
  },
  artifacts: {
    initial: {
      headline: "Clean beat with durable enterprise strength",
      status: "Positive",
      summary: "Revenue, net retention, and operating margin all clear consensus. The first read supports raising the second-half revenue path.",
      change: "",
      primaryFinding: "Revenue is $428M, 4.1% above consensus; enterprise ARR growth accelerated to 29%.",
      impact: "The internal FY revenue case moves from $1.67B to $1.71B, with operating margin up 40 bps.",
      nextAction: "Ask whether enterprise acceleration reflects durable volume or deal timing.",
      confidence: 86,
      metrics: [
        { label: "REVENUE VS CONS.", value: "+4.1%", tone: "positive" },
        { label: "ENTERPRISE ARR", value: "+29%", tone: "positive" },
        { label: "FY MODEL", value: "$1.71B", tone: "positive" }
      ],
      sources: ["Q2 release §2", "Consensus sheet", "Internal model v17"]
    },
    revised: {
      headline: "Beat partly driven by contract timing",
      status: "Revised",
      summary: "The quarter still clears expectations, but most of the upside came from a renewal recognized earlier than modeled. The durable demand signal is narrower.",
      change: "CLEAN BEAT → TIMING-ASSISTED BEAT",
      primaryFinding: "$28M of Q2 revenue was pulled forward; normalized revenue beats consensus by only 0.8%.",
      impact: "Keep the FY revenue view at $1.68B and remove the assumed second-half acceleration.",
      nextAction: "Ask what portion of Q3 contracted revenue was consumed by the early renewal and whether billing terms changed.",
      confidence: 94,
      metrics: [
        { label: "NORMALIZED BEAT", value: "+0.8%", tone: "warning" },
        { label: "PULL-FORWARD", value: "$28M", tone: "negative" },
        { label: "FY MODEL", value: "$1.68B", tone: "neutral" }
      ],
      sources: ["Live transcript 14:32", "Q2 release §2", "Revenue bridge", "Internal model v18"]
    }
  },
  api: {
    role: "You are a senior equity research analyst updating a live, source-cited research brief.",
    context: `FICTIONAL COMPANY: Northstar Cloud\nQ2 revenue: $428M. Consensus: $411M. Internal model: $415M.\nEnterprise ARR growth: 29%; prior quarter: 24%. Net retention: 118%; consensus: 116%.\nOperating margin: 16.2%; consensus: 15.8%.\nPrior FY revenue guidance: $1.64B-$1.69B. Internal FY model: $1.67B.\nManagement's release says enterprise demand broadened and gives no timing caveat.\nSources available: Q2 release section 2, consensus sheet, internal model v17, prior-call transcript.`,
    newEvidence: `Live transcript 14:32 — CEO: "The Atlas renewal, a three-year $28M contract expected early in Q3, closed two weeks ahead of plan and was recognized in Q2."\nRevenue bridge confirms the $28M pull-forward. No other guidance change was announced.`
  }
};
