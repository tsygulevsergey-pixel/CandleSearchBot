---
title: "Branching, Merging, Conditions | Workflows | Mastra Docs"
description: "Control flow in Mastra workflows allows you to manage branching, merging, and conditions to construct workflows that meet your logic requirements."
---

# Control Flow
[EN] Source: https://mastra.ai/en/docs/workflows/control-flow

When you build a workflow, you typically break down operations into smaller tasks that can be linked and reused. **Steps** provide a structured way to manage these tasks by defining inputs, outputs, and execution logic.

- If the schemas match, the `outputSchema` from each step is automatically passed to the `inputSchema` of the next step.
- If the schemas don't match, use [Input data mapping](./input-data-mapping.mdx) to transform the `outputSchema` into the expected `inputSchema`.

## Chaining steps with `.then()`

Chain steps to execute sequentially using `.then()`:

![Chaining steps with .then()](/image/workflows/workflows-control-flow-then.jpg)

```typescript {8-9,4-5} filename="src/mastra/workflows/test-workflow.ts" showLineNumbers copy
import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";

const step1 = createStep({...});
const step2 = createStep({...});

export const testWorkflow = createWorkflow({...})
  .then(step1)
  .then(step2)
  .commit();
```

This does what you'd expect: it executes `step1`, then it executes `step2`.

## Simultaneous steps with `.parallel()`

Execute steps simultaneously using `.parallel()`:

![Concurrent steps with .parallel()](/image/workflows/workflows-control-flow-parallel.jpg)

```typescript {8,4-5} filename="src/mastra/workflows/test-workflow.ts" showLineNumbers copy
import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";

const step1 = createStep({...});
const step2 = createStep({...});
const step3 = createStep({...});

export const testWorkflow = createWorkflow({...})
  .parallel([step1, step2])
  .then(step3)
  .commit();
```

This executes `step1` and `step2` concurrently, then continues to `step3` after both complete.

> See [Parallel Execution with Steps](/examples/workflows/parallel-steps) for more information.

## Conditional logic with `.branch()`

Execute steps conditionally using `.branch()`:

![Conditional branching with .branch()](/image/workflows/workflows-control-flow-branch.jpg)

```typescript {8-11,4-5} filename="src/mastra/workflows/test-workflow.ts" showLineNumbers copy
import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";

const lessThanStep = createStep({...});
const greaterThanStep = createStep({...});

export const testWorkflow = createWorkflow({...})
  .branch([
    [async ({ inputData: { value } }) => (value < 9), lessThanStep],
    [async ({ inputData: { value } }) => (value >= 9), greaterThanStep]
  ])
  .commit();
```

Branch conditions are evaluated sequentially, but steps with matching conditions are executed in parallel.

> See [Workflow with Conditional Branching](/examples/workflows/conditional-branching) for more information.

## Looping steps

Workflows support two types of loops. When looping a step, or any step-compatible construct like a nested workflow, the initial `inputData` is sourced from the output of the previous step.

To ensure compatibility, the loop’s initial input must either match the shape of the previous step’s output, or be explicitly transformed using the `map` function.

- Match the shape of the previous step’s output, or
- Be explicitly transformed using the `map` function.

### Repeating with `.dowhile()`

Executes step repeatedly while a condition is true.

![Repeating with .dowhile()](/image/workflows/workflows-control-flow-dowhile.jpg)

```typescript {7} filename="src/mastra/workflows/test-workflow.ts" showLineNumbers copy
import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";

const counterStep = createStep({...});

export const testWorkflow = createWorkflow({...})
  .dowhile(counterStep, async ({ inputData: { number } }) => number < 10)
  .commit();
```

### Repeating with `.dountil()`

Executes step repeatedly until a condition becomes true.

![Repeating with .dountil()](/image/workflows/workflows-control-flow-dountil.jpg)

```typescript {7} filename="src/mastra/workflows/test-workflow.ts" showLineNumbers copy
import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";

const counterStep = createStep({...});

export const testWorkflow = createWorkflow({...})
  .dountil(counterStep, async ({ inputData: { number } }) => number > 10)
  .commit();
```

### Repeating with `.foreach()`

Sequentially executes the same step for each item from the `inputSchema`.

![Repeating with .foreach()](/image/workflows/workflows-control-flow-foreach.jpg)

```typescript {7} filename="src/mastra/workflows/test-workflow.ts" showLineNumbers copy
import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";

const mapStep = createStep({...});

export const testWorkflow = createWorkflow({...})
  .foreach(mapStep)
  .commit();
```

#### Setting concurrency limits

Use `concurrency` to execute steps in parallel with a limit on the number of concurrent executions.

```typescript {7} filename="src/mastra/workflows/test-workflow.ts" showLineNumbers copy
import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";

const mapStep = createStep({...})

export const testWorkflow = createWorkflow({...})
  .foreach(mapStep, { concurrency: 2 })
  .commit();
```

## Using a nested workflow

Use a nested workflow as a step by passing it to `.then()`. This runs each of its steps in sequence as part of the parent workflow.

```typescript {4,7} filename="src/mastra/workflows/test-workflow.ts" showLineNumbers copy
import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";

export const nestedWorkflow = createWorkflow({...})

export const testWorkflow = createWorkflow({...})
  .then(nestedWorkflow)
  .commit();
```

## Cloning a workflow

Use `cloneWorkflow` to duplicate an existing workflow. This lets you reuse its structure while overriding parameters like `id`.

```typescript {6,10} filename="src/mastra/workflows/test-workflow.ts" showLineNumbers copy
import { createWorkflow, createStep, cloneWorkflow } from "@mastra/core/workflows";
import { z } from "zod";

const step1 = createStep({...});
const parentWorkflow = createWorkflow({...})
const clonedWorkflow = cloneWorkflow(parentWorkflow, { id: "cloned-workflow" });

export const testWorkflow = createWorkflow({...})
  .then(step1)
  .then(clonedWorkflow)
  .commit();
```

## Exiting early with `bail()`

Use `bail()` in a step to exit early with a successful result. This returns the provided payload as the step output and ends workflow execution.

```typescript {7} filename="src/mastra/workflows/test-workflow.ts" showLineNumbers copy
import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";

const step1 = createStep({
  id: 'step1',
  execute: async ({ bail }) => {
    return bail({ result: 'bailed' });
  },
  inputSchema: z.object({ value: z.string() }),
  outputSchema: z.object({ result: z.string() }),
});

export const testWorkflow = createWorkflow({...})
  .then(step1)
  .commit();
```

## Exiting early with `Error()`

Use `throw new Error()` in a step to exit with an error.

```typescript {7} filename="src/mastra/workflows/test-workflow.ts" showLineNumbers copy
import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";

const step1 = createStep({
  id: 'step1',
  execute: async () => {
    throw new Error('bailed');
  },
  inputSchema: z.object({ value: z.string() }),
  outputSchema: z.object({ result: z.string() }),
});

export const testWorkflow = createWorkflow({...})
  .then(step1)
  .commit();
```

This throws an error from the step and stops workflow execution, returning the error as the result.

## Example Run Instance

The following example demonstrates how to start a run with multiple inputs. Each input will pass through the `mapStep` sequentially.

```typescript {6} filename="src/test-workflow.ts" showLineNumbers copy
import { mastra } from "./mastra";

const run = await mastra.getWorkflow("testWorkflow").createRunAsync();

const result = await run.start({
  inputData: [{ number: 10 }, { number: 100 }, { number: 200 }]
});
```

To execute this run from your terminal:

```bash copy
npx tsx src/test-workflow.ts
```


