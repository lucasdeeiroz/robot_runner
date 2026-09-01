# Robot Runner AI — Contexto raiz

Aplicação desktop de QA mobile (Tauri v2 + Rust + React/TypeScript), com um app companion nativo em Kotlin. A pasta `.agents/` é o hub multi-IA canônico deste repositório (perfis, rules e skills reaproveitados por Cursor/Windsurf/Gemini CLI/Antigravity); os arquivos abaixo apenas conectam esse conteúdo ao Claude Code nativamente — não duplique regras aqui, edite a fonte em `.agents/`.

## Como o Claude Code está conectado ao hub `.agents/`
- **Subagentes** (`.claude/agents/`): um por perfil de `.agents/profiles/` (`frontend-specialist`, `rust-performance-architect`, `autonomous-executor`, `desktop-architect`, `android-companion-engineer`) + `qa-automation-specialist` (de `.agents/rules/qa-automation-specialist.md`).
- **Skills** (`.claude/skills/`): cópias nativas de `.agents/skills/*/SKILL.md` (`adb-diagnostics`, `create-robot-test`, `evidence-based-debugging`, `fetch-ai-models`, `ui-visual-bug-resolution`).
- **Rules** (`.agents/rules/*.md`, todas `trigger: always_on`): importadas via `@` neste `CLAUDE.md` e nos `CLAUDE.md` de `src/`, `src-tauri/` e `companion/` — o Claude Code carrega automaticamente o `CLAUDE.md` mais próximo da pasta em que está trabalhando, preservando o escopo por stack que essas rules tinham nas outras IDEs.

## Rules sempre carregadas (independem da stack tocada)

@.agents/rules/documentation.md

@.agents/rules/ai-engineering.md
