---
name: evidence-based-debugging
description: Workflow passo-a-passo para depurar bugs baseando-se em evidências e injeção de logs em vez de adivinhação cega. Invoque esta skill quando estiver lidando com um erro de lógica ("estado não atualizando", "loop infinito", etc) no ecossistema do Robot Runner (React ou Rust).
---

# Evidence-Based Debugging & Logging Rules

Quando confrontado com um erro de lógica, siga **exatamente** o procedimento abaixo:

1. **Abordagem Baseada em Evidências**: **NUNCA** tente adivinhar a causa e fazer substituições de código baseadas em suposições às cegas.
2. **Injeção de Logs Estratégicos**: A sua PRIMEIRA ação de modificação de código deve ser injetar logs detalhados (`console.log`, `console.trace`, ou `tracing::info!` no Rust) próximos ao ponto de falha suspeito.
3. **Observação e Validação**: Após injetar os logs, execute a aplicação ou instrua o usuário a reproduzir o erro, e **leia a saída do log** antes de tomar qualquer decisão arquitetural.
4. **Divisão de Responsabilidade**: Se o erro envolver a ponte IPC (Inter-Process Communication) entre Tauri (Rust) e React (Frontend), adicione logs de ambos os lados simultaneamente (antes do `invoke` e no início do `#[tauri::command]`) para isolar se a falha é no envio, na desserialização do payload, ou na resposta.
5. **Limpeza Pós-Debug**: Após confirmar a causa raiz e aplicar a correção de fato, remova os logs de debug poluentes que você inseriu temporariamente, mantendo apenas os logs que possuam valor permanente de auditoria.
