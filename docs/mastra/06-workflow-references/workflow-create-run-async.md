---
title: "Reference: Workflow.createRunAsync() | Building Workflows | Mastra Docs"
description: Documentation for the `.createRunAsync()` method in workflows, which creates a new workflow run instance.
---

# Workflow.createRunAsync()
[EN] Source: https://mastra.ai/en/reference/workflows/create-run

The `.createRunAsync()` method creates a new workflow run instance, allowing you to execute the workflow with specific input data.

## Usage

```typescript
const myWorkflow = createWorkflow({
  id: "my-workflow",
  inputSchema: z.object({
    startValue: z.string(),
  }),
  outputSchema: z.object({
    result: z.string(),
  }),
  steps: [step1, step2, step3], // Declare steps used in this workflow
})
  .then(step1)
  .then(step2)
  .then(step3)
  .commit();

const mastra = new Mastra({
  workflows: {
    myWorkflow,
  },
});

const run = await mastra.getWorkflow("myWorkflow").createRunAsync();
```

## Parameters

<PropertiesTable
  content={[
    {
      name: "options",
      type: "{ runId?: string }",
      description:
        "Optional configuration for the run, including a custom run ID",
      isOptional: true,
    },
  ]}
/>

## Returns

<PropertiesTable
  content={[
    {
      name: "run",
      type: "Run",
      description:
        "A new workflow run instance that can be used to execute the workflow",
    },
  ]}
/>

## Related

- [Running workflows](../../docs/workflows/overview.mdx#running-workflows)


