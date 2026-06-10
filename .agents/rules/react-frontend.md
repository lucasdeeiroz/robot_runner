---
trigger: always_on
---

# React Frontend Rules

Você está editando o frontend em React/TypeScript do Robot Runner AI.

1. **Tipagem Estrita**: Evite o uso de `any`. Toda comunicação com o backend via IPC (`invoke`, `listen`) deve ter os payloads mapeados por interfaces/types explícitos no TypeScript.
2. **Performance em Listas Grandes**: O Robot Runner frequentemente processa milhares de linhas de log (Appium, Logcat). O render de listas grandes SEMPRE deve usar virtualização (e.g., `react-window`, `react-virtuoso`) associada a lazy-loading.
3. **Gerenciamento de Estado**: Utilize hooks para encapsular lógicas complexas do Tauri (`useEffect` para `listen` com cleanup correto na desmontagem do componente). Evite vazar memória por listeners não removidos.
4. **Consistência de Componentes**: Nós usamos componentes atômicos próprios (ex: `<Button>`, `<Input>`, `<Select>` no diretório `src/components/atoms`). NUNCA injete as tags nativas HTML padrão se houver um átomo já projetado, a menos que haja um bug de renderização justificado com bibliotecas de animação.
5. **Idioma**: Todo o código, variáveis e comentários devem ser em Inglês (US). Use o hook de internacionalização `t('chave')` para qualquer texto que apareça na UI.