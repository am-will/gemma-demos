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
export const transactions = ["2026-06", "2026-07", "2026-08"].flatMap(
  (month, i) =>
    Object.entries(categories).flatMap(([category, amount], j) => {
      const total = Math.round(
        amount * (category === "Housing" ? 1 : [0.92, 1, 1.08][i]),
      );
      return [0, 1].map((k) => ({
        id: `${month}-${j}-${k}`,
        date: `${month}-${k ? "22" : "08"}`,
        merchant:
          category === "Housing"
            ? "Parkside Apartments"
            : {
                Groceries: "Whole Foods",
                Dining: "Restaurants & coffee",
                Transport: "Fuel & transit",
                Utilities: "Internet & energy",
                Shopping: "Retail purchases",
                Subscriptions: "Digital subscriptions",
                Insurance: "Insurance premium",
                Health: "Health & wellness",
              }[category],
        category,
        amount: k ? total - Math.floor(total / 2) : Math.floor(total / 2),
      }));
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
