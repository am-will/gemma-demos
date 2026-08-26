export const scenario = {
  slug: "living-incident",
  theme: "incident",
  eyebrow: "",
  title: "Real Time Incident Intelligence",
  subtitle: "Payment approvals drop after a software release. The model investigates the cause, then updates the incident report when new trace data proves the first theory wrong.",
  trigger: "Payment approval rate drops 18.6% six minutes after checkout-api v2.41 deploys.",
  prompt: "What is causing the approval drop, and is rollback safe?",
  newEvidence: "Trace sample: gateway is healthy; duplicate retries saturate the internal connection pool at 98%.",
  artifactLabel: "LIVING INCIDENT REPORT",
  emptyState: "The supported root-cause brief will appear here.",
  sectionLabels: ["WHAT WE KNOW", "CUSTOMER IMPACT", "WHAT WE DO NEXT"],
  approvalLabel: "Approve rollback",
  stages: ["Joining logs, traces, and deploys", "Testing the leading hypothesis", "Running controlled replay", "Updating incident report"],
  replay: {
    ultrafast: { initial: [300, 430, 500, 560], revised: [250, 360, 430, 500] },
    standard: { initial: [1250, 1550, 1800, 2050], revised: [1150, 1450, 1700, 1950] }
  },
  artifacts: {
    initial: {
      headline: "External gateway degradation is the lead",
      status: "Investigating",
      summary: "Timeouts rise at the gateway boundary after the deploy. The external processor is the strongest initial hypothesis, but deployment correlation remains unresolved.",
      change: "",
      primaryFinding: "11.2% of authorization spans end in gateway timeout; public gateway status has no active incident.",
      impact: "Approval rate is down 18.6%, affecting an estimated 1,840 checkouts per minute.",
      nextAction: "Compare gateway server time with internal queue time and replay the new retry policy under load.",
      confidence: 62,
      metrics: [
        { label: "APPROVAL RATE", value: "−18.6%", tone: "negative" },
        { label: "GATEWAY TIMEOUTS", value: "11.2%", tone: "warning" },
        { label: "REVENUE / MIN", value: "$184K", tone: "negative" }
      ],
      sources: ["Alert PAY-1842", "Trace sample A", "Gateway status"]
    },
    revised: {
      headline: "Retry storm exhausts the connection pool",
      status: "Root cause supported",
      summary: "The gateway is healthy. A retry-policy change multiplies duplicate attempts, saturates the internal pool, and surfaces as misleading downstream timeouts.",
      change: "EXTERNAL GATEWAY → INTERNAL RETRY STORM",
      primaryFinding: "checkout-api v2.41 retries on client cancellation without jitter; attempts rise 3.7× as pool utilization reaches 98%.",
      impact: "The failure is internal and reversible. A controlled v2.40 replay restores approvals with no schema mismatch.",
      nextAction: "Rollback is validated and ready, but remains behind incident-commander approval.",
      confidence: 97,
      metrics: [
        { label: "POOL SATURATION", value: "98%", tone: "negative" },
        { label: "DUPLICATE ATTEMPTS", value: "3.7×", tone: "negative" },
        { label: "V2.40 REPLAY", value: "PASS", tone: "positive" }
      ],
      sources: ["Trace sample B", "Deploy diff v2.41", "Pool metrics", "Replay R-88"]
    }
  },
  api: {
    role: "You are a senior incident-response copilot maintaining a concise, evidence-linked report. You recommend actions but never deploy them.",
    context: `FICTIONAL INCIDENT PAY-1842\nAt 14:06 UTC checkout-api v2.41 deployed. At 14:12 approval rate fell from 92.4% to 73.8%.\n1,840 checkouts per minute are affected; estimated gross revenue at risk is $184K per minute.\n11.2% of authorization spans end with GATEWAY_TIMEOUT. External gateway public status is green.\nDeploy v2.41 changed retry behavior for client-cancelled requests from one retry to up to four retries.\nInitial trace sample A ends at the gateway client boundary and does not include pool wait time.\nSources: alert PAY-1842, trace sample A, deploy diff v2.41, gateway status, connection metrics, runbook RB-17.`,
    newEvidence: `Trace sample B includes internal timing: external gateway server time is normal at p95 182ms. Internal connection-pool wait reaches 4.8s and utilization is 98%. Duplicate authorization attempts rise 3.7x.\nControlled replay R-88 against v2.40 restores 92.1% approvals, passes schema checks, and creates no duplicate captures. Rollback still requires incident-commander approval.`
  }
};
