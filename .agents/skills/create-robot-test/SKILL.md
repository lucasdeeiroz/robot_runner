---
name: create-robot-test
description: Workflow passo-a-passo para extrair locators e navegar por um fluxo usando o arquivo de mapeamento JSON, convertendo-o em um teste BDD. Invoque esta skill toda vez que o usuário pedir para você "criar um cenário de teste", "gerar automação para tela X", etc.
---

# Criar Cenário de Teste Automatizado

Para criar um novo cenário de teste para o Robot Runner, siga EXATAMENTE este procedimento:

## 1. Identificar telas do fluxo a testar
Os arquivos `map/*.json` são a fonte de verdade para telas, elementos e fluxos de navegação. **Sempre consulte o arquivo de mapeamento do app antes de inventar locators.**
Carregue o JSON correspondente (ex: `config/flowchart.json`) e filtre por `tags` ou `name` para encontrar as telas do fluxo.

## 2. Extrair locators para `resources/variaveis/`
Ao extrair elementos do mapeamento para o Page Object, siga estritamente esta ordem de preferência:
1. `accessibility_id` — preferido sempre que disponível.
2. `android=new UiSelector()` — para elementos sem accessibility_id.
3. `xpath` — último recurso; usar apenas quando as opções anteriores não funcionarem (usando o campo `id` como fallback).

## 3. Mapear navegação para definir o caminho do teste
Use a propriedade `navigates_to` do JSON para entender a sequência de telas de um fluxo e planejar as keywords de navegação de uma tela para a próxima.

## Checklist de Criação de Teste
Antes de dar a tarefa por concluída, certifique-se de:
- [ ] Ter identificado as telas do fluxo no flowchart
- [ ] Ter verificado se `accessibility_id` está preenchido antes de usar xpath
- [ ] Ter checado se o locator já existe em `resources/variaveis/` antes de criar novo
- [ ] Usar a `description` da tela para documentar o teste e definir asserções
- [ ] Seguir a propriedade `navigates_to` para planejar a sequência de keywords
- [ ] Ter verificado o tipo da tela (`modal` vs `screen`) para tratar fechamentos e voltas corretamente
