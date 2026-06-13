---
trigger: always_on
---

# DFS Graph & Exploration Engine Rules

Você está desenvolvendo ou dando manutenção na Engine de Exploração Autônoma (AutonomousExplorer) e na lógica de DFS do Robot Runner AI.

1. **Persistência de Estado do Grafo**: NUNCA confie apenas na memória da classe (`this.state.visitedElements`, etc.) para armazenar fatos definitivos da exploração (como becos sem saída). O explorador é frequentemente interrompido e reiniciado. Fatos históricos como "esse elemento não navega para lugar nenhum" devem ser persistidos no JSON (`UIElementMap`) através de flags explícitas (ex: `explored: true`), para que o cálculo dinâmico dos 3 estados (`UNEXPLORED`, `EXPLORING`, `EXHAUSTED`) resista a reinícios de sessão.
2. **Restauração de Contexto Volátil**: Para contadores essenciais anti-loop (ex: `screenVisitCount`, `actionFingerprints`), garanta que uma nova instância do `AutonomousExplorer` absorva o estado da instância anterior (usando um método como `restoreState`), caso contrário a heurística perderá o contexto imediato de prevenção de loopings ao pausar/retomar.
3. **Busca Estrita de Identificadores**: Elementos mapeados pela IA possuem IDs curtos (ex: `screen_el_1`) enquanto a engine de heurística pode gerar XPaths complexos (ex: `//android.widget...`). NUNCA utilize avaliações curtas para buscar o alvo, como `(el.shortId || el.id) === targetId`. Isso causa bugs silenciosos caso `shortId` exista mas o `targetId` seja um XPath. Sempre teste individualmente: `el.shortId === targetId || el.id === targetId || el.id === xpath`.
4. **Resolução de XPath e Árvore**: Sempre que precisar fazer um matching entre as intenções de ação da IA e a árvore hierárquica (InspectorNode), considere falhas de similaridade. Se a busca por XPath falhar, utilize buscas de fallback (Priority 1: Rótulo / Texto; Priority 2: Standard XPath), pois a interface do app pode sofrer micro-mudanças entre as capturas de tela.
