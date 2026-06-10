---
trigger: always_on
---

# AI Engineering & Prompt Optimization Rules

Você está implementando integrações de Inteligência Artificial ou desenvolvendo prompts no Robot Runner AI.

1. **Otimização de Tokens (Context Reduction)**: NUNCA envie listas infinitas ou objetos brutos para o prompt da IA (como o estado completo de navegação ou banco de dados). Filtre as estruturas de dados no código TypeScript enviando apenas propriedades estritamente necessárias (ex: `name`, `type` e `description`). Limite a quantidade de itens no histórico (ex: `slice(-15)`) para economizar tokens e tempo de latência.
2. **Prevenção de Limites de SO (Fallback via Arquivo)**: Ao invocar ferramentas de CLI locais (ex: Antigravity CLI / Claude Code) via Rust no Windows, o limite do `cmd.exe` é de 8.191 caracteres. Se um prompt contendo dumps XML e histórico puder ultrapassar 7.500 caracteres, você DEVE escrever o conteúdo em um arquivo temporário e passar apenas uma instrução curta via terminal orientando a IA a ler esse arquivo.
3. **Resiliência e Retry**: Ocasionalmente as respostas em JSON da IA vêm mal formatadas ou sofrem timeouts de rede. Envolva toda invocação de IA em blocos `try/catch` e implemente um mecanismo de _retry_ automático (1 ou 2 tentativas extra) no Frontend antes de falhar a execução para o usuário.
4. **Instruções Estruturadas (System Prompts)**: Para respostas que serão analisadas pelo código (como geração de XPath, Nomes, JSONs de exploração): exija sempre a resposta pura. Use frases como *"Return ONLY a valid JSON object. Do NOT include any markdown code blocks, backticks, introductory text, or concluding remarks"*.
5. **Seleção de Modelos por Tarefa**: Modele sua arquitetura com base em custo-benefício. Tarefas iterativas rápidas e simples (como sugerir nome para um botão) devem usar modelos velozes (ex: Gemini Flash, Claude Haiku). Análises complexas de Root Cause Analysis ou criação de cenários Gherkin merecem modelos densos (ex: Claude Opus, Gemini Pro).
6. **Evite "Conversas" Desnecessárias**: O Robot Runner é uma ferramenta técnica. Os agentes autônomos criados na aplicação não devem ser "tagarelas" pedindo "por favor" ou "olá". Mantenha o formato orientado a dados, focado puramente em extração de metadados de UI, ADB e Scripts de Teste.
7. **Evite uso de IA onde o código é a melhor opção**: O Robot Runner é uma ferramenta para uso profissional, onde ambos tempo e dinheiro são valiosos. Use a IA apenas onde for necessário, usando abordagens híbridas (código apoiado por IA se necessário) onde for possível, agilizando execuções e diminuindo gastos com tokens.