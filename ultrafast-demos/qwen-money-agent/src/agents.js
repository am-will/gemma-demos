export const agents = [
  {
    id: "portfolio",
    category: "Investing",
    icon: "chart",
    name: "Portfolio analyst",
    description: "Understand performance & exposure",
    prompt:
      "Why is my portfolio down this week? Show me which positions contributed most to the decline.",
  },
  {
    id: "home",
    category: "Planning",
    icon: "home",
    name: "Home-buying planner",
    description: "Find your price range and monthly cost",
    prompt:
      "How much house can I afford based on my income and savings, while keeping a six-month emergency fund?",
  },
  {
    id: "spending",
    category: "Everyday",
    icon: "receipt",
    name: "Spending detective",
    description: "Follow the money, find the patterns",
    prompt:
      "Where did my money go in August, and what changed compared with July?",
  },
  {
    id: "cashflow",
    category: "Everyday",
    icon: "flow",
    name: "Cash-flow analyst",
    description: "Know what’s left each month",
    prompt:
      "How much do I really have left each month after expenses, debt payments, and investing?",
  },
  {
    id: "exposure",
    category: "Investing",
    icon: "layers",
    name: "Diversification analyst",
    description: "Look beneath your ETF holdings",
    prompt:
      "Am I more exposed to technology than I think? Include the technology inside my ETFs and explain what data is missing.",
  },
  {
    id: "debt",
    category: "Planning",
    icon: "debt",
    name: "Debt payoff planner",
    description: "Compare a path to debt-free",
    prompt:
      "Which debt should I pay off first? Compare adding $500 versus $1,000 per month, including payoff time and total interest.",
  },
  {
    id: "reserve",
    category: "Planning",
    icon: "shield",
    name: "Emergency fund check",
    description: "Understand your cash cushion",
    prompt:
      "Do I have enough cash for six months of living expenses and debt payments? How much would remain after setting that aside?",
  },
  {
    id: "rebalance",
    category: "Investing",
    icon: "balance",
    name: "Allocation simulator",
    description: "Explore a change before making it",
    prompt:
      "What would happen to my technology exposure if I moved $10,000 from NVDA into VTI? Run a hypothetical comparison.",
  },
  {
    id: "subscriptions",
    category: "Everyday",
    icon: "repeat",
    name: "Subscription review",
    description: "Take a closer look at recurring costs",
    prompt:
      "Review my subscription spending over the three available months. What does the data tell us, and what can’t we tell from these transactions?",
  },
  {
    id: "networth",
    category: "Planning",
    icon: "wallet",
    name: "Net-worth snapshot",
    description: "See how everything adds up",
    prompt:
      "Give me a clear breakdown of my net worth, separating accessible cash, taxable investments, retirement, and debts.",
  },
  {
    id: "savings",
    category: "Everyday",
    icon: "target",
    name: "Savings planner",
    description: "Turn monthly surplus into a goal",
    prompt:
      "Can I reach my $100,000 first-home goal in a year from cash and new savings alone? Show a down-payment plan after reserves and closing costs.",
  },
  {
    id: "checkup",
    category: "Planning",
    icon: "cerebras",
    name: "Financial checkup",
    description: "Connect the whole picture",
    prompt:
      "Review my overall financial picture. Identify three things worth my attention using my cash flow, debts, goals, and portfolio concentration.",
  },
];
