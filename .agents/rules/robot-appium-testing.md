---
trigger: always_on
---

# Robot Framework + AppiumLibrary Testing Rules

Você está orientando ou gerando código para testes automatizados mobile utilizando Robot Framework com a biblioteca AppiumLibrary no ecossistema do Robot Runner AI. 

Ao gerar roteiros, keywords, variáveis ou suítes de teste, as seguintes regras são rigorosamente obrigatórias:

1. **Separação de Responsabilidades (Testes vs. Resources)**:
   - NUNCA misture a implementação técnica (cliques, interações de UI, loops lógicos) dentro dos arquivos de testes (`.robot`).
   - Os arquivos de teste devem conter APENAS a especificação em alto nível do comportamento. Toda a complexidade técnica de interação e asserção deve residir exclusivamente nos arquivos de resource (`.resource`).

2. **Abordagem BDD (Gherkin)**:
   - Todos os casos de teste DEVEM ser estruturados utilizando a sintaxe Gherkin (`Given`, `When`, `Then`, `And`, `But`).
   - Os testes devem ser legíveis como documentação de negócio, descrevendo o comportamento esperado pelo usuário, não a interação com identificadores mecânicos da interface.

3. **Page Object Model (POM) Modular**:
   - Estruture a arquitetura do projeto seguindo o padrão POM rigorosamente. Cada tela ou fluxo específico do aplicativo deve possuir seu próprio módulo/arquivo dedicado (ex: `LoginScreen.resource`, `CartScreen.resource`).
   - Centralize todos os localizadores (XPath, ID, Accessibility ID) no início de cada respectivo Page Object em blocos de `*** Variables ***` (estruturados preferencialmente como dicionários) para separar a modelagem de dados da lógica das keywords.

4. **Parametrização para Reutilização Extrema**:
   - As keywords DEVEM ser parametrizáveis sempre que a ação for de caráter genérico (como preencher formulários ou validar listas). Evite strings fixas (hardcoded).
   - Utilize a sintaxe de `[Arguments]` para injetar dados dinamicamente. A mesma keyword deve ser capaz de servir a cenários de Sucesso, Falha, ou Validações de Borda dependendo dos parâmetros recebidos.
   - O Gherkin em si deve ser parametrizado, possibilitando que uma mesma keyword possa ser utilizada em diferentes fases do teste (ex: `${GHERKIN} Faço Login Na Conta`).

5. **Importações Eficientes e Árvores de Dados**:
   - Organize os ambientes, massas de teste e localizadores em árvores de dados estruturadas, visando flexibilidade para execução paralela ou em múltiplos dispositivos.
   - Utilize um arquivo central de setup (ex: `Base.resource`) apenas para configurações de driver e teardown (`Open Application`, `Close Application`), mas oriente cada suíte de teste a importar de forma estrita APENAS os Page Objects que necessita. Evite escopo global poluído.

6. **Criação de Testes com Contexto**:
   - Use os artefatos de mapeamento do sistema a ser testado para escrever os testes com todo o contexto. Crie testes completos que validem tudo o que estiver mapeado.

7. **Engenharia de Qualidade e Boas Práticas**:
   - **Zero Tolerância ao Sleep**: Sempre utilize esperas condicionais (`Wait Until Element Is Visible`, `Wait Until Page Contains Element`). `Sleep` absoluto só é permitido em exceções extremas documentadas, para evitar que os testes fiquem não-determinísticos e lentos.
   - **Isolamento de Estado (Teardown)**: Garanta que cada cenário devolva o aplicativo a um estado neutro utilizando as tags de `[Teardown]`. Testes não devem depender de estados residuais deixados por testes anteriores.
   - **Padrão de Nomenclatura e Logs**: Mantenha nomes expressivos, limpos e semânticos. Utilize `Log` ou screenshots condicionais em momentos críticos da execução (On Failure) para facilitar o root-cause analysis e debugging em caso de quebras de execução.