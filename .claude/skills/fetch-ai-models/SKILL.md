---
name: fetch-ai-models
description: Workflow padrão para buscar via API os modelos de IA mais recentes disponíveis nos provedores (OpenAI, Anthropic, Google) antes de fixar um model ID no código. Use antes de atualizar modelos em src/lib/dashboard/aiFallback.ts ou decidir qual versão de modelo usar. (Convertido de .agents/skills/fetch-ai-models/SKILL.md)
---

# Fetch AI Models Workflow

Sempre que for atualizar os modelos de IA no código (ex: `aiFallback.ts`) ou decidir qual versão de modelo usar, verifique os modelos ativos via API dos provedores para evitar selecionar modelos depreciados.

Siga este workflow para buscar os modelos via `Bash`.

## 1. OpenAI

Para buscar a lista de modelos disponíveis da OpenAI:

```bash
# Requer OPENAI_API_KEY definida no ambiente ou passada diretamente
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY"
```
Filtre a resposta JSON pelo campo `id` para localizar modelos como `gpt-4o`, `gpt-4-turbo`, etc.

## 2. Anthropic (Claude)

Os modelos da Anthropic geralmente estão listados na documentação oficial da API. Se houver um endpoint disponível, use-o. Atualmente a Anthropic não possui um endpoint público `/v1/models`; a melhor forma de checar os modelos Claude ativos é consultar a documentação oficial da Anthropic ou confiar nos nomes de modelo explicitamente informados pelo usuário.

## 3. Google Gemini (Google AI Studio)

Para buscar a lista de modelos Gemini disponíveis:

```bash
# Requer GEMINI_API_KEY
curl "https://generativelanguage.googleapis.com/v1beta/models?key=$GEMINI_API_KEY"
```
Filtre a resposta JSON pelo campo `name` e procure por `gemini-1.5-pro`, `gemini-1.5-flash`, etc.

## Passos acionáveis

1. Identifique qual provedor o usuário quer atualizar ou usar.
2. Se `OPENAI_API_KEY` ou `GEMINI_API_KEY` não estiverem definidas no ambiente, você pode pedir ao usuário a saída desses curls ou uma chave temporária.
3. Analise a saída JSON e selecione os modelos mais custo-efetivos e capazes com base na tarefa (ex: Flash/Haiku para tarefas rápidas, Opus/Pro para tarefas complexas).
4. Aplique os IDs de modelo atualizados em `src/lib/dashboard/aiFallback.ts` ou no arquivo de configuração relevante.
