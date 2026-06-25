# Firebase Integration & Remote Config Rules

Você está implementando integrações com o Firebase no Robot Runner AI, com foco especial no Remote Config.

1. **Remote Config como Fonte da Verdade (Source of Truth)**: O Robot Runner utiliza o Firebase Remote Config para gerenciar todos os prompts de IA, variáveis de ambiente do app e flags de interface de forma dinâmica (Over-the-Air). **NUNCA** deixe strings longas (como system prompts) ou chaves de configuração sensíveis hardcoded diretamente em arquivos de código (como `prompts.ts` ou `agentProtocol.ts`).
2. **Consumo de Variáveis**: Sempre acesse os valores de configuração utilizando as funções utilitárias em `src/lib/remoteConfig.ts` (ex: `getRemoteString('chave')`, `getRemoteBoolean('chave')`). Não chame a API nativa do Firebase diretamente nos componentes para evitar quebra de contrato e vazamento de dependências.
3. **Mecanismo de Fallback (Offline First)**: O aplicativo deve continuar funcionando perfeitamente sem conexão com a internet. Ao adicionar uma nova chave no sistema, você **DEVE** cadastrá-la no dicionário `DEFAULT_CONFIG` (`src/lib/remoteConfig.ts`).
4. **Sincronização de JSON**: O Firebase Console requer um arquivo para importação em lote. Toda vez que você adicionar um novo parâmetro ao `DEFAULT_CONFIG`, você é OBRIGADO a adicioná-lo também ao arquivo raiz `remote_config.json`, respeitando a estrutura do Firebase (com `defaultValue`, `valueType` e `description`).
5. **Prevenção de Quebras de Tipagem**: Mantenha estrita atenção ao campo `valueType` no `remote_config.json` e ao método correspondente na sua chamada (não use `getRemoteString` para ler um booleano).
6. **Prompt Engineering Centralizado**: Como desenvolvedor, trate o `DEFAULT_CONFIG` e o `remote_config.json` como se fossem repositórios de código de IA. Prompts não são mais considerados lógica de aplicação, mas sim "dados de configuração".
7. **Feature Toggles Multi-Estado**: **NUNCA** utilize booleanos puros (`true` / `false` nativos com tipagem booleana) para criar flags de novas funcionalidades. O Robot Runner adota um padrão de **string** (`valueType: 'STRING'`) para o ciclo de vida e liberação gradual de features. Utilize sempre um dos seguintes valores:
   - `'true'` (liberado para todos)
   - `'beta'` (liberado apenas para contas com perfil beta)
   - `'dev'` (liberado estritamente no ambiente de desenvolvimento local)
   - `'false'` (totalmente desativado)
   - **Semantic Versioning** (ex: `'v3.0.0'` ou `'3.0.0'`): Libera a funcionalidade automaticamente para todos os usuários cuja versão atual do aplicativo seja maior ou igual à versão especificada.
