import test from "node:test";
import assert from "node:assert/strict";
import {
  overview,
  portfolio,
  homePlan,
  cashflow,
  simulate,
  spending,
  debtPlan,
  runTool,
} from "./finance.js";
test("balance sheet reconciles and weekly contributions sum to total loss", () => {
  const o = overview(),
    p = portfolio();
  assert.equal(o.netWorth, o.cash + o.retirement + o.brokerage - o.totalDebt);
  assert.equal(p.change, -2859.5);
  assert.equal(
    p.positions.reduce((n, h) => n + h.change, 0),
    p.change,
  );
  assert.equal(p.positions.find((h) => h.symbol === "NVDA").change, -1440);
});
test("down payment reserves include debt; scenario responds to time and preserves investments", () => {
  const c = cashflow(),
    plan = homePlan();
  assert.equal(plan.reserve, (c.livingExpenses + c.debtPayments) * 6);
  assert.equal(
    plan.maxDownPayment,
    Math.round(
      (overview().cash + c.availableMonthly * 12 - plan.reserve - 12000) * 100,
    ) / 100,
  );
  assert.equal(
    homePlan({ months: 24 }).maxDownPayment - plan.maxDownPayment,
    c.availableMonthly * 12,
  );
  assert.equal(
    homePlan({ includeBrokerage: true }).maxDownPayment,
    plan.maxDownPayment + overview().brokerage,
  );
  assert.equal(homePlan({ months: 0, reserveMonths: 24 }).maxDownPayment, 0);
});
test("rebalance conserves portfolio value and includes ETF technology exposure", () => {
  const r = simulate({ fromSymbol: "NVDA", toSymbol: "VTI", amount: 10000 });
  assert.equal(
    r.positions.reduce((n, p) => n + p.before, 0),
    r.positions.reduce((n, p) => n + p.after, 0),
  );
  assert.ok(r.afterTechPct < r.beforeTechPct);
  assert.ok(r.afterTechPct > 0);
  assert.throws(() =>
    simulate({ fromSymbol: "NVDA", toSymbol: "VTI", amount: 20000 }),
  );
  assert.throws(() =>
    simulate({ fromSymbol: "NVDA", toSymbol: "NVDA", amount: 1000 }),
  );
});
test("spending is backed by transactions and increased in August", () => {
  const s = spending();
  assert.equal(
    s.total,
    s.transactions.reduce((n, t) => n + t.amount, 0),
  );
  assert.ok(s.total > spending("2026-07").total);
  assert.throws(() => spending("2026-09"));
});
test("higher payments reduce payoff time and interest; invalid scenarios are rejected", () => {
  const a = debtPlan({ extraMonthly: 500 }),
    b = debtPlan({ extraMonthly: 1000 });
  assert.ok(b.monthsToDebtFree < a.monthsToDebtFree);
  assert.ok(b.estimatedInterest < a.estimatedInterest);
  for (const args of [
    { months: -1 },
    { months: 1.5 },
    { monthlySavings: 90000 },
    { includeBrokerage: "false" },
    { reserveMonths: Infinity },
  ])
    assert.throws(() => homePlan(args));
  assert.throws(() => runTool("transfer_money", {}));
});
