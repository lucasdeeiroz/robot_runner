---
name: Fetch AI Models Workflow
description: A standard workflow for agents to fetch the latest available models from AI providers (OpenAI, Anthropic, Google) via their REST APIs.
---

# Fetch AI Models Workflow

Whenever you are tasked with updating AI models in the codebase (e.g., `aiFallback.ts`) or making a decision on which model version to use, you should verify the currently active models using the providers' APIs to avoid selecting deprecated models.

Follow this workflow to fetch the models via CLI (`run_command`).

## 1. OpenAI

To fetch the list of available OpenAI models:

```bash
# Requires OPENAI_API_KEY to be set in the environment or passed directly
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY"
```
Filter the JSON response by `id` to find models like `gpt-4o`, `gpt-4-turbo`, etc.

## 2. Anthropic (Claude)

Anthropic models are generally listed in their API documentation. However, if an endpoint is available, use it. Usually, you can query Anthropic's model list if supported, or check the current SDK definitions.
Currently, Anthropic does not have a public `/v1/models` endpoint. The best way to check for active Claude models is to query the official Anthropic documentation or rely on the user's explicit model names.

## 3. Google Gemini (Google AI Studio)

To fetch the list of available Gemini models:

```bash
# Requires GEMINI_API_KEY
curl "https://generativelanguage.googleapis.com/v1beta/models?key=$GEMINI_API_KEY"
```
Filter the JSON response by `name` and look for `gemini-1.5-pro`, `gemini-1.5-flash`, etc.

## Actionable Steps for Agents:
1. Identify which provider the user wants to update or use.
2. If `OPENAI_API_KEY` or `GEMINI_API_KEY` are not set in your environment, you may ask the user to provide the output of these curls or provide a temporary key.
3. Analyze the JSON output, select the most cost-effective and capable models based on the task (e.g. Flash/Haiku for fast tasks, Opus/Pro for complex tasks).
4. Apply the updated model IDs to `src/lib/dashboard/aiFallback.ts` or the relevant configuration file.
