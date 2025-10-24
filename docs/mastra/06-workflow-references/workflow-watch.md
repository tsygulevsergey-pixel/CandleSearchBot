---
title: "Reference: Workflow.watch() | Building Workflows | Mastra Docs"
description: Documentation for the `.watch()` method in workflows, which allows you to monitor the execution of a workflow run.
---

# Workflow.watch()
[EN] Source: https://mastra.ai/en/reference/workflows/watch

The `.watch()` method allows you to monitor the execution of a workflow run, providing real-time updates on the status of steps.

## Usage

```typescript
const run = await myWorkflow.createRunAsync();

// Add a watcher to monitor execution
run.watch(event => {
  console.log('Step completed:', event.payload.currentStep.id);
});

// Start the workflow
const result = await run.start({ inputData: {...} });
```

## Parameters

<PropertiesTable
  content={[
    {
      name: "cb",
      type: "(event: WatchEvent) => void",
      description:
        "A callback function that is called whenever a step is completed or the workflow state changes",
      isOptional: false,
    },
  ]}
/>

## Returns

<PropertiesTable
  content={[
    {
      name: "unwatch",
      type: "() => void",
      description:
        "A function that can be called to stop watching the workflow run",
    },
  ]}
/>

## Related

- [Suspend and resume](../../docs/workflows/suspend-and-resume.mdx)
- [Human in the loop example](../../examples/workflows/human-in-the-loop.mdx)
- [Snapshot Reference](./snapshots.mdx)
- [Workflow watch guide](../../docs/workflows/overview.mdx#watching-workflow-execution)


