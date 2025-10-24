---
title: "Reference: Step | Building Workflows | Mastra Docs"
description: Documentation for the Step class, which defines individual units of work within a workflow.
---

# Step
[EN] Source: https://mastra.ai/en/reference/workflows/step

The Step class defines individual units of work within a workflow, encapsulating execution logic, data validation, and input/output handling.
It can take either a tool or an agent as a parameter to automatically create a step from them.

## Usage

```typescript
import { createStep } from "@mastra/core/workflows";
import { z } from "zod";

const processOrder = createStep({
  id: "processOrder",
  inputSchema: z.object({
    orderId: z.string(),
    userId: z.string(),
  }),
  outputSchema: z.object({
    status: z.string(),
    orderId: z.string(),
  }),
  resumeSchema: z.object({
    orderId: z.string(),
  }),
  suspendSchema: z.object({}),
  execute: async ({
    inputData,
    mastra,
    getStepResult,
    getInitData,
    suspend,
    runtimeContext,
    runCount
    runId,
  }) => {
    return {
      status: "processed",
      orderId: inputData.orderId,
    };
  },
});
```

## Constructor Parameters

<PropertiesTable
  content={[
    {
      name: "id",
      type: "string",
      description: "Unique identifier for the step",
      required: true,
    },
    {
      name: "description",
      type: "string",
      description: "Optional description of what the step does",
      required: false,
    },
    {
      name: "inputSchema",
      type: "z.ZodType<any>",
      description: "Zod schema defining the input structure",
      required: true,
    },
    {
      name: "outputSchema",
      type: "z.ZodType<any>",
      description: "Zod schema defining the output structure",
      required: true,
    },
    {
      name: "resumeSchema",
      type: "z.ZodType<any>",
      description: "Optional Zod schema for resuming the step",
      required: false,
    },
    {
      name: "suspendSchema",
      type: "z.ZodType<any>",
      description: "Optional Zod schema for suspending the step",
      required: false,
    },
    {
      name: "execute",
      type: "(params: ExecuteParams) => Promise<any>",
      description: "Async function containing step logic",
      required: true,
    }
  ]}
/>

### ExecuteParams

<PropertiesTable
  content={[
    {
      name: "inputData",
      type: "z.infer<TStepInput>",
      description: "The input data matching the inputSchema",
    },
    {
      name: "resumeData",
      type: "z.infer<TResumeSchema>",
      description:
        "The resume data matching the resumeSchema, when resuming the step from a suspended state. Only exists if the step is being resumed.",
    },
    {
      name: "mastra",
      type: "Mastra",
      description: "Access to Mastra services (agents, tools, etc.)",
    },
    {
      name: "getStepResult",
      type: "(stepId: string) => any",
      description: "Function to access results from other steps",
    },
    {
      name: "getInitData",
      type: "() => any",
      description:
        "Function to access the initial input data of the workflow in any step",
    },
    {
      name: "suspend",
      type: "() => Promise<void>",
      description: "Function to pause workflow execution",
    },
    {
      name: "runId",
      type: "string",
      description: "Current run id",
    },
    {
      name: "runtimeContext",
      type: "RuntimeContext",
      isOptional: true,
      description:
        "Runtime context for dependency injection and contextual information.",
    },
    {
      name: "runCount",
      type: "number",
      description: "The run count for this specific step, it automatically increases each time the step runs",
      isOptional: true,
    }
  ]}
/>

## Related

- [Control flow](../../docs/workflows/control-flow.mdx)
- [Using agents and tools](../../docs/workflows/using-with-agents-and-tools.mdx)
- [Tool and agent as step example](../../examples/workflows/agent-and-tool-interop.mdx)
- [Input data mapping](../../docs/workflows/input-data-mapping.mdx)


