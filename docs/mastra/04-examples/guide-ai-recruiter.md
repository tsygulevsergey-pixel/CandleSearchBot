---
title: "Building an AI Recruiter | Mastra Workflows | Guides"
description: Guide on building a recruiter workflow in Mastra to gather and process candidate information using LLMs.
---

# Introduction
[EN] Source: https://mastra.ai/en/guides/guide/ai-recruiter

In this guide, you'll learn how Mastra helps you build workflows with LLMs.

We'll walk through creating a workflow that gathers information from a candidate's resume, then branches to either a technical or behavioral question based on the candidate's profile. Along the way, you'll see how to structure workflow steps, handle branching, and integrate LLM calls.

Below is a concise version of the workflow. It starts by importing the necessary modules, sets up Mastra, defines steps to extract and classify candidate data, and then asks suitable follow-up questions. Each code block is followed by a short explanation of what it does and why it's useful.

## 1. Imports and Setup

You need to import Mastra tools and Zod to handle workflow definitions and data validation.

```ts filename="src/mastra/index.ts" copy
import { Mastra } from "@mastra/core";
import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
```

Add your `OPENAI_API_KEY` to the `.env` file.

```bash filename=".env" copy
OPENAI_API_KEY=<your-openai-key>
```

## 2. Step One: Gather Candidate Info

You want to extract candidate details from the resume text and classify them as technical or non-technical. This step calls an LLM to parse the resume and return structured JSON, including the name, technical status, specialty, and the original resume text. The code reads resumeText from trigger data, prompts the LLM, and returns organized fields for use in subsequent steps.

```ts filename="src/mastra/index.ts" copy
import { Agent } from "@mastra/core/agent";
import { openai } from "@ai-sdk/openai";

const recruiter = new Agent({
  name: "Recruiter Agent",
  instructions: `You are a recruiter.`,
  model: openai("gpt-4o-mini"),
});

const gatherCandidateInfo = createStep({
  id: "gatherCandidateInfo",
  inputSchema: z.object({
    resumeText: z.string(),
  }),
  outputSchema: z.object({
    candidateName: z.string(),
    isTechnical: z.boolean(),
    specialty: z.string(),
    resumeText: z.string(),
  }),
  execute: async ({ inputData }) => {
    const resumeText = inputData?.resumeText;

    const prompt = `
          Extract details from the resume text:
          "${resumeText}"
        `;

    const res = await recruiter.generate(prompt, {
      output: z.object({
        candidateName: z.string(),
        isTechnical: z.boolean(),
        specialty: z.string(),
        resumeText: z.string(),
      }),
    });

    return res.object;
  },
});
```

## 3. Technical Question Step

This step prompts a candidate who is identified as technical for more information about how they got into their specialty. It uses the entire resume text so the LLM can craft a relevant follow-up question. The code generates a question about the candidate's specialty.

```ts filename="src/mastra/index.ts" copy
interface CandidateInfo {
  candidateName: string;
  isTechnical: boolean;
  specialty: string;
  resumeText: string;
}

const askAboutSpecialty = createStep({
  id: "askAboutSpecialty",
  inputSchema: z.object({
    candidateName: z.string(),
    isTechnical: z.boolean(),
    specialty: z.string(),
    resumeText: z.string(),
  }),
  outputSchema: z.object({
    question: z.string(),
  }),
  execute: async ({ inputData }) => {
    const candidateInfo = inputData;

    const prompt = `
          You are a recruiter. Given the resume below, craft a short question
          for ${candidateInfo?.candidateName} about how they got into "${candidateInfo?.specialty}".
          Resume: ${candidateInfo?.resumeText}
        `;
    const res = await recruiter.generate(prompt);

    return { question: res?.text?.trim() || "" };
  },
});
```

## 4. Behavioral Question Step

If the candidate is non-technical, you want a different follow-up question. This step asks what interests them most about the role, again referencing their complete resume text. The code solicits a role-focused query from the LLM.

```ts filename="src/mastra/index.ts" copy
const askAboutRole = createStep({
  id: "askAboutRole",
  inputSchema: z.object({
    candidateName: z.string(),
    isTechnical: z.boolean(),
    specialty: z.string(),
    resumeText: z.string(),
  }),
  outputSchema: z.object({
    question: z.string(),
  }),
  execute: async ({ inputData }) => {
    const candidateInfo = inputData;

    const prompt = `
          You are a recruiter. Given the resume below, craft a short question
          for ${candidateInfo?.candidateName} asking what interests them most about this role.
          Resume: ${candidateInfo?.resumeText}
        `;
    const res = await recruiter.generate(prompt);
    return { question: res?.text?.trim() || "" };
  },
});
```

## 5. Define the Workflow

You now combine the steps to implement branching logic based on the candidate's technical status. The workflow first gathers candidate data, then either asks about their specialty or about their role, depending on isTechnical. The code chains gatherCandidateInfo with askAboutSpecialty and askAboutRole, and commits the workflow.

```ts filename="src/mastra/index.ts" copy
const candidateWorkflow = createWorkflow({
  id: "candidate-workflow",
  inputSchema: z.object({
    resumeText: z.string(),
  }),
  outputSchema: z.object({
    question: z.string(),
  }),
});

candidateWorkflow.then(gatherCandidateInfo).branch([
  // Branch for technical candidates
  [
    async ({ inputData }) => {
      return inputData?.isTechnical;
    },
    askAboutSpecialty,
  ],
  // Branch for non-technical candidates
  [
    async ({ inputData }) => {
      return !inputData?.isTechnical;
    },
    askAboutRole,
  ],
]);

candidateWorkflow.commit();
```

## 6. Execute the Workflow

```ts filename="src/mastra/index.ts" copy
const mastra = new Mastra({
  workflows: {
    candidateWorkflow,
  },
});

(async () => {
  const run = await mastra.getWorkflow("candidateWorkflow").createRunAsync();

  console.log("Run", run.runId);

  const runResult = await run.start({
    inputData: { resumeText: "Simulated resume content..." },
  });

  console.log("Final output:", runResult);
})();
```

You've just built a workflow to parse a resume and decide which question to ask based on the candidate's technical abilities. Congrats and happy hacking!


