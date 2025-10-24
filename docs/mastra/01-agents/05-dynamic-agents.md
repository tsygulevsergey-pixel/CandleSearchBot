---
title: "Dynamic Agents"
description: Dynamically configure your agent's instruction, model and tools using runtime context.
---

# Dynamic Agents
[EN] Source: https://mastra.ai/en/docs/agents/dynamic-agents

Dynamic agents use [runtime context](./runtime-variables), like user IDs and other important parameters, to adjust their settings in real-time.

This means they can change the model they use, update their instructions, and select different tools as needed.

By using this context, agents can better respond to each user's needs. They can also call any API to gather more information, which helps improve what the agents can do.

### Example Configuration

Here's an example of a dynamic support agent that adjusts its behavior based on the user's subscription tier and language preferences:

```typescript
const supportAgent = new Agent({
  name: "Dynamic Support Agent",

  instructions: async ({ runtimeContext }) => {
    const userTier = runtimeContext.get("user-tier");
    const language = runtimeContext.get("language");

    return `You are a customer support agent for our SaaS platform.
    The current user is on the ${userTier} tier and prefers ${language} language.
    
    For ${userTier} tier users:
    ${userTier === "free" ? "- Provide basic support and documentation links" : ""}
    ${userTier === "pro" ? "- Offer detailed technical support and best practices" : ""}
    ${userTier === "enterprise" ? "- Provide priority support with custom solutions" : ""}
    
    Always respond in ${language} language.`;
  },

  model: ({ runtimeContext }) => {
    const userTier = runtimeContext.get("user-tier");
    return userTier === "enterprise"
      ? openai("gpt-4")
      : openai("gpt-3.5-turbo");
  },

  tools: ({ runtimeContext }) => {
    const userTier = runtimeContext.get("user-tier");
    const baseTools = [knowledgeBase, ticketSystem];

    if (userTier === "pro" || userTier === "enterprise") {
      baseTools.push(advancedAnalytics);
    }

    if (userTier === "enterprise") {
      baseTools.push(customIntegration);
    }

    return baseTools;
  },
});
```

In this example, the agent:

- Adjusts its instructions based on the user's subscription tier (free, pro, or enterprise)
- Uses a more powerful model (GPT-4) for enterprise users
- Provides different sets of tools based on the user's tier
- Responds in the user's preferred language

This demonstrates how a single agent can handle different types of users and scenarios by leveraging runtime context, making it more flexible and maintainable than creating separate agents for each use case.

For a complete implementation example including API routes, middleware setup, and runtime context handling, see our [Dynamic Agents Example](/examples/agents/dynamic-agents).


