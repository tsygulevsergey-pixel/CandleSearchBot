---
title: "Suspend & Resume Workflows | Human-in-the-Loop | Mastra Docs"
description: "Suspend and resume in Mastra workflows allows you to pause execution while waiting for external input or resources."
---

# Suspend & Resume
[EN] Source: https://mastra.ai/en/docs/workflows/suspend-and-resume

Workflows can be paused at any step, with their current state persisted as a snapshot in storage. Execution can then be resumed from this saved snapshot when ready. Persisting the snapshot ensures the workflow state is maintained across sessions, deployments, and server restarts, essential for workflows that may remain suspended while awaiting external input or resources.

Common scenarios for suspending workflows include:

- Waiting for human approval or input
- Pausing until external API resources become available
- Collecting additional data needed for later steps
- Rate limiting or throttling expensive operations
- Handling event-driven processes with external triggers

## Workflow status types

When running a workflow, its `status` can be one of the following:

- `running` - The workflow is currently running
- `suspended` - The workflow is suspended
- `success` - The workflow has completed
- `failed` - The workflow has failed

## Suspending a workflow with `suspend()`

When the state is `suspended`, you can identify any and all steps that have been suspended by looking at the `suspended` array of the workflow result output.

![Suspending a workflow with suspend()](/image/workflows/workflows-suspend-resume-suspend.jpg)

```typescript {18} filename="src/mastra/workflows/test-workflow.ts" showLineNumbers copy
const step1 = createStep({
  id: "step-1",
  description: "Test suspend",
  inputSchema: z.object({
    input: z.string()
  }),
  outputSchema: z.object({
    output: z.string()
  }),
  suspendSchema: z.object({}),
  resumeSchema: z.object({
    city: z.string()
  }),
  execute: async ({ resumeData, suspend }) => {
    const { city } = resumeData ?? {};

    if (!city) {
      await suspend({});
      return { output: "" };
    }

    return { output: "" };
  }
});

export const testWorkflow = createWorkflow({})
  .then(step1)
  .commit();
```

> See [Define Suspendable workflow](/examples/workflows/human-in-the-loop#define-suspendable-workflow) for more information.

### Identifying suspended steps

To resume a suspended workflow, inspect the `suspended` array in the result to determine which step needs input:

```typescript {15} filename="src/mastra/workflows/test-workflow.ts" showLineNumbers copy
import { mastra } from "./mastra";

const run = await mastra.getWorkflow("testWorkflow").createRunAsync();

const result = await run.start({
  inputData: {
    city: "London"
  }
});

console.log(JSON.stringify(result, null, 2));

if (result.status === "suspended") {
  const resumedResult = await run.resume({
    step: result.suspended[0],
    resumeData: {
      city: "Berlin"
    }
  });
}

```

In this case, the logic resumes the first step listed in the `suspended` array. A `step` can also be defined using it's `id`, for example: 'step-1'.

```json
{
  "status": "suspended",
  "steps": {
    // ...
    "step-1": {
      // ...
      "status": "suspended",
    }
  },
  "suspended": [
    [
      "step-1"
    ]
  ]
}
```

> See [Run Workflow Results](/workflows/overview#run-workflow-results) for more details.

## Resuming a workflow with `resume()`

A workflow can be resumed by calling `resume` and providing the required `resumeData`.

```typescript {16-18} filename="src/mastra/workflows/test-workflow.ts" showLineNumbers copy
import { mastra } from "./mastra";

const run = await mastra.getWorkflow("testWorkflow").createRunAsync();

const result = await run.start({
   inputData: {
    city: "London"
  }
});

console.log(JSON.stringify(result, null, 2));

if (result.status === "suspended") {
  const resumedResult = await run.resume({
    step: 'step-1',
    resumeData: {
      city: "Berlin"
    }
  });

  console.log(JSON.stringify(resumedResult, null, 2));
}
```

### Resuming nested workflows

To resume a suspended nested workflow pass the workflow instance to the `step` parameter of the `resume` function.

```typescript {33-34} filename="src/mastra/workflows/test-workflow.ts" showLineNumbers copy
const dowhileWorkflow = createWorkflow({
  id: 'dowhile-workflow',
  inputSchema: z.object({ value: z.number() }),
  outputSchema: z.object({ value: z.number() }),
})
  .dountil(
    createWorkflow({
      id: 'simple-resume-workflow',
      inputSchema: z.object({ value: z.number() }),
      outputSchema: z.object({ value: z.number() }),
      steps: [incrementStep, resumeStep],
    })
      .then(incrementStep)
      .then(resumeStep)
      .commit(),
    async ({ inputData }) => inputData.value >= 10,
  )
  .then(
    createStep({
      id: 'final',
      inputSchema: z.object({ value: z.number() }),
      outputSchema: z.object({ value: z.number() }),
      execute: async ({ inputData }) => ({ value: inputData.value }),
    }),
  )
  .commit();

const run = await dowhileWorkflow.createRunAsync();
const result = await run.start({ inputData: { value: 0 } });

if (result.status === "suspended") {
  const resumedResult = await run.resume({
    resumeData: { value: 2 },
    step: ['simple-resume-workflow', 'resume'],
  });

  console.log(JSON.stringify(resumedResult, null, 2));
}
```

## Using `RuntimeContext` with suspend/resume

When using suspend/resume with `RuntimeContext`, you can create the instance yourself, and pass it to the `start` and `resume` functions.
`RuntimeContext` is not automatically shared on a workflow run.

```typescript {1,4,9,16} filename="src/mastra/workflows/test-workflow.tss" showLineNumbers copy
import { RuntimeContext } from "@mastra/core/di";
import { mastra } from "./mastra";

const runtimeContext = new RuntimeContext();
const run = await mastra.getWorkflow("testWorkflow").createRunAsync();

const result = await run.start({
  inputData: { suggestions: ["London", "Paris", "New York"] },
  runtimeContext
});

if (result.status === "suspended") {
  const resumedResult = await run.resume({
    step: 'step-1',
    resumeData: { city: "New York" },
    runtimeContext
  });
}
```


