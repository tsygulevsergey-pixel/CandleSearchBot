---
title: "Reference: Workflow.resume() | Building Workflows | Mastra Docs"
description: Documentation for the `.resume()` method in workflows, which resumes a suspended workflow run with new data.
---

# Workflow.resume()
[EN] Source: https://mastra.ai/en/reference/workflows/resume

The `.resume()` method resumes a suspended workflow run with new data, allowing you to continue execution from a specific step.

## Usage

```typescript
const run = await counterWorkflow.createRunAsync();
const result = await run.start({ inputData: { startValue: 0 } });

if (result.status === "suspended") {
  const resumedResults = await run.resume({
    step: result.suspended[0],
    resumeData: { newValue: 0 },
  });
}
```

## Parameters

<PropertiesTable
  content={[
    {
      name: "params",
      type: "object",
      description: "Configuration object for resuming the workflow run",
      isOptional: false,
      properties: [
        {
          name: "resumeData",
          type: "ResumeSchema",
          description: "Data for resuming the suspended step",
          isOptional: true,
        },
        {
          name: "step",
          type: "Step | Step[] | string | string[]",
          description: "The step(s) to resume execution from",
          isOptional: false,
        },
        {
          name: "runtimeContext",
          type: "RuntimeContext",
          description: "Runtime context data to use when resuming",
          isOptional: true,
        },
      ],
    },
  ]}
/>

## Returns

<PropertiesTable
  content={[
    {
      name: "resumedResults",
      type: "Promise<WorkflowResult<TOutput, TSteps>>",
      description:
        "A promise that resolves to the result of the resumed workflow run",
    },
  ]}
/>

## Related

- [Suspend and resume](../../docs/workflows/suspend-and-resume.mdx)
- [Human in the loop example](../../examples/workflows/human-in-the-loop.mdx)


