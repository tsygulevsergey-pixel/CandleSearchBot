---
title: "Pausing Execution | Mastra Docs"
description: "Pausing execution in Mastra workflows allows you to pause execution while waiting for external input or resources via .sleep(), .sleepUntil() and .waitForEvent()."
---

# Sleep & Events
[EN] Source: https://mastra.ai/en/docs/workflows/pausing-execution

Mastra lets you pause workflow execution when waiting for external input or timing conditions. This can be useful for things like polling, delayed retries, or waiting on user actions.

You can pause execution using:

- `sleep()`: Pause for a set number of milliseconds
- `sleepUntil()`: Pause until a specific timestamp
- `waitForEvent()`: Pause until an external event is received
- `sendEvent()`: Send an event to resume a waiting workflow

When using any of these methods, the workflow status is set to `waiting` until execution resumes.

## Pausing with `.sleep()`

The `sleep()` method pauses execution between steps for a specified number of milliseconds.

```typescript {9} filename="src/mastra/workflows/test-workflow.ts" showLineNumbers copy
import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";

const step1 = createStep({...});
const step2 = createStep({...});

export const testWorkflow = createWorkflow({...})
  .then(step1)
  .sleep(1000)
  .then(step2)
  .commit();
```

### Pausing with `.sleep(callback)`

The `sleep()` method also accepts a callback that returns the number of milliseconds to pause. The callback receives `inputData`, allowing the delay to be computed dynamically.

```typescript {9} filename="src/mastra/workflows/test-workflow.ts" showLineNumbers copy
import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";

const step1 = createStep({...});
const step2 = createStep({...});

export const testWorkflow = createWorkflow({...})
  .then(step1)
  .sleep(async ({ inputData }) => {
    const { delayInMs }  = inputData
    return delayInMs;
  })
  .then(step2)
  .commit();
```

## Pausing with `.sleepUntil()`

The `sleepUntil()` method pauses execution between steps until a specified date.

```typescript {9} filename="src/mastra/workflows/test-workflow.ts" showLineNumbers copy
import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";

const step1 = createStep({...});
const step2 = createStep({...});

export const testWorkflow = createWorkflow({...})
  .then(step1)
  .sleepUntil(new Date(Date.now() + 5000))
  .then(step2)
  .commit();
```

### Pausing with `.sleepUntil(callback)`

The `sleepUntil()` method also accepts a callback that returns a `Date` object. The callback receives `inputData`, allowing the target time to be computed dynamically.

```typescript {9} filename="src/mastra/workflows/test-workflow.ts" showLineNumbers copy
import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";

const step1 = createStep({...});
const step2 = createStep({...});

export const testWorkflow = createWorkflow({...})
  .then(step1)
  .sleepUntil(async ({ inputData }) => {
    const { delayInMs }  = inputData
    return new Date(Date.now() + delayInMs);
  })
  .then(step2)
  .commit();
```


> `Date.now()` is evaluated when the workflow starts, not at the moment the `sleepUntil()` method is called.

## Pausing with `.waitForEvent()`

The `waitForEvent()` method pauses execution until a specific event is received. Use `run.sendEvent()` to send the event. You must provide both the event name and the step to resume.

![Pausing with .waitForEvent()](/image/workflows/workflows-sleep-events-waitforevent.jpg)

```typescript {10} filename="src/mastra/workflows/test-workflow.ts" showLineNumbers copy
import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";

const step1 = createStep({...});
const step2 = createStep({...});
const step3 = createStep({...});

export const testWorkflow = createWorkflow({...})
  .then(step1)
  .waitForEvent("my-event-name", step2)
  .then(step3)
  .commit();
```
## Sending an event with `.sendEvent()`

The `.sendEvent()` method sends an event to the workflow. It accepts the event name and optional event data, which can be any JSON-serializable value.

```typescript {5,12,15} filename="src/test-workflow.ts" showLineNumbers copy
import { mastra } from "./mastra";

const run = await mastra.getWorkflow("testWorkflow").createRunAsync();

const result = run.start({
  inputData: {
    value: "hello"
  }
});

setTimeout(() => {
  run.sendEvent("my-event-name", { value: "from event" });
}, 3000);

console.log(JSON.stringify(await result, null, 2));
```

> In this example, avoid using `await run.start()` directly, it would block sending the event before the workflow reaches its waiting state.


