import test from "node:test";
import assert from "node:assert/strict";
import {
  homeAffordability,
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
    Math.round(s.transactions.reduce((n, t) => n + t.amount, 0) * 100) / 100,
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

test("merchant detail reconciles without changing existing planning figures", () => {
  for (const month of ["2026-06", "2026-07", "2026-08"]) {
    const s = spending(month);
    assert.equal(Math.round(s.merchants.reduce((n, t) => n + t.amount, 0) * 100) / 100, s.total);
    assert.equal(Math.round(s.subscriptions.reduce((n, t) => n + t.amount, 0)), s.categories.find(c => c.name === "Subscriptions").amount);
    assert.equal(s.subscriptions.length, 7);
    assert.ok(s.merchants.some(t => t.merchant === "DoorDash" && t.count === 2));
  }
  assert.equal(homePlan().maxDownPayment, 46106);
  assert.equal(homePlan({months: 24}).maxDownPayment, 74810);
});

test("home affordability respects cash, payment and reserve constraints", () => {
  for (const args of [{}, {months:12}, {ratePct:0}, {ratePct:12}]) {
    const a = homeAffordability(args);
    assert.ok(a.estimatedHomePrice > 0);
    assert.ok(a.monthlyTotal <= a.housingBudget);
    assert.ok(a.downPayment >= a.estimatedHomePrice * .05);
    assert.ok(a.downPayment + a.closingCosts + a.reserve <= a.projectedCash + .02);
    assert.ok(Math.abs(a.reserve - 6 * (a.nonHousingExpenses + a.debtPayments + a.monthlyTotal)) < .05);
    assert.ok(Math.abs(a.monthlyTotal - a.principalInterest - a.taxes - a.maintenance - a.insurance - a.hoa - a.pmi) < .05);
  }
  assert.ok(homeAffordability({months:12}).estimatedHomePrice > homeAffordability().estimatedHomePrice);
  assert.ok(homeAffordability({ratePct:12}).estimatedHomePrice < homeAffordability().estimatedHomePrice);
  assert.throws(()=>homeAffordability({months:1.5}));
});

test("home savings plan includes the protected reserve in its target", () => {
  const plan = homeAffordability({months:12});
  assert.ok(Math.abs(plan.totalCashRequired - plan.downPayment - plan.closingCosts - plan.reserve) < .03);
  assert.ok(Math.abs(plan.additionalSavingsNeeded - (plan.totalCashRequired - overview().cash)) < .03);
  assert.ok(plan.monthlySavingsGoal <= cashflow().availableMonthly);
  assert.deepEqual(plan.savingsMilestones.map(m => m.month), [3,6,9,12]);
  assert.equal(plan.savingsMilestones.at(-1).totalCash, plan.projectedCash);
});
