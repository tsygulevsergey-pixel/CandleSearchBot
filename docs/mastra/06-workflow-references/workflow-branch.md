---
title: "Reference: Workflow.branch() | Building Workflows | Mastra Docs"
description: Documentation for the `.branch()` method in workflows, which creates conditional branches between steps.
---

# Workflow.branch()
[EN] Source: https://mastra.ai/en/reference/workflows/branch

The `.branch()` method creates conditional branches between workflow steps, allowing for different paths to be taken based on the result of a previous step.

## Usage

```typescript
workflow.branch([
  [async ({ context }) => true, stepOne],
  [async ({ context }) => false, stepTwo],
]);
```

## Parameters

<PropertiesTable
  content={[
    {
      name: "steps",
      type: "[() => boolean, Step]",
      description:
        "An array of tuples, each containing a condition function and a step to execute if the condition is true",
      isOptional: false,
    },
  ]}
/>

## Returns

<PropertiesTable
  content={[
    {
      name: "workflow",
      type: "NewWorkflow",
      description: "The workflow instance for method chaining",
    },
  ]}
/>

## Related

- [Conditional branching](../../docs/workflows/flow-control.mdx#conditional-branching)
- [Conditional branching example](../../examples/workflows/conditional-branching.mdx)


