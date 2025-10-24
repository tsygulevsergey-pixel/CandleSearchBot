---
title: "Reference: Workflow.commit() | Building Workflows | Mastra Docs"
description: Documentation for the `.commit()` method in workflows, which finalizes the workflow and returns the final result.
---

# Workflow.commit()
[EN] Source: https://mastra.ai/en/reference/workflows/commit

The `.commit()` method finalizes the workflow and returns the final result.

## Usage

```typescript
workflow.then(stepOne).commit();
```

## Returns

<PropertiesTable
  content={[
    {
      name: "workflow",
      type: "Workflow",
      description: "The workflow instance for method chaining",
    },
  ]}
/>

## Related

- [Control flow](../../docs/workflows/control-flow.mdx)


