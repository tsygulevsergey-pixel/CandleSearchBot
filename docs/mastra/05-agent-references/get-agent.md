---
title: "Reference: getAgent() | Agent Config | Agents | Mastra Docs"
description: API Reference for getAgent.
---

# `getAgent()`
[EN] Source: https://mastra.ai/en/reference/agents/getAgent

Retrieve an agent based on the provided configuration

```ts showLineNumbers copy
async function getAgent({
  connectionId,
  agent,
  apis,
  logger,
}: {
  connectionId: string;
  agent: Record<string, any>;
  apis: Record<string, IntegrationApi>;
  logger: any;
}): Promise<(props: { prompt: string }) => Promise<any>> {
  return async (props: { prompt: string }) => {
    return { message: "Hello, world!" };
  };
}
```

## API Signature

### Parameters

<PropertiesTable
  content={[
    {
      name: "connectionId",
      type: "string",
      description: "The connection ID to use for the agent's API calls.",
    },
    {
      name: "agent",
      type: "Record<string, any>",
      description: "The agent configuration object.",
    },
    {
      name: "apis",
      type: "Record<string, IntegrationAPI>",
      description: "A map of API names to their respective API objects.",
    },
  ]}
/>

### Returns

<PropertiesTable content={[]} />


