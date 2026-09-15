// Fictional snapshot. Values are USD; prices and returns are synthetic, never live quotes.
export const asOf = "2026-09-09";
export const profile = {
  name: "Alex Morgan",
  age: 32,
  location: "Denver, CO",
  currency: "USD",
  monthlyNetIncome: 8200,
  monthlyGrossIncome: 11250,
  goals: [
    { name: "First home", target: 100000, date: "2027-09-09" },
    { name: "Emergency fund", target: 24000 },
  ],
  assumptions:
    "Single income, no dependents. All balances and prices are fictional.",
};
export const accounts = [
  { name: "Everyday checking", type: "cash", balance: 12450 },
  { name: "High-yield savings", type: "cash", balance: 48200 },
  { name: "Roth IRA", type: "retirement", balance: 34200 },
  { name: "401(k)", type: "retirement", balance: 78500 },
];
export const holdings = [
  {
    symbol: "NVDA",
    name: "NVIDIA",
    shares: 120,
    previousPrice: 150,
    price: 138,
    sector: "Technology",
    techWeight: 1,
  },
  {
    symbol: "AAPL",
    name: "Apple",
    shares: 65,
    previousPrice: 230,
    price: 223.1,
    sector: "Technology",
    techWeight: 1,
  },
  {
    symbol: "MSFT",
    name: "Microsoft",
    shares: 35,
    previousPrice: 500,
    price: 480,
    sector: "Technology",
    techWeight: 1,
  },
  {
    symbol: "VTI",
    name: "Total US stock market ETF",
    shares: 90,
    previousPrice: 300,
    price: 295.5,
    sector: "Broad market",
    techWeight: 0.34,
  },
  {
    symbol: "VXUS",
    name: "International stock ETF",
    shares: 150,
    previousPrice: 65,
    price: 65.65,
    sector: "International",
    techWeight: 0.13,
  },
  {
    symbol: "BND",
    name: "Total bond market ETF",
    shares: 100,
    previousPrice: 73,
    price: 73.365,
    sector: "Bonds",
    techWeight: 0,
  },
];
export const debts = [
  { name: "Student loan", balance: 18200, apr: 4.6, monthlyPayment: 280 },
  { name: "Auto loan", balance: 11400, apr: 6.2, monthlyPayment: 340 },
  { name: "Credit card", balance: 1840, apr: 22.9, monthlyPayment: 120 },
];
const categories = {
  Housing: 2200,
  Groceries: 540,
  Dining: 420,
  Transport: 210,
  Utilities: 240,
  Shopping: 280,
  Subscriptions: 95,
  Insurance: 180,
  Health: 135,
};
// Illustrative merchant-level transactions; weights split the existing monthly
// category budgets exactly, preserving the home-buying and cash-flow scenarios.
const expenseDetails = {
  Housing: [["Parkside Apartments", 1]],
  Groceries: [["King Soopers", 36], ["Trader Joe's", 29], ["Whole Foods", 21], ["King Soopers", 14]],
  Dining: [["DoorDash", 21], ["Starbucks", 8], ["Chipotle", 12], ["DoorDash", 18], ["Local brunch cafe", 17], ["Starbucks", 7], ["Sushi dinner", 17]],
  Transport: [["Shell", 45], ["RTD transit pass", 35], ["Uber", 20]],
  Utilities: [["Xcel Energy", 65], ["Xfinity Internet", 35]],
  Shopping: [["Amazon", 32], ["Target", 24], ["Nike", 27], ["Amazon", 17]],
  Subscriptions: [["Netflix", 23], ["Spotify", 12], ["YouTube Premium", 14], ["Adobe Photography", 20], ["iCloud+", 3], ["Hulu", 19], ["Audible", 12]],
  Insurance: [["State Farm", 1]],
  Health: [["Gym membership", 55], ["Walgreens", 25], ["Dental copay", 20]],
};
export const transactions = ["2026-06", "2026-07", "2026-08"].flatMap(
  (month, i) => Object.entries(categories).flatMap(([category, amount], j) => {
    const total = Math.round(amount * (category === "Housing" ? 1 : [0.92, 1, 1.08][i]));
    const details = expenseDetails[category];
    const weightTotal = details.reduce((n, [, weight]) => n + weight, 0);
    let allocated = 0;
    return details.map(([merchant, weight], k) => {
      const cents = k === details.length - 1 ? total * 100 - allocated : Math.round(total * 100 * weight / weightTotal);
      allocated += cents;
      return {
        id: `${month}-${j}-${k}`,
        date: `${month}-${String(2 + ((j * 3 + k * 4) % 26)).padStart(2, "0")}`,
        merchant, category, amount: cents / 100,
        recurring: ["Housing", "Subscriptions", "Utilities", "Insurance"].includes(category) || merchant === "Gym membership",
      };
    });
  }),
);
export const round = (value) =>
  Math.round((value + Number.EPSILON) * 100) / 100;
const sum = (rows, fn) =>
  round(rows.reduce((total, row) => total + fn(row), 0));
export function portfolio() {
  const positions = holdings.map((h) => ({
    ...h,
    value: round(h.shares * h.price),
    previousValue: round(h.shares * h.previousPrice),
    change: round(h.shares * (h.price - h.previousPrice)),
    returnPct: round((h.price / h.previousPrice - 1) * 100),
  }));
  const value = sum(positions, (p) => p.value),
    previousValue = sum(positions, (p) => p.previousValue);
  return {
    kind: "portfolio",
    title: "This week’s portfolio",
    period: "Sep 2–9, 2026",
    value,
    previousValue,
    change: round(value - previousValue),
    returnPct: round((value / previousValue - 1) * 100),
    positions: positions.map((p) => ({
      ...p,
      weightPct: round((p.value / value) * 100),
    })),
    techExposure: sum(positions, (p) => p.value * p.techWeight),
    techExposurePct: round(
      (sum(positions, (p) => p.value * p.techWeight) / value) * 100,
    ),
    note: "Taxable brokerage only. No deposits, withdrawals, dividends or trades this week. ETF sector weights are mock estimates; retirement fund holdings are not supplied.",
  };
}
export function spending(month = "2026-08", category) {
  if (!["2026-06", "2026-07", "2026-08"].includes(month))
    throw new Error("Available complete months: 2026-06, 2026-07, 2026-08.");
  if (category && !Object.hasOwn(categories, category))
    throw new Error(
      "Unknown category. Use an exact category from the spending summary.",
    );
  const rows = transactions.filter(
    (t) => t.date.startsWith(month) && (!category || t.category === category),
  );
  return {
    kind: "spending",
    title: "Where your money goes",
    month,
    total: sum(rows, (t) => t.amount),
    categories: Object.keys(categories)
      .filter((c) => !category || c === category)
      .map((name) => ({
        name,
        amount: sum(
          rows.filter((t) => t.category === name),
          (t) => t.amount,
        ),
      })),
    merchants: [...new Set(rows.map((t) => t.merchant))].map((merchant) => {
      const charges = rows.filter((t) => t.merchant === merchant);
      return { merchant, category: charges[0].category, amount: sum(charges, (t) => t.amount), count: charges.length };
    }).sort((a, b) => b.amount - a.amount),
    subscriptions: rows.filter((t) => t.category === "Subscriptions"),
    transactions: rows,
    note: "Living expenses only; debt payments and savings/investment transfers are separate.",
  };
}
export function cashflow() {
  const livingExpenses = spending().total,
    debtPayments = sum(debts, (d) => d.monthlyPayment),
    investmentContribution = 600;
  return {
    kind: "cashflow",
    title: "Your monthly cash flow",
    monthlyNetIncome: profile.monthlyNetIncome,
    livingExpenses,
    debtPayments,
    investmentContribution,
    availableMonthly: round(
      profile.monthlyNetIncome -
        livingExpenses -
        debtPayments -
        investmentContribution,
    ),
    basis:
      "August 2026 spending repeated monthly; income and expenses held constant.",
    note: "Take-home income already excludes payroll deductions, including 401(k). The $600 contribution is an additional taxable brokerage transfer.",
  };
}
export function overview() {
  const p = portfolio(),
    cash = sum(
      accounts.filter((a) => a.type === "cash"),
      (a) => a.balance,
    ),
    retirement = sum(
      accounts.filter((a) => a.type === "retirement"),
      (a) => a.balance,
    ),
    debt = sum(debts, (d) => d.balance);
  return {
    kind: "overview",
    title: "Your financial picture",
    asOf,
    profile,
    accounts,
    debts,
    cash,
    retirement,
    brokerage: p.value,
    totalDebt: debt,
    netWorth: round(cash + retirement + p.value - debt),
    weekChange: p.change,
    weekReturnPct: p.returnPct,
    cashflow: cashflow(),
  };
}
function number(value, fallback, min, max, name) {
  const n = value ?? fallback;
  if (typeof n !== "number" || !Number.isFinite(n) || n < min || n > max)
    throw new Error(`${name} must be a number from ${min} to ${max}.`);
  return n;
}
export function homePlan(args = {}) {
  const months = number(args.months, 12, 0, 120, "months");
  if (!Number.isInteger(months))
    throw new Error("months must be a whole number.");
  const reserveMonths = number(args.reserveMonths, 6, 0, 24, "reserveMonths");
  const closingCosts = number(
    args.closingCosts,
    12000,
    0,
    200000,
    "closingCosts",
  );
  if (
    args.includeBrokerage != null &&
    typeof args.includeBrokerage !== "boolean"
  )
    throw new Error("includeBrokerage must be boolean.");
  const c = cashflow(),
    o = overview();
  const monthlySavings = number(
    args.monthlySavings,
    c.availableMonthly,
    0,
    c.availableMonthly,
    "monthlySavings",
  );
  const reserve = round((c.livingExpenses + c.debtPayments) * reserveMonths);
  const brokerageProceeds = args.includeBrokerage ? o.brokerage : 0;
  const projectedCash = round(
    o.cash + monthlySavings * months + brokerageProceeds,
  );
  return {
    kind: "home",
    title: "Your down-payment scenario",
    months,
    reserveMonths,
    reserve,
    closingCosts,
    monthlySavings,
    startingCash: o.cash,
    brokerageProceeds,
    projectedCash,
    maxDownPayment: round(Math.max(0, projectedCash - reserve - closingCosts)),
    shortfall: round(Math.max(0, reserve + closingCosts - projectedCash)),
    assumptions:
      "Cash-budget ceiling, not mortgage qualification or a home-price estimate. No investment growth, interest or inflation. Retirement excluded. Brokerage liquidation, if included, is gross of unknown capital-gains taxes. Existing $600/month investment contribution continues.",
  };
}
export function homeAffordability(args = {}) {
  const months = number(args.months, 0, 0, 120, "months");
  if (!Number.isInteger(months)) throw Error("months must be a whole number.");
  const ratePct = number(args.ratePct, 6.5, 0, 20, "ratePct");
  const c = cashflow(), o = overview();
  const nonHousingExpenses = c.livingExpenses - categories.Housing;
  const projectedCash = round(o.cash + c.availableMonthly * months);
  // Illustrative planning assumptions, not live rates or lending rules.
  const buffer = 750, closingPct = .03, taxPct = .01, maintenancePct = .01;
  const insurance = 150, hoa = 100, pmiPct = .005;
  const housingBudget = Math.min(profile.monthlyGrossIncome * .28,
    profile.monthlyGrossIncome * .36 - c.debtPayments,
    profile.monthlyNetIncome - nonHousingExpenses - c.debtPayments - c.investmentContribution - buffer);
  const r = ratePct / 1200, n = 360;
  const paymentFactor = r === 0 ? 1 / n : r / (1 - (1 + r) ** -n);
  function atPrice(price) {
    const taxes = price * taxPct / 12, maintenance = price * maintenancePct / 12;
    let down = 0;
    // Cash = down payment + closing costs + six months of post-purchase essentials.
    // Solve directly for each PMI band; select the band consistent with its down payment.
    for (const withPmi of [false, true]) {
      const factor = paymentFactor + (withPmi ? pmiPct / 12 : 0);
      const candidate = (projectedCash - price * closingPct - 6 * (nonHousingExpenses + c.debtPayments + price * factor + taxes + maintenance + insurance + hoa)) / (1 - 6 * factor);
      down = Math.min(price, Math.max(0, candidate));
      if ((down / Math.max(price, 1) < .2) === withPmi) break;
    }
    const loan = price - down;
    const principalInterest = loan * paymentFactor;
    const pmi = down < price * .2 ? loan * pmiPct / 12 : 0;
    const monthlyTotal = principalInterest + taxes + maintenance + insurance + hoa + pmi;
    const reserve = 6 * (nonHousingExpenses + c.debtPayments + monthlyTotal);
    return { price, downPayment: down, loan, principalInterest, taxes, maintenance, insurance, hoa, pmi,
      monthlyTotal, reserve, closingCosts: price * closingPct,
      feasible: down >= price * .05 && monthlyTotal <= housingBudget && down + price * closingPct + reserve <= projectedCash + .01 };
  }
  let low = 0, high = 2000000;
  for (let i = 0; i < 70; i++) { const mid = (low + high) / 2; if (atPrice(mid).feasible) low = mid; else high = mid; }
  const result = atPrice(Math.floor(low / 1000) * 1000);
  return {
    kind: "affordability", title: "Your home-buying budget", months, ratePct,
    estimatedHomePrice: result.feasible ? result.price : 0,
    ...Object.fromEntries(Object.entries(result).filter(([k,v]) => typeof v === "number" && k !== "price").map(([k,v]) => [k, round(v)])),
    totalCashRequired: round(result.downPayment + result.closingCosts + result.reserve),
    additionalSavingsNeeded: round(Math.max(0, result.downPayment + result.closingCosts + result.reserve - o.cash)),
    monthlySavingsGoal: months > 0 ? round(Math.max(0, result.downPayment + result.closingCosts + result.reserve - o.cash) / months) : 0,
    downPaymentPct: round(result.downPayment / Math.max(result.price, 1) * 100),
    savingsMilestones: Array.from({length: Math.ceil(months / 3)}, (_, i) => {
      const month = Math.min(months, (i + 1) * 3);
      return { month, totalCash: round(o.cash + c.availableMonthly * month), newSavings: round(c.availableMonthly * month) };
    }),
    projectedCash, housingBudget: round(housingBudget), monthlyNetIncome: profile.monthlyNetIncome,
    monthlyGrossIncome: profile.monthlyGrossIncome, debtPayments: c.debtPayments,
    nonHousingExpenses, investmentContribution: c.investmentContribution,
    monthlyRemaining: round(profile.monthlyNetIncome - nonHousingExpenses - c.debtPayments - c.investmentContribution - result.monthlyTotal),
    assumptions: "Illustrative estimate, not mortgage approval. 30-year fixed loan; assumed rate, not a live quote. 3% closing costs, 1% annual property tax, 1% maintenance, $150/month insurance, $100 HOA, 0.5% annual PMI below 20% down, 5% minimum down. Planning caps: 28% gross income for housing and 36% including existing debts, plus a $750 monthly cash cushion. Six months of post-purchase expenses and debt payments retained; brokerage and retirement untouched. Current rent is replaced by the new housing cost, not counted twice. Future scenarios hold income, prices, rates and expenses constant.",
  };
}

export function simulate(args) {
  const amount = number(args.amount, undefined, 0, 1000000, "amount");
  const p = portfolio(),
    source = p.positions.find((h) => h.symbol === args.fromSymbol),
    target = p.positions.find((h) => h.symbol === args.toSymbol);
  if (!source || !target || source === target)
    throw new Error(
      "Choose two different existing symbols: NVDA, AAPL, MSFT, VTI, VXUS, BND.",
    );
  if (amount > source.value)
    throw new Error(
      `Amount exceeds ${source.symbol} holding value of $${source.value}.`,
    );
  const positions = p.positions.map((h) => ({
    symbol: h.symbol,
    before: h.value,
    after: round(
      h.value + (h === source ? -amount : h === target ? amount : 0),
    ),
  }));
  return {
    kind: "rebalance",
    title: "Hypothetical allocation",
    fromSymbol: source.symbol,
    toSymbol: target.symbol,
    amount,
    positions,
    beforeTechPct: p.techExposurePct,
    afterTechPct: round(
      ((p.techExposure -
        amount * source.techWeight +
        amount * target.techWeight) /
        p.value) *
        100,
    ),
    note: "Simulation only. No trades executed. Fractional shares allowed; taxes, fees and price movement excluded. Portfolio total stays unchanged.",
  };
}
export function debtPlan(args = {}) {
  const extraMonthly = number(
    args.extraMonthly,
    500,
    0,
    cashflow().availableMonthly,
    "extraMonthly",
  );
  let balances = debts.map((d) => d.balance),
    interest = 0,
    month = 0;
  const budget = round(sum(debts, (d) => d.monthlyPayment) + extraMonthly);
  while (balances.some((b) => b > 0.005) && month < 600) {
    month++;
    balances = balances.map((b, i) => {
      const charge = (b * debts[i].apr) / 1200;
      interest += charge;
      return b + charge;
    });
    let remainder = budget;
    balances = balances.map((b, i) => {
      const payment = Math.min(b, debts[i].monthlyPayment);
      remainder -= payment;
      return b - payment;
    });
    for (const i of debts
      .map((d, i) => i)
      .sort((a, b) => debts[b].apr - debts[a].apr)) {
      const payment = Math.min(balances[i], remainder);
      balances[i] -= payment;
      remainder -= payment;
    }
  }
  return {
    kind: "debt",
    title: "Debt payoff plan",
    debts,
    extraMonthly,
    monthlyBudget: budget,
    monthsToDebtFree: month,
    estimatedInterest: round(interest),
    order: [...debts].sort((a, b) => b.apr - a.apr).map((d) => d.name),
    note: "Avalanche method, fixed APRs and fixed total monthly budget with paid-off payments rolled forward. Monthly interest approximation; no new borrowing or fees.",
  };
}
const schema = (name, description, properties = {}, required = []) => ({
  type: "function",
  function: {
    name,
    description,
    parameters: {
      type: "object",
      properties,
      required,
      additionalProperties: false,
    },
  },
});
export const toolDefinitions = [
  schema("estimate_home_affordability", "Estimate a home purchase budget using income, cash, debt, mortgage payments, ownership costs and emergency reserves. Defaults to buying today; use months for waiting scenarios. Assumed rates, not mortgage approval.", {
    months: { type: "integer", minimum: 0, maximum: 120 },
    ratePct: { type: "number", minimum: 0, maximum: 20 },
  }),
  schema(
    "get_financial_overview",
    "Read the fictional customer profile, all balances, debts, goals, net worth and cash flow.",
  ),
  schema(
    "analyze_portfolio",
    "Calculate weekly position returns, dollar loss contributions, weights and look-through tech exposure for the taxable brokerage.",
  ),
  schema(
    "analyze_spending",
    "Read actual mock expense transactions and calculate category totals for a complete month.",
    {
      month: { type: "string", enum: ["2026-06", "2026-07", "2026-08"] },
      category: { type: "string", enum: Object.keys(categories) },
    },
  ),
  schema(
    "analyze_cashflow",
    "Calculate take-home income minus living expenses, debt payments and regular investments.",
  ),
  schema(
    "calculate_down_payment",
    "Calculate available cash for a down payment after savings, emergency reserves and closing costs. Not mortgage underwriting.",
    {
      months: { type: "integer", minimum: 0, maximum: 120 },
      reserveMonths: { type: "number", minimum: 0, maximum: 24 },
      closingCosts: { type: "number", minimum: 0, maximum: 200000 },
      monthlySavings: { type: "number", minimum: 0 },
      includeBrokerage: { type: "boolean" },
    },
  ),
  schema(
    "simulate_rebalance",
    "Calculate before/after holdings and tech exposure for a hypothetical dollar transfer between two positions. Does not execute trades.",
    {
      fromSymbol: { type: "string" },
      toSymbol: { type: "string" },
      amount: { type: "number", minimum: 0 },
    },
    ["fromSymbol", "toSymbol", "amount"],
  ),
  schema(
    "calculate_debt_payoff",
    "Calculate a highest-interest-first payoff schedule using current minimum payments plus extra monthly funds.",
    { extraMonthly: { type: "number", minimum: 0 } },
  ),
];
export const toolLabels = {
  estimate_home_affordability: "Estimating your home budget",
  get_financial_overview: "Reading your accounts",
  analyze_portfolio: "Analyzing portfolio positions",
  analyze_spending: "Reviewing transactions",
  analyze_cashflow: "Calculating cash flow",
  calculate_down_payment: "Modeling your down payment",
  simulate_rebalance: "Comparing allocations",
  calculate_debt_payoff: "Calculating debt payoff",
};
export function runTool(name, args = {}) {
  if (!args || typeof args !== "object" || Array.isArray(args))
    throw new Error("Tool arguments must be an object.");
  switch (name) {
    case "estimate_home_affordability": return homeAffordability(args);
    case "get_financial_overview":
      return overview();
    case "analyze_portfolio":
      return portfolio();
    case "analyze_spending":
      return spending(args.month, args.category);
    case "analyze_cashflow":
      return cashflow();
    case "calculate_down_payment":
      return homePlan(args);
    case "simulate_rebalance":
      return simulate(args);
    case "calculate_debt_payoff":
      return debtPlan(args);
    default:
      throw new Error("Unknown financial tool.");
  }
}
