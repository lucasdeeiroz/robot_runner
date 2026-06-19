---
trigger: always_on
---

# Evidence-Based Debugging & Logging Rules

Você está depurando um bug reportado pelo usuário ou que encontrou durante a execução.

1. **Abordagem Baseada em Evidências**: Quando confrontado com um erro de lógica (ex: "o estado não está atualizando", "o loop está infinito", "o componente pisca e some"), **NUNCA** tente adivinhar a causa e fazer substituições de código (`replace_file_content`) baseadas em suposições às cegas.
2. **Injeção de Logs Estratégicos**: A sua PRIMEIRA ação de modificação de código deve ser injetar logs detalhados (`console.log`, `console.trace`, ou `tracing::info!` no Rust) próximos ao ponto de falha suspeito.
3. **Observação e Validação**: Após injetar os logs, execute a aplicação (`run_command`) ou instrua o usuário a reproduzir o erro, e **leia a saída do log** antes de tomar qualquer decisão arquitetural.
4. **Limpeza Pós-Debug**: Após confirmar a causa raiz e aplicar a correção de fato, remova os logs de debug poluentes que você inseriu temporariamente, mantendo apenas os logs que possuam valor permanente de auditoria.
5. **Divisão de Responsabilidade**: Se o erro envolver a ponte IPC (Inter-Process Communication) entre Tauri (Rust) e React (Frontend), adicione logs de ambos os lados simultaneamente (antes do `invoke` e no início do `#[tauri::command]`) para isolar se a falha é no envio, na desserialização do payload, ou na resposta.
