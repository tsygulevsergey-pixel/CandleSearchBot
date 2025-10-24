---
title: "Reference: Workflow.sleep() | Building Workflows | Mastra Docs"
description: Documentation for the `.sleep()` method in workflows, which pauses execution for a specified number of milliseconds.
---

# Workflow.sleep()
[EN] Source: https://mastra.ai/en/reference/workflows/sleep

The `.sleep()` method pauses execution for a specified number of milliseconds.

## Usage

```typescript
workflow.sleep(1000);
```

## Parameters

<PropertiesTable
  content={[
    {
      name: "milliseconds",
      type: "number",
      description: "The number of milliseconds to pause execution",
      isOptional: false,
    },
  ]}
/>

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

- [Sleep & Events](../../docs/workflows/pausing-execution.mdx)


