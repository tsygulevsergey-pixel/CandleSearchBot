---
title: "Handling Complex LLM Operations | Workflows | Mastra"
description: "Workflows in Mastra help you orchestrate complex sequences of operations with features like branching, parallel execution, resource suspension, and more."
---

import { Steps } from "nextra/components";

# Workflows overview
[EN] Source: https://mastra.ai/en/docs/workflows/overview

Workflows let you define and orchestrate complex sequences of tasks as **typed steps** connected by data flows. Each step has clearly defined inputs and outputs validated by Zod schemas.

A workflow manages execution order, dependencies, branching, parallelism, and error handling — enabling you to build robust, reusable processes. Steps can be nested or cloned to compose larger workflows.

![Workflows overview](/image/workflows/workflows-overview.jpg)

You create workflows by:

- Defining **steps** with `createStep`, specifying input/output schemas and business logic.
- Composing **steps** with `createWorkflow` to define the execution flow.
- Running **workflows** to execute the entire sequence, with built-in support for suspension, resumption, and streaming results.

This structure provides full type safety and runtime validation, ensuring data integrity across the entire workflow.


## Getting started

To use workflows, first import the necessary functions from the workflows module:

```typescript filename="src/mastra/workflows/test-workflow.ts" showLineNumbers copy
import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";
```

### Create step

Steps are the building blocks of workflows. Create a step using `createStep`:

```typescript filename="src/mastra/workflows/test-workflow.ts" showLineNumbers copy
const step1 = createStep({...});
```

> See [createStep](/reference/workflows/step) for more information.

### Create workflow

Create a workflow using `createWorkflow` and complete it with `.commit()`.

```typescript {6,17} filename="src/mastra/workflows/test-workflow.ts" showLineNumbers copy
import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";

const step1 = createStep({...});

export const testWorkflow = createWorkflow({
  id: "test-workflow",
  description: 'Test workflow',
  inputSchema: z.object({
    input: z.string()
  }),
  outputSchema: z.object({
    output: z.string()
  })
})
  .then(step1)
  .commit();
```

> See [workflow](/reference/workflows/workflow) for more information.

#### Composing steps

Workflow steps can be composed and executed sequentially using `.then()`.

```typescript {17,18} filename="src/mastra/workflows/test-workflow.ts" showLineNumbers copy
import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";

const step1 = createStep({...});
const step2 = createStep({...});

export const testWorkflow = createWorkflow({
  id: "test-workflow",
  description: 'Test workflow',
  inputSchema: z.object({
    input: z.string()
  }),
  outputSchema: z.object({
    output: z.string()
  })
})
  .then(step1)
  .then(step2)
  .commit();
```

> Steps can be composed using a number of different methods. See [Control Flow](/docs/workflows/control-flow)  for more information.

#### Cloning steps

Workflow steps can be cloned using `cloneStep()`, and used with any workflow method.

```typescript {5,19} filename="src/mastra/workflows/test-workflow.ts" showLineNumbers copy
import { createWorkflow, createStep, cloneStep } from "@mastra/core/workflows";
import { z } from "zod";

const step1 = createStep({...});
const clonedStep = cloneStep(step1, { id: "cloned-step" });
const step2 = createStep({...});

export const testWorkflow = createWorkflow({
  id: "test-workflow",
  description: 'Test workflow',
  inputSchema: z.object({
    input: z.string()
  }),
  outputSchema: z.object({
    output: z.string()
  })
})
  .then(step1)
  .then(clonedStep)
  .then(step2)
  .commit();
```

### Register workflow

Register a workflow using `workflows` in the main Mastra instance:

```typescript {8} filename="src/mastra/index.ts" showLineNumbers copy
import { Mastra } from "@mastra/core/mastra";
import { PinoLogger } from "@mastra/loggers";
import { LibSQLStore } from "@mastra/libsql";

import { testWorkflow } from "./workflows/test-workflow";

export const mastra = new Mastra({
  workflows: { testWorkflow },
  storage: new LibSQLStore({
    // stores telemetry, evals, ... into memory storage, if it needs to persist, change to file:../mastra.db
    url: ":memory:"
  }),
  logger: new PinoLogger({
    name: "Mastra",
    level: "info"
  })
});
```

### Run workflow
There are two ways to run and test workflows.

<Steps>

#### Mastra Playground

With the Mastra Dev Server running you can run the workflow from the Mastra Playground by visiting [http://localhost:5000/workflows](http://localhost:5000/workflows) in your browser.

#### Command line

Create a run instance of any Mastra workflow using `createRunAsync` and `start`:

```typescript {3,5} filename="src/test-workflow.ts" showLineNumbers copy
import { mastra } from "./mastra";

const run = await mastra.getWorkflow("testWorkflow").createRunAsync();

const result = await run.start({
  inputData: {
    city: "London"
  }
});

console.log(JSON.stringify(result, null, 2));
```
> see [createRunAsync](/reference/workflows/create-run) and [start](/reference/workflows/start) for more information.

To trigger this workflow, run the following:

```bash copy
npx tsx src/test-workflow.ts
```

</Steps>

#### Run workflow results

The result of running a workflow using either `start()` or `resume()` will look like one of the following, depending on the outcome.

##### Status success

```json
{
  "status": "success",
  "steps": {
    // ...
    "step-1": {
      // ...
      "status": "success",
    }
  },
  "result": {
    "output": "London + step-1"
  }
}
```

- **status**: Shows the final state of the workflow execution, either: `success`, `suspended`, or `error`
- **steps**: Lists each step in the workflow, including inputs and outputs
- **status**: Shows the outcome of each individual step
- **result**: Includes the final output of the workflow, typed according to the `outputSchema`


##### Status suspended

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

- **suspended**: An optional array listing any steps currently awaiting input before continuing

##### Status failed

```json
{
  "status": "failed",
  "steps": {
    // ...
    "step-1": {
      // ...
      "status": "failed",
      "error": "Test error",
    }
  },
  "error": "Test error"
}
```
- **error**: An optional field that includes the error message if the workflow fails

### Stream workflow

Similar to the run method shown above, workflows can also be streamed:

```typescript {5} filename="src/test-workflow.ts" showLineNumbers copy
import { mastra } from "./mastra";

const run = await mastra.getWorkflow("testWorkflow").createRunAsync();

const result = await run.stream({
  inputData: {
    city: "London"
  }
});

for await (const chunk of result.stream) {
  console.log(chunk);
}
```

> See [stream](/reference/workflows/stream) and [messages](/reference/workflows/stream#messages) for more information.

### Watch Workflow

A workflow can also be watched, allowing you to inspect each event that is emitted.

```typescript {5} filename="src/test-workflow.ts" showLineNumbers copy
import { mastra } from "./mastra";

const run = await mastra.getWorkflow("testWorkflow").createRunAsync();

run.watch((event) => {
  console.log(event);
});

const result = await run.start({
  inputData: {
    city: "London"
  }
});
```

> See [watch](/reference/workflows/watch) for more information.

## More resources

- The [Workflow Guide](../../guides/guide/ai-recruiter.mdx) in the Guides section is a tutorial that covers the main concepts.
- [Parallel Steps workflow example](../../examples/workflows/parallel-steps.mdx)
- [Conditional Branching workflow example](../../examples/workflows/conditional-branching.mdx)
- [Inngest workflow example](../../examples/workflows/inngest-workflow.mdx)
- [Suspend and Resume workflow example](../../examples/workflows/human-in-the-loop.mdx)


## Workflows (Legacy)

For legacy workflow documentation, see [Workflows (Legacy)](/docs/workflows-legacy/overview).



