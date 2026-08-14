import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const MAX_RATE = 3000;
const MAX_BUFFER_CHARS = 9200;
const METER_WINDOW_MS = 900;

const PROVIDERS = [
  {
    id: "cerebras",
    title: "Cerebras Fast Inference",
    shortName: "Cerebras",
    defaultRate: 1850,
    seed: 0
  },
  {
    id: "gpu",
    title: "GPU Inference",
    shortName: "GPU",
    defaultRate: 40,
    seed: 131
  }
];

// A public-domain passage gives the plain stream mode recognizable prose. It
// loops intentionally so the simulator can run indefinitely without an API.
const BOOK_TEXT = `
Once upon a time, there was a little girl named Dorothy, who lived in the midst
of the great Kansas prairies, with Uncle Henry, who was a farmer, and Aunt Em,
who was the farmer's wife. Their house was small, for the lumber to build it
had to be carried by wagon many miles. There were four walls, a floor and a
roof, which made one room; and this room contained a rusty-looking cookstove,
a cupboard for the dishes, a table, three or four chairs, and the beds. Uncle
Henry and Aunt Em had a big bed in one corner, and Dorothy a little bed in
another corner. There was no garret, and no cellar except a small hole dug in
the ground, called a cyclone cellar, where the family could go in case one of
those great whirlwinds arose, mighty enough to crush any building in its path.
It was reached by a trap door in the middle of the floor, from which a ladder
led down into the small, dark hole.

When Dorothy stood in the doorway and looked around, she could see nothing but
the great gray prairie on every side. Not a tree nor a house broke the broad
sweep of flat country that reached to the edge of the sky; the sun had baked
the plowed land into a dull gray crust, and even the grass was not green. Once
the house had been painted, but the sun blistered the paint and the rains
washed it away, so that the house was as dull and gray as everything else.

When Aunt Em came there to live she was a young, pretty wife. The sun and wind
had changed her, too. They had taken the sparkle from her eyes and left them
sober and gray; they had taken the red from her cheeks and lips, and they were
gray also. She was thin and gaunt, and never smiled now. When Dorothy, who was
an orphan, first came to her, Aunt Em had been so startled by the child's
laughter that she would scream and press her hand upon her heart whenever
Dorothy's merry voice reached her ears; and she still looked at the little girl
with wonder that she could find anything to laugh at.

Uncle Henry never laughed. He worked hard from morning till night and did not
know what joy was. He was gray also, from his long beard to his rough boots,
and he looked stern and solemn and seldom spoke.

It was Toto that made Dorothy laugh, and saved her from growing as gray as her
other surroundings. Toto was not gray; he was a little black dog, with long
silky hair and small black eyes that twinkled merrily on either side of his
funny, wee nose. Toto played all day long, and Dorothy played with him, and
loved him dearly.

But today the wind began to moan across the prairie. Dorothy watched the line
of clouds darken and heard the loose boards of the house tremble. Uncle Henry
left his work and looked toward the sky, while Aunt Em opened the trap door
and called for the child to come quickly. Toto darted under the bed, and
Dorothy reached for him just as the house lurched on its foundations.

The great cyclone had arrived. It spun the little house higher and higher,
turning it slowly like a toy carried by a very large hand. Dorothy felt as if
she were floating in a balloon, yet the room was strangely quiet. She opened
the door and saw clouds beneath her, rolling away in soft, shining banks. The
world below became a patchwork of fields and roads, then a blur, then nothing
at all.

At last the house settled with a gentle jolt. Dorothy stepped outside with
Toto in her arms and found a country brighter than anything she had ever seen.
The grass was green, the birds flashed between trees, and flowers leaned over
the path in every color. A yellow road ran toward the horizon, and far away a
city shone like a green lantern beneath the morning sun. Dorothy adjusted her
blue gingham dress, held Toto close, and began to walk.

She had not gone far when three little people appeared at the edge of the
road. They wore curious hats and pointed shoes, and their faces were alight
with relief. One bowed deeply and thanked Dorothy for the house that had
fallen from the sky. Another pointed toward the distant city and told her that
the Wizard might know the way home. So Dorothy followed the yellow road, where
every bend promised a new country and every mile carried her farther into the
bright, impossible story.
`;

const SOURCE_TOKENS = tokenize(BOOK_TEXT);

const CODING_TASKS = [
  {
    id: "route-fallback",
    label: "TASK 01",
    prompt: "Fix the workspace route fallback without changing the public router API.",
    steps: [
      {
        kind: "thinking",
        text: "I’ll trace the request path first, isolate the fallback branch, and keep the patch as small as possible."
      },
      {
        kind: "tool",
        tool: "Search",
        title: "Find the routing path",
        command: 'rg -n "resolveWorkspace|fallbackRoute" src tests',
        output: "src/router/resolve-workspace.ts:42:  const fallbackRoute = getDefaultRoute()\ntests/router/resolve-workspace.test.ts:88:  it('prefers an explicit workspace route')",
        duration: 700
      },
      {
        kind: "thinking",
        text: "The explicit workspace match is computed, but the default route returns first. I need to verify that reordering this branch won’t change the empty-workspace behavior."
      },
      {
        kind: "tool",
        tool: "Read",
        title: "Inspect the resolver",
        command: "src/router/resolve-workspace.ts · lines 28–92",
        output: "38  const workspaceRoute = matchWorkspaceRoute(input)\n42  if (fallbackRoute) return fallbackRoute\n47  if (workspaceRoute) return workspaceRoute",
        duration: 700
      },
      {
        kind: "thinking",
        text: "Confirmed. The two guards are reversed. I’ll move the explicit route ahead of the fallback and add a focused regression case."
      },
      {
        kind: "tool",
        tool: "Patch",
        title: "Fix route precedence",
        command: "apply_patch · src/router/resolve-workspace.ts",
        output: "@@ resolveWorkspace(input)\n+ if (workspaceRoute) return workspaceRoute\n  if (fallbackRoute) return fallbackRoute\n- if (workspaceRoute) return workspaceRoute",
        duration: 700
      },
      {
        kind: "thinking",
        text: "The implementation is corrected. I’ll run the focused router suite before summarizing the change."
      },
      {
        kind: "tool",
        tool: "Shell",
        title: "Run focused tests",
        command: "npm test -- resolve-workspace.test.ts",
        output: "✓ resolve-workspace.test.ts (12 tests)\n  12 passed · 0 failed · 0.64s",
        duration: 700
      },
      {
        kind: "final",
        text: "Fixed workspace route precedence and added regression coverage. The public router API is unchanged and all 12 focused tests pass."
      }
    ]
  },
  {
    id: "command-palette",
    label: "TASK 02",
    prompt: "Add keyboard navigation to the command palette and preserve pointer selection.",
    steps: [
      {
        kind: "thinking",
        text: "I’ll inspect the palette state and existing interaction tests, then add keyboard handling through the same selection path used by pointer input."
      },
      {
        kind: "tool",
        tool: "Search",
        title: "Locate palette behavior",
        command: 'rg -n "CommandPalette|activeIndex|onPointer" src tests',
        output: "src/ui/CommandPalette.tsx:31: export function CommandPalette\nsrc/ui/CommandPalette.tsx:76: onPointerMove={() => setActiveIndex(index)}\ntests/ui/command-palette.test.tsx:14: describe('CommandPalette')",
        duration: 700
      },
      {
        kind: "thinking",
        text: "Selection already has a single active index, so keyboard support can stay local: clamp ArrowUp and ArrowDown, then route Enter through the existing action callback."
      },
      {
        kind: "tool",
        tool: "Read",
        title: "Read component and tests",
        command: "src/ui/CommandPalette.tsx · tests/ui/command-palette.test.tsx",
        output: "activeIndex is local state\nrunCommand(items[activeIndex]) is the shared selection path\nno keydown listener exists",
        duration: 700
      },
      {
        kind: "thinking",
        text: "I’ll add one keydown handler, prevent default only for handled keys, and keep pointer movement authoritative whenever the cursor returns."
      },
      {
        kind: "tool",
        tool: "Patch",
        title: "Add keyboard controls",
        command: "apply_patch · CommandPalette.tsx · command-palette.test.tsx",
        output: "+ ArrowDown → next command\n+ ArrowUp → previous command\n+ Enter → run active command\n+ tests for bounds and pointer handoff",
        duration: 700
      },
      {
        kind: "tool",
        tool: "Shell",
        title: "Run UI tests",
        command: "npm test -- command-palette.test.tsx",
        output: "✓ command-palette.test.tsx (9 tests)\n  9 passed · 0 failed · 0.71s",
        duration: 700
      },
      {
        kind: "final",
        text: "Keyboard navigation is wired through the existing command selection path. Pointer behavior is preserved, bounds are covered, and all 9 tests pass."
      }
    ]
  }
];

const TOOL_TOKEN_CADENCE = [1030, 1285, 1160, 1415, 1085, 1215];
const TOOL_DURATION_MS = 700;

const AGENT_TASKS = [
  {
    prompt: "Fix the workspace route fallback without changing the public router API.",
    tools: [
      {
        tool: "Search",
        title: "Searched the codebase",
        command: 'rg -n "resolveWorkspace|fallbackRoute" src tests',
        output: "Found the resolver and its focused test suite."
      },
      {
        tool: "Read",
        title: "Read the routing implementation",
        command: "src/router/resolve-workspace.ts · lines 28–92",
        output: "The fallback guard runs before the explicit workspace match."
      },
      {
        tool: "Search",
        title: "Checked resolver call sites",
        command: 'rg -n "resolveWorkspace\\(" src',
        output: "No caller depends on the previous fallback order."
      },
      {
        tool: "Patch",
        title: "Edited 2 files",
        command: "resolve-workspace.ts · resolve-workspace.test.ts",
        output: "Reordered the guards and added regression coverage."
      },
      {
        tool: "Shell",
        title: "Ran the router typecheck",
        command: "npm run typecheck -- router",
        output: "0 type errors"
      },
      {
        tool: "Shell",
        title: "Ran the focused tests",
        command: "npm test -- resolve-workspace.test.ts",
        output: "12 passed · 0 failed"
      }
    ]
  },
  {
    prompt: "Add keyboard navigation to the command palette and preserve pointer selection.",
    tools: [
      {
        tool: "Search",
        title: "Searched palette behavior",
        command: 'rg -n "CommandPalette|activeIndex|onPointer" src tests',
        output: "Found one shared selection path and the existing pointer tests."
      },
      {
        tool: "Read",
        title: "Read component and tests",
        command: "CommandPalette.tsx · command-palette.test.tsx",
        output: "Keyboard input can reuse the active index and runCommand callback."
      },
      {
        tool: "Search",
        title: "Checked keyboard patterns",
        command: 'rg -n "onKeyDown|ArrowDown" src/ui',
        output: "The palette can match the existing listbox behavior."
      },
      {
        tool: "Patch",
        title: "Edited 2 files",
        command: "CommandPalette.tsx · command-palette.test.tsx",
        output: "Added ArrowUp, ArrowDown, Enter, and pointer handoff coverage."
      },
      {
        tool: "Shell",
        title: "Ran the UI typecheck",
        command: "npm run typecheck -- ui",
        output: "0 type errors"
      },
      {
        tool: "Shell",
        title: "Ran the UI tests",
        command: "npm test -- command-palette.test.tsx",
        output: "9 passed · 0 failed"
      }
    ]
  },
  {
    prompt: "Make request retries honor cancellation without changing the client API.",
    tools: [
      {
        tool: "Search",
        title: "Located retry handling",
        command: 'rg -n "retry|AbortSignal|backoff" src tests',
        output: "Found the shared request helper and three retry-specific tests."
      },
      {
        tool: "Read",
        title: "Inspected the request client",
        command: "src/http/request.ts · lines 41–128",
        output: "Cancellation is checked before the request, but not during backoff."
      },
      {
        tool: "Shell",
        title: "Reproduced cancellation bug",
        command: "npm test -- request-retry.test.ts -t cancellation",
        output: "1 failed · retry continued after abort"
      },
      {
        tool: "Patch",
        title: "Updated retry backoff",
        command: "request.ts · request-retry.test.ts",
        output: "Backoff now exits immediately when the signal aborts."
      },
      {
        tool: "Shell",
        title: "Ran HTTP typecheck",
        command: "npm run typecheck -- http",
        output: "0 type errors"
      },
      {
        tool: "Shell",
        title: "Ran request tests",
        command: "npm test -- request-retry.test.ts",
        output: "14 passed · 0 failed"
      }
    ]
  },
  {
    prompt: "Correct cache invalidation after a project settings mutation.",
    tools: [
      {
        tool: "Search",
        title: "Mapped cache dependencies",
        command: 'rg -n "invalidate|projectSettings|cacheKey" src tests',
        output: "The mutation refreshes details but leaves the project list stale."
      },
      {
        tool: "Read",
        title: "Read mutation lifecycle",
        command: "src/data/use-project-settings.ts · lines 22–104",
        output: "Both views share the same project-scoped cache prefix."
      },
      {
        tool: "Shell",
        title: "Ran cache regression",
        command: "npm test -- project-settings-cache.test.ts",
        output: "1 failed · list retained the previous project name"
      },
      {
        tool: "Patch",
        title: "Fixed cache invalidation",
        command: "use-project-settings.ts · project-settings-cache.test.ts",
        output: "Invalidation now covers detail and list keys atomically."
      },
      {
        tool: "Shell",
        title: "Checked affected tests",
        command: "npm test -- project-settings",
        output: "18 passed · 0 failed"
      },
      {
        tool: "Shell",
        title: "Ran production build",
        command: "npm run build",
        output: "Build completed successfully"
      }
    ]
  }
];

const AGENT_CONTENT_SEGMENTS = [
  {
    kind: "summary",
    text: "I’ll trace the workspace routing path, confirm which branch wins, and keep the fix limited to the resolver plus one focused regression test."
  },
  {
    kind: "code",
    language: "typescript",
    file: "src/router/resolve-workspace.ts",
    text: `export function resolveWorkspace(input: RouteInput) {
  const workspaceRoute = matchWorkspaceRoute(input)
  const fallbackRoute = getDefaultRoute(input)

  if (fallbackRoute) return fallbackRoute
  if (workspaceRoute) return workspaceRoute

  return null
}`
  },
  {
    kind: "summary",
    text: "The explicit route is already computed, but the fallback returns first. I’ll reverse those guards without changing the return type or the empty-input behavior."
  },
  {
    kind: "code",
    language: "diff",
    file: "src/router/resolve-workspace.ts",
    text: `@@ resolveWorkspace(input)
   const workspaceRoute = matchWorkspaceRoute(input)
   const fallbackRoute = getDefaultRoute(input)

+  if (workspaceRoute) return workspaceRoute
   if (fallbackRoute) return fallbackRoute
-  if (workspaceRoute) return workspaceRoute

   return null`
  },
  {
    kind: "summary",
    text: "Now I’ll pin the precedence rule in a test so the old ordering fails clearly and the public router contract stays protected."
  },
  {
    kind: "code",
    language: "typescript",
    file: "tests/router/resolve-workspace.test.ts",
    text: `it("prefers an explicit workspace route", () => {
  const result = resolveWorkspace({
    pathname: "/workspaces/alpha/settings",
    defaultRoute: "/home",
  })

  expect(result).toEqual("/workspaces/alpha/settings")
})`
  },
  {
    kind: "summary",
    text: "The route fix is isolated and covered. Next I’ll reuse the command palette’s existing active index to add keyboard navigation without disturbing pointer selection."
  },
  {
    kind: "code",
    language: "tsx",
    file: "src/ui/CommandPalette.tsx",
    text: `function onKeyDown(event: React.KeyboardEvent) {
  if (event.key === "ArrowDown") {
    event.preventDefault()
    setActiveIndex((index) => Math.min(index + 1, items.length - 1))
  }

  if (event.key === "ArrowUp") {
    event.preventDefault()
    setActiveIndex((index) => Math.max(index - 1, 0))
  }

  if (event.key === "Enter") runCommand(items[activeIndex])
}`
  },
  {
    kind: "summary",
    text: "Keyboard and pointer input now share the same selection path. I’ll add bounds coverage and verify that moving the pointer still hands control back cleanly."
  },
  {
    kind: "code",
    language: "tsx",
    file: "tests/ui/command-palette.test.tsx",
    text: `it("supports keyboard and pointer handoff", async () => {
  await user.keyboard("{ArrowDown}{ArrowDown}{Enter}")
  expect(runCommand).toHaveBeenCalledWith(commands[2])

  await user.hover(screen.getByText(commands[0].label))
  await user.keyboard("{Enter}")
  expect(runCommand).toHaveBeenLastCalledWith(commands[0])
})`
  }
];

function tokenize(value) {
  return value.trim().replace(/\s+/g, " ").split(" ").filter(Boolean);
}

function measureTps(runtime, now) {
  const cutoff = now - METER_WINDOW_MS;
  runtime.samples = runtime.samples.filter((sample) => sample.at >= cutoff);
  return Math.round(
    (runtime.samples.reduce((sum, sample) => sum + sample.count, 0) * 1000) /
      METER_WINDOW_MS
  );
}

function makeStoryRuntime(seed) {
  return {
    cursor: seed % SOURCE_TOKENS.length,
    credit: 0,
    totalTokens: 0,
    buffer: "",
    samples: [],
    lastUiUpdate: 0,
    liveTps: 0
  };
}

function appendStoryTokens(runtime, count) {
  let chunk = "";
  for (let index = 0; index < count; index += 1) {
    chunk += `${runtime.totalTokens === 0 && index === 0 ? "" : " "}${SOURCE_TOKENS[runtime.cursor]}`;
    runtime.cursor = (runtime.cursor + 1) % SOURCE_TOKENS.length;
    runtime.totalTokens += 1;
  }

  runtime.buffer = `${runtime.buffer}${chunk}`;
  if (runtime.buffer.length > MAX_BUFFER_CHARS) {
    runtime.buffer = runtime.buffer.slice(-MAX_BUFFER_CHARS).replace(/^\S*\s/, "");
  }
}

function useStoryStreams(rates, active) {
  const [state, setState] = useState(() =>
    PROVIDERS.map(() => ({ text: "", liveTps: 0, totalTokens: 0 }))
  );
  const ratesRef = useRef(rates);
  const runtimesRef = useRef(PROVIDERS.map((provider) => makeStoryRuntime(provider.seed)));
  ratesRef.current = rates;

  useEffect(() => {
    if (!active) return undefined;
    let frameId;
    let lastFrame = performance.now();

    const frame = (now) => {
      const elapsed = Math.min((now - lastFrame) / 1000, 0.12);
      lastFrame = now;
      let shouldRender = false;

      runtimesRef.current.forEach((runtime, index) => {
        runtime.credit += ratesRef.current[index] * elapsed;
        const count = Math.floor(runtime.credit);
        if (count > 0) {
          runtime.credit -= count;
          appendStoryTokens(runtime, count);
          runtime.samples.push({ at: now, count });
          shouldRender = true;
        }

        if (now - runtime.lastUiUpdate >= 90) {
          runtime.liveTps = measureTps(runtime, now);
          runtime.lastUiUpdate = now;
          shouldRender = true;
        }
      });

      if (shouldRender) {
        setState(runtimesRef.current.map((runtime) => ({
          text: runtime.buffer,
          liveTps: runtime.liveTps,
          totalTokens: runtime.totalTokens
        })));
      }
      frameId = requestAnimationFrame(frame);
    };

    frameId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(frameId);
  }, [active]);

  return state;
}

function makeAgentRuntime() {
  return {
    taskIndex: 0,
    stepIndex: -1,
    entrySequence: 0,
    entries: [],
    activeEntry: null,
    waitUntil: 0,
    credit: 0,
    totalTokens: 0,
    completedTools: 0,
    samples: [],
    lastUiUpdate: 0,
    liveTps: 0
  };
}

function addAgentEntry(runtime, entry) {
  const next = { id: `${runtime.taskIndex}-${runtime.entrySequence}`, ...entry };
  runtime.entrySequence += 1;
  runtime.entries.push(next);
  if (runtime.entries.length > 18) runtime.entries = runtime.entries.slice(-18);
  return next;
}

function beginAgentTask(runtime) {
  const task = CODING_TASKS[runtime.taskIndex];
  addAgentEntry(runtime, {
    kind: "task",
    label: task.label,
    text: task.prompt
  });
  runtime.stepIndex = 0;
}

function beginAgentStep(runtime, now) {
  const task = CODING_TASKS[runtime.taskIndex];
  const step = task.steps[runtime.stepIndex];

  if (!step) {
    runtime.taskIndex = (runtime.taskIndex + 1) % CODING_TASKS.length;
    runtime.stepIndex = -1;
    runtime.waitUntil = now + 900;
    runtime.activeEntry = null;
    return;
  }

  if (step.kind === "tool") {
    const entry = addAgentEntry(runtime, {
      ...step,
      status: "running",
      progress: 0,
      startedAt: now
    });
    runtime.activeEntry = { kind: "tool", entryId: entry.id };
    runtime.waitUntil = now + step.duration;
    return;
  }

  const entry = addAgentEntry(runtime, {
    kind: step.kind,
    text: "",
    active: true
  });
  runtime.activeEntry = {
    kind: "text",
    entryId: entry.id,
    tokens: tokenize(step.text),
    cursor: 0
  };
}

function advanceAgentRuntime(runtime, rate, elapsed, now) {
  let changed = false;

  if (runtime.stepIndex === -1 && now >= runtime.waitUntil) {
    beginAgentTask(runtime);
    changed = true;
  }

  if (!runtime.activeEntry && runtime.stepIndex >= 0 && now >= runtime.waitUntil) {
    beginAgentStep(runtime, now);
    changed = true;
  }

  if (runtime.activeEntry?.kind === "tool") {
    const entry = runtime.entries.find((item) => item.id === runtime.activeEntry.entryId);
    if (entry) {
      entry.progress = Math.min(1, (now - entry.startedAt) / entry.duration);
      changed = true;
      if (now >= runtime.waitUntil) {
        entry.status = "complete";
        entry.progress = 1;
        runtime.completedTools += 1;
        runtime.activeEntry = null;
        runtime.stepIndex += 1;
      }
    }
  }

  if (runtime.activeEntry?.kind === "text") {
    runtime.credit += rate * elapsed;
    const available = Math.floor(runtime.credit);
    const remaining = runtime.activeEntry.tokens.length - runtime.activeEntry.cursor;
    const count = Math.min(available, remaining);

    if (count > 0) {
      runtime.credit -= count;
      const entry = runtime.entries.find((item) => item.id === runtime.activeEntry.entryId);
      const chunk = runtime.activeEntry.tokens
        .slice(runtime.activeEntry.cursor, runtime.activeEntry.cursor + count)
        .join(" ");
      if (entry) entry.text = `${entry.text}${entry.text ? " " : ""}${chunk}`;
      runtime.activeEntry.cursor += count;
      runtime.totalTokens += count;
      runtime.samples.push({ at: now, count });
      changed = true;
    }

    if (runtime.activeEntry.cursor >= runtime.activeEntry.tokens.length) {
      const entry = runtime.entries.find((item) => item.id === runtime.activeEntry.entryId);
      if (entry) entry.active = false;
      runtime.activeEntry = null;
      runtime.stepIndex += 1;
      changed = true;
    }
  }

  if (now - runtime.lastUiUpdate >= 80) {
    runtime.liveTps = measureTps(runtime, now);
    runtime.lastUiUpdate = now;
    changed = true;
  }

  return changed;
}

function streamUnits(value) {
  return value.match(/\S+\s*/g) || [];
}

function makeStructuredAgentRuntime() {
  return {
    engineVersion: 4,
    taskIndex: 0,
    toolIndex: 0,
    toolCadenceIndex: 0,
    contentIndex: 0,
    entrySequence: 0,
    entries: [],
    activeContent: null,
    activeTool: null,
    credit: 0,
    tokensSinceTool: 0,
    nextToolTokenTarget: TOOL_TOKEN_CADENCE[0],
    totalTokens: 0,
    completedTools: 0,
    liveTps: 0
  };
}

function addStructuredEntry(runtime, entry) {
  const next = { id: `structured-${runtime.entrySequence}`, ...entry };
  runtime.entrySequence += 1;
  runtime.entries.push(next);
  if (runtime.entries.length > 16) runtime.entries = runtime.entries.slice(-16);
  return next;
}

function beginStructuredContent(runtime) {
  const segment = AGENT_CONTENT_SEGMENTS[runtime.contentIndex];
  const entry = addStructuredEntry(runtime, {
    kind: segment.kind,
    language: segment.language,
    file: segment.file,
    text: "",
    active: true
  });
  runtime.activeContent = {
    entryId: entry.id,
    units: streamUnits(segment.text),
    cursor: 0
  };
}

function beginStructuredTool(runtime, now) {
  const task = AGENT_TASKS[runtime.taskIndex];
  const tool = task.tools[runtime.toolIndex];
  const entry = addStructuredEntry(runtime, {
    kind: "tool",
    ...tool,
    status: "running",
    progress: 0,
    duration: TOOL_DURATION_MS,
    startedAt: now
  });
  runtime.activeTool = { entryId: entry.id, endsAt: now + TOOL_DURATION_MS };
  runtime.tokensSinceTool = Math.max(
    0,
    runtime.tokensSinceTool - runtime.nextToolTokenTarget
  );
}

function finishStructuredTool(runtime, entry) {
  entry.status = "complete";
  entry.progress = 1;
  runtime.completedTools += 1;
  runtime.toolIndex += 1;
  if (runtime.toolIndex >= AGENT_TASKS[runtime.taskIndex].tools.length) {
    runtime.toolIndex = 0;
    runtime.taskIndex = (runtime.taskIndex + 1) % AGENT_TASKS.length;
  }
  runtime.activeTool = null;
  runtime.toolCadenceIndex = (runtime.toolCadenceIndex + 1) % TOOL_TOKEN_CADENCE.length;
  runtime.nextToolTokenTarget = TOOL_TOKEN_CADENCE[runtime.toolCadenceIndex];
}

function advanceStructuredAgentRuntime(runtime, rate, elapsed, now) {
  let changed = false;
  runtime.liveTps = rate;

  if (runtime.activeTool) {
    const entry = runtime.entries.find((item) => item.id === runtime.activeTool.entryId);
    if (entry) {
      entry.progress = Math.min(1, (now - entry.startedAt) / TOOL_DURATION_MS);
      changed = true;
      if (now >= runtime.activeTool.endsAt) finishStructuredTool(runtime, entry);
    }
    return changed;
  }

  if (rate <= 0) {
    return changed;
  }

  if (!runtime.activeContent) {
    if (runtime.tokensSinceTool >= runtime.nextToolTokenTarget) {
      beginStructuredTool(runtime, now);
      return true;
    }
    beginStructuredContent(runtime);
    changed = true;
  }

  runtime.credit += rate * elapsed;
  const available = Math.floor(runtime.credit);
  const remaining = runtime.activeContent.units.length - runtime.activeContent.cursor;
  const count = Math.min(available, remaining);
  if (count <= 0) return changed;

  runtime.credit -= count;
  const entry = runtime.entries.find((item) => item.id === runtime.activeContent.entryId);
  if (entry) {
    entry.text += runtime.activeContent.units
      .slice(runtime.activeContent.cursor, runtime.activeContent.cursor + count)
      .join("");
  }
  runtime.activeContent.cursor += count;
  runtime.totalTokens += count;
  runtime.tokensSinceTool += count;
  changed = true;

  if (runtime.activeContent.cursor >= runtime.activeContent.units.length) {
    if (entry) entry.active = false;
    runtime.activeContent = null;
    runtime.contentIndex = (runtime.contentIndex + 1) % AGENT_CONTENT_SEGMENTS.length;
  }

  return changed;
}

function useAgentStreams(rates, active) {
  const [state, setState] = useState(() =>
    PROVIDERS.map(() => ({ entries: [], liveTps: 0, totalTokens: 0, completedTools: 0 }))
  );
  const ratesRef = useRef(rates);
  const runtimesRef = useRef(PROVIDERS.map(() => makeStructuredAgentRuntime()));
  if (!runtimesRef.current.every((runtime) => runtime.engineVersion === 4)) {
    runtimesRef.current = PROVIDERS.map(() => makeStructuredAgentRuntime());
  }
  ratesRef.current = rates;

  useEffect(() => {
    if (!active) return undefined;
    let frameId;
    let lastFrame = performance.now();

    const frame = (now) => {
      const elapsed = Math.min((now - lastFrame) / 1000, 0.12);
      lastFrame = now;
      let shouldRender = false;

      runtimesRef.current.forEach((runtime, index) => {
        if (advanceStructuredAgentRuntime(runtime, ratesRef.current[index], elapsed, now)) {
          shouldRender = true;
        }
      });

      if (shouldRender) {
        setState(runtimesRef.current.map((runtime) => ({
          entries: runtime.entries.map((entry) => ({ ...entry })),
          liveTps: runtime.liveTps,
          totalTokens: runtime.totalTokens,
          completedTools: runtime.completedTools
        })));
      }
      frameId = requestAnimationFrame(frame);
    };

    frameId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(frameId);
  }, [active]);

  return state;
}

function ProviderMark({ provider }) {
  if (provider.id === "cerebras") {
    return <span className="provider-mark cerebras-mark"><img src="/assets/cerebras-logo.png" alt="" /></span>;
  }

  return (
    <span className="provider-mark gpu-mark" aria-hidden="true">
      {Array.from({ length: 9 }, (_, index) => <i key={index} />)}
    </span>
  );
}

function ModeToggle({ mode, onChange }) {
  return (
    <div className="mode-control">
      <span className="mode-label">SIMULATION</span>
      <div className="mode-toggle" role="group" aria-label="Simulation mode">
        <button
          className={mode === "agent" ? "active" : ""}
          type="button"
          aria-pressed={mode === "agent"}
          onClick={() => onChange("agent")}
        >
          Coding agent
        </button>
        <button
          className={mode === "story" ? "active" : ""}
          type="button"
          aria-pressed={mode === "story"}
          onClick={() => onChange("story")}
        >
          Book stream
        </button>
      </div>
    </div>
  );
}

function RateControl({ provider, index, rate, onChange }) {
  return (
    <div className="slider-wrap">
      <div className="slider-label-row">
        <label htmlFor={`rate-${provider.id}`}>Emission rate</label>
      </div>
      <input
        id={`rate-${provider.id}`}
        className="rate-slider"
        type="range"
        min="0"
        max={MAX_RATE}
        step="1"
        value={rate}
        onChange={(event) => onChange(index, Number(event.target.value))}
        style={{ "--slider-progress": `${(rate / MAX_RATE) * 100}%` }}
        aria-valuetext={`${rate.toLocaleString()} tokens per second`}
      />
      <div className="slider-ticks" aria-hidden="true">
        <span>0</span><span>750</span><span>1,500</span><span>2,250</span><span>3,000</span>
      </div>
    </div>
  );
}

function StoryOutput({ provider, state, outputRef }) {
  return (
    <div className="stream-output-shell">
      <div className="output-toolbar">
        <span><b className="terminal-dot" /> output buffer</span>
      </div>
      <div className="stream-output" ref={outputRef} aria-label={`${provider.shortName} streaming text output`}>
        <p>{state.text || "Waiting for the first token…"}<span className="cursor" aria-hidden="true" /></p>
      </div>
    </div>
  );
}

function ToolEntry({ entry }) {
  const seconds = (entry.duration / 1000).toFixed(1);
  const glyphs = { Search: "⌕", Read: "▤", Patch: "✎", Shell: "›_" };
  return (
    <div className={`tool-activity ${entry.status}`}>
      <span className="tool-activity-icon" aria-hidden="true">{glyphs[entry.tool] || "›_"}</span>
      <div className="tool-activity-copy">
        <strong>{entry.status === "running" ? entry.title.replace(/ed\b/, "ing") : entry.title}</strong>
        <span>{entry.status === "running" ? entry.command : entry.output}</span>
      </div>
      <span className="tool-state">
        {entry.status === "running" ? <><i /> running</> : <><b>✓</b> {seconds}s</>}
      </span>
      {entry.status === "running" ? <div className="tool-progress"><i style={{ width: `${entry.progress * 100}%` }} /></div> : null}
    </div>
  );
}

const CODE_TOKEN_PATTERN = /(\/\/[^\n]*|"(?:\\.|[^"\\])*"?|'(?:\\.|[^'\\])*'?|\b(?:export|function|const|let|return|if|else|new|async|await|type|interface|extends|import|from|it|expect)\b|\b\d+(?:\.\d+)?\b)/g;
const CODE_KEYWORD_PATTERN = /^(?:export|function|const|let|return|if|else|new|async|await|type|interface|extends|import|from|it|expect)$/;

function HighlightedCode({ code, language }) {
  if (language === "diff") {
    const lines = code.split("\n");
    return lines.map((line, index) => {
      const className = line.startsWith("+")
        ? "diff-addition"
        : line.startsWith("-")
          ? "diff-deletion"
          : line.startsWith("@@")
            ? "diff-hunk"
            : "";
      return (
        <React.Fragment key={`${index}-${line}`}>
          <span className={className}>{line}</span>{index < lines.length - 1 ? "\n" : ""}
        </React.Fragment>
      );
    });
  }

  return code.split(CODE_TOKEN_PATTERN).filter(Boolean).map((token, index) => {
    let className = "";
    if (token.startsWith("//")) className = "syntax-comment";
    else if (token.startsWith('"') || token.startsWith("'")) className = "syntax-string";
    else if (CODE_KEYWORD_PATTERN.test(token)) className = "syntax-keyword";
    else if (/^\d/.test(token)) className = "syntax-number";
    return <span className={className} key={`${index}-${token}`}>{token}</span>;
  });
}

function CodeEntry({ entry }) {
  return (
    <div className="code-entry">
      <div className="code-entry-heading">
        <span>{entry.file}</span>
        <strong>{entry.language}</strong>
      </div>
      <pre><code><HighlightedCode code={entry.text} language={entry.language} />{entry.active ? <span className="cursor" aria-hidden="true" /> : null}</code></pre>
    </div>
  );
}

function AgentOutput({ provider, state, outputRef }) {
  return (
    <div className="agent-output-shell">
      <div className="output-toolbar">
        <span><b className="terminal-dot" /> agent session</span>
      </div>
      <div className="agent-transcript" ref={outputRef} aria-label={`${provider.shortName} simulated coding agent activity`}>
        {state.entries.length ? state.entries.map((entry) => {
          if (entry.kind === "tool") return <ToolEntry key={entry.id} entry={entry} />;
          if (entry.kind === "code") return <CodeEntry key={entry.id} entry={entry} />;
          return (
            <div className="reasoning-entry" key={entry.id}>
              <span className="reasoning-label">Reasoning</span>
              <p>{entry.text}{entry.active ? <span className="cursor" aria-hidden="true" /> : null}</p>
            </div>
          );
        }) : <div className="agent-placeholder">Starting coding session…</div>}
      </div>
    </div>
  );
}

function ProviderPanel({ provider, index, mode, rate, state, onRateChange, outputRef }) {
  return (
    <article className={`agent-card ${provider.id}`}>
      <div className="agent-top">
        <header className="provider-header">
          <div className="provider-identity">
            <ProviderMark provider={provider} />
            <div>
              <h2>{provider.title}</h2>
              <span className="provider-subtitle">decode simulator</span>
            </div>
          </div>
          <div className="completion-time" aria-label={`Currently displaying ${state.liveTps} tokens per second`}>
            <span>DISPLAYING</span>
            <strong>{state.liveTps.toLocaleString()}</strong>
            <small>TOK / S</small>
          </div>
        </header>
        <RateControl provider={provider} index={index} rate={rate} onChange={onRateChange} />
      </div>

      <div className="panel-output">
        {mode === "agent" ? (
          <AgentOutput provider={provider} state={state} outputRef={outputRef} />
        ) : (
          <StoryOutput provider={provider} state={state} outputRef={outputRef} />
        )}
      </div>
    </article>
  );
}

function App() {
  const [mode, setMode] = useState("agent");
  const [rates, setRates] = useState(() => PROVIDERS.map((provider) => provider.defaultRate));
  const storyState = useStoryStreams(rates, mode === "story");
  const agentState = useAgentStreams(rates, mode === "agent");
  const outputRefs = useRef([]);
  const activeState = mode === "agent" ? agentState : storyState;

  useEffect(() => {
    activeState.forEach((_, index) => {
      const output = outputRefs.current[index];
      if (output) output.scrollTop = output.scrollHeight;
    });
  }, [activeState]);

  function updateRate(index, value) {
    setRates((current) => current.map((rate, rateIndex) => (rateIndex === index ? value : rate)));
  }

  return (
    <main className="page-shell">
      <header className="hero">
        <div className="hero-copy">
          <div className="demo-badge">
            <img src="/assets/cerebras-logo.png" alt="" />
            <span>Inference Speed</span>
          </div>
          <p className="eyebrow">CEREBRAS VS GPU · SIMULATED OUTPUT</p>
          <h1>Streaming,<br /><em>in motion.</em></h1>
          <p className="hero-deck">
            Same workload. Same tools. Different decode speeds. Drag the rates apart and watch
            <strong> speed become visible.</strong>
          </p>
        </div>
        <aside className="hero-note" aria-label="Simulation controls">
          <ModeToggle mode={mode} onChange={setMode} />
          <div className="note-copy">
            <span className="note-index">{mode === "agent" ? "AGENT HARNESS" : "CONTINUOUS TEXT"}</span>
            <p>{mode === "agent"
              ? "Both agents receive the same coding tasks. Reasoning and code stream at the selected rate, with periodic 0.7-second tool calls."
              : "Both streams reveal the same looping public-domain passage, so the output never runs out."}</p>
            <span className="note-source">{mode === "agent" ? "LOCAL SIMULATION · NO MODEL OR TOOL IS CALLED" : "L. FRANK BAUM · 1900 · PUBLIC DOMAIN"}</span>
          </div>
        </aside>
      </header>

      <section className="lab-header" aria-labelledby="lab-title">
        <div>
          <span className="section-kicker">LIVE COMPARISON</span>
          <h2 id="lab-title">{mode === "agent" ? "Coding agent" : "Token output"}</h2>
        </div>
      </section>

      <section className="agents-grid" aria-label="Cerebras and GPU inference comparison">
        {PROVIDERS.map((provider, index) => (
          <ProviderPanel
            key={provider.id}
            provider={provider}
            index={index}
            mode={mode}
            rate={rates[index]}
            state={activeState[index]}
            onRateChange={updateRate}
            outputRef={(element) => { outputRefs.current[index] = element; }}
          />
        ))}
      </section>

      <footer className="brand-footer"><img src="/assets/cerebras-wordmark.png" alt="Cerebras" /></footer>
    </main>
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
