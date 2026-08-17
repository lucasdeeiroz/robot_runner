# Robot Runner - Roadmap de Implementações

Este documento contém o roadmap de funcionalidades e melhorias a serem implementadas no projeto. Ele deve servir como guia central e não será sobrescrito pelos planos de execução e tarefas diárias (tasks/implementation plans).

## Fase Atual: Funcionalidades Essenciais e Integração

- [x] **Teste de Câmera/Barcode**
  - *Objetivo:* Implementar e validar testes automatizados para fluxos que utilizam a câmera e leitores de código de barras no dispositivo físico/emulador.

- [ ] **Integração com PowerMonitor API**
  - *Objetivo:* Integrar o ecossistema do Robot Runner com a API do PowerMonitor para análise avançada de consumo de bateria, CPU e recursos durante a execução de automações.

- [x] **Criação do protocolo de testes RRT (testes de UI in-device)**
  - *Objetivo:* Desenvolver o "Robot Runner Test" (RRT) protocol. Estabelecer o padrão de execução de testes de interface diretamente no dispositivo (via Companion App), sem dependência excessiva do host.

- [x] **Alinhamento Estrutural e de Funcionalidades (Desktop vs Companion)**
  - *Objetivo:* Reestruturar a navegação e as abas do Companion App para que reflitam a exata organização do Robot Runner Desktop, além de implementar as funcionalidades ausentes.
  - *Mapeamento de Abas Desktop -> Companion:*
    - **Home (Página Inicial):**
      - Desktop: Home, Connect
      - Companion (Atual): N/A (Dashboard atual mistura itens)
      - *Ação:* Criar seção `Home` no Companion contendo visão geral e conexão (Sync Center).
    - **Run (Execução):**
      - Desktop: Launcher (Tests), Inspector, Mapper, Scenarios (AI)
      - Companion (Atual): BDD Runner (Launcher), UI Inspector, Explorer (Mapper). Falta Scenarios (AI).
      - *Ação:* Criar seção `Run` no Companion com estas abas. Implementar placeholder para AI Scenarios.
    - **Tests/Devices (Toolbox/Ferramentas):**
      - Desktop: Logcat, Performance, Stopwatch, Commands, Apps, Hardware, Checkup, Console, Webview, History
      - Companion (Atual): Logcat, Performance, Stopwatch, Shell (Commands), Apps, Hardware Specs, Diagnostics (Checkup). Faltam Console, Webview, History.
      - *Ação:* Criar seção `Toolbox` no Companion. Implementar Run Console, Webview (placeholder), e histórico de execuções.
  - *Ações Necessárias (ROADMAP):*
    - [x] Refatorar `DashboardScreen.kt` para usar a nova estrutura de navegação principal (Home, Run, Toolbox, Settings).
    - [x] Mover as views existentes (UI Inspector, BDD Runner, etc.) para as novas sessões estruturais.
    - [x] Criar abas em branco/placeholder para funcionalidades do Desktop ausentes no mobile (Scenarios, Console, Webview, History).

- [x] **Paridade Completa: Console de Execução (Run Console)**
  - *Objetivo:* Implementar interface dedicada no Mobile (Android) para o "Run Console", espelhando a funcionalidade do Desktop. Deve prover monitoramento de saída bruta interativo com scroll virtualizado da execução dos testes localmente.

- [x] **Alterar pacote do app mobile**
  - *Objetivo:* Alterar o nome do pacote (Application ID/Package Name) do Companion App Android para `com.lucasdeeiroz.robotrunner`, alinhando-o com o identificador Winget do Robot Runner Desktop.

---

## Fase: Revisão da Aba Dashboard (Home)
  - [x] Internacionalizar todos os textos.
  - [x] Reorganizar a árvore dos módulos no código e padronizar nomes com o Desktop.
  - [x] Equiparar funcionalidades com a respectiva aba no RR Desktop.
  - [x] Garantir paridade visual e UX com o projeto (Mobile/Desktop).
  - [x] Certificar que todas as funcionalidades estão implementadas e funcionais.
  - [/] Revisar, otimizar e garantir a paridade da UI/UX da aba Dashboard do Companion com o Desktop.
  - [ ] Popular seção 'Atividade' com os dados fornecidos pelo Robot Runner Desktop.
  - [x] Restante da UI

## Fase: Revisão da Aba Sync Center (Home)
  - [x] Internacionalizar todos os textos.
  - [x] Reorganizar a árvore dos módulos no código e padronizar nomes com o Desktop.
  - [x] Equiparar funcionalidades com a respectiva aba no RR Desktop.
  - [x] Garantir paridade visual e UX com o projeto (Mobile/Desktop).
  - [x] Certificar que todas as funcionalidades estão implementadas e funcionais.
  - [x] Revisar fluxos de conexão e emparelhamento.

## Fase: Revisão da Aba Network (Home)
  - [x] Internacionalizar todos os textos.
  - [x] Reorganizar a árvore dos módulos no código e padronizar nomes com o Desktop.
  - [x] Equiparar funcionalidades com a respectiva aba no RR Desktop.
  - [x] Garantir paridade visual e UX com o projeto (Mobile/Desktop).
  - [x] Certificar que todas as funcionalidades estão implementadas e funcionais.
  - [x] Otimizar os componentes de leitura de tráfego de rede e consumo.

## Fase: Revisão da Aba Tests / BDD Runner (Run)
  - [x] Internacionalizar todos os textos.
  - [x] Reorganizar a árvore dos módulos no código e padronizar nomes com o Desktop (`ui/components/tabs/run/TestsSubTab.kt`).
  - [x] Equiparar funcionalidades com a respectiva aba no RR Desktop.
  - [x] Garantir paridade visual e UX com o projeto (Mobile/Desktop).
  - [x] Certificar que todas as funcionalidades estão implementadas e funcionais.
  - [x] Otimizar a execução de suítes de automação RRT persistidas em dados locais e validação de relatórios exportados.

## Fase: Revisão da Aba Logcat (Toolbox)
  - [x] Internacionalizar todos os textos.
  - [x] Reorganizar a árvore dos módulos no código e padronizar nomes com o Desktop.
  - [x] Equiparar funcionalidades com a respectiva aba no RR Desktop.
  - [x] Garantir paridade visual e UX com o projeto (Mobile/Desktop).
  - [x] Certificar que todas as funcionalidades estão implementadas e funcionais.
  - [x] Garantir o limite em memória circular e evitar memory leaks no streaming local de logcat.

## Fase: Revisão da Aba Performance (Toolbox)
  - [x] Internacionalizar todos os textos.
  - [x] Reorganizar a árvore dos módulos no código e padronizar nomes com o Desktop.
  - [x] Equiparar funcionalidades com a respectiva aba no RR Desktop.
  - [x] Garantir paridade visual e UX com o projeto (Mobile/Desktop).
  - [x] Certificar que todas as funcionalidades estão implementadas e funcionais.
  - [x] Otimizar gráficos e captura multi-tier de CPU/RAM em tempo real.

## Fase: Revisão da Aba Stopwatch (Toolbox)
  - [x] Internacionalizar todos os textos.
  - [x] Reorganizar a árvore dos módulos no código e padronizar nomes com o Desktop.
  - [x] Equiparar funcionalidades com a respectiva aba no RR Desktop.
  - [x] Garantir paridade visual e UX com o projeto (Mobile/Desktop).
  - [x] Certificar que todas as funcionalidades estão implementadas e funcionais.
  - [x] Revisar a engine de Redraw para cálculos precisos (deltas de renderização) entre comandos de clique e redraw de UI.

## Fase: Revisão da Aba Shell Console (Toolbox)
  - [x] Internacionalizar todos os textos.
  - [x] Reorganizar a árvore dos módulos no código e padronizar nomes com o Desktop.
  - [x] Equiparar funcionalidades com a respectiva aba no RR Desktop.
  - [x] Garantir paridade visual e UX com o projeto (Mobile/Desktop).
  - [x] Certificar que todas as funcionalidades estão implementadas e funcionais.
  - [x] Otimizar isolamento de streams Stdout/Stderr e timeouts seguros via Coroutines.

## Fase: Revisão da Aba Apps (Toolbox)
  - [x] Internacionalizar todos os textos.
  - [x] Reorganizar a árvore dos módulos no código e padronizar nomes com o Desktop.
  - [x] Equiparar funcionalidades com a respectiva aba no RR Desktop.
  - [x] Garantir paridade visual e UX com o projeto (Mobile/Desktop).
  - [x] Certificar que todas as funcionalidades estão implementadas e funcionais.
  - [x] Revisar a renderização da lista de apps via PackageManager no Companion App.

## Fase: Revisão da Aba Hardware Specs (Toolbox)
  - [x] Internacionalizar todos os textos.
  - [x] Reorganizar a árvore dos módulos no código e padronizar nomes com o Desktop.
  - [x] Equiparar funcionalidades com a respectiva aba no RR Desktop.
  - [x] Garantir paridade visual e UX com o projeto (Mobile/Desktop).
  - [x] Certificar que todas as funcionalidades estão implementadas e funcionais.
  - [x] Conferir validações SELinux em dispositivos POS Android para recuperar status de rede/memória.

## Fase: Revisão da Aba Diagnostics (Toolbox)
  - [x] Internacionalizar todos os textos.
  - [x] Reorganizar a árvore dos módulos no código e padronizar nomes com o Desktop.
  - [x] Equiparar funcionalidades com a respectiva aba no RR Desktop.
  - [x] Garantir paridade visual e UX com o projeto (Mobile/Desktop).
  - [x] Certificar que todas as funcionalidades estão implementadas e funcionais.
  - [x] Validar extração do JSON Golden File e geração offline do Relatório de Auditoria PDF.

## Fase: Implementação da Aba Run Console (Toolbox)
  - [x] Internacionalizar todos os textos.
  - [x] Reorganizar a árvore dos módulos no código e padronizar nomes com o Desktop.
  - [x] Equiparar funcionalidades com a respectiva aba no RR Desktop.
  - [x] Garantir paridade visual e UX com o projeto (Mobile/Desktop).
  - [x] Certificar que todas as funcionalidades estão implementadas e funcionais.
  - [x] Consolidado e integrado nativamente dentro da aba Tests (`ui/components/tabs/run/TestsSubTab.kt`).

---

## Fase: Revisão da Aba UI Inspector (Run)
  - [x] Internacionalizar todos os textos.
  - [x] Reorganizar a árvore dos módulos no código e padronizar nomes com o Desktop (`ui/components/tabs/run/InspectorSubTab.kt`).
  - [x] Equiparar funcionalidades com a respectiva aba no RR Desktop (Árvore interativa, 4 Multi-Locators, Step Recorder, Exportação BDD/Robot, JSON Maps, Floating HUD).
  - [x] Garantir paridade visual e UX com o projeto (Mobile/Desktop).
  - [x] Certificar que todas as funcionalidades estão implementadas e funcionais.
  - [x] Assegurar sub-10ms na leitura de árvore hierárquica e envio do payload para o Desktop (aliases `/tree`, `/ui/tree`, `/ui-tree`).

## Fase: Revisão da Aba Explorer (Run)
  - [x] Internacionalizar todos os textos (EN, PT, ES).
  - [x] Reorganizar a árvore dos módulos no código e padronizar nomes com o Desktop (`ui/components/tabs/run/ExplorerSubTab.kt`).
  - [x] Equiparar funcionalidades com a respectiva aba no RR Desktop (DFS Graph State Machine, Live HUD Overlay, Discovery Map JSON, Telemetria e Action Ticker).
  - [x] Garantir paridade visual e UX com o projeto (Design tokens Material3, dark mode, glassmorphism, sem cores hardcoded e padding de 100dp para a PillTabBar).
  - [x] Certificar que todas as funcionalidades estão implementadas e funcionais.
  - [x] Revisar a lógica de busca heurística e exploração (DFS Grafo) do aplicativo (`AutonomousExplorerEngine.kt`).

## Fase: Implementação da Aba Scenarios (Run)
  - [ ] Internacionalizar todos os textos.
  - [ ] Reorganizar a árvore dos módulos no código e padronizar nomes com o Desktop.
  - [ ] Equiparar funcionalidades com a respectiva aba no RR Desktop.
  - [ ] Garantir paridade visual e UX com o projeto (Mobile/Desktop).
  - [ ] Certificar que todas as funcionalidades estão implementadas e funcionais.
  - [ ] Criar interface (atualmente placeholder) e integração AI no Companion App, substituindo o placeholder pela tela interativa.

## Fase: Implementação da Aba Webview (Toolbox)
  - [ ] Internacionalizar todos os textos.
  - [ ] Reorganizar a árvore dos módulos no código e padronizar nomes com o Desktop.
  - [ ] Equiparar funcionalidades com a respectiva aba no RR Desktop.
  - [ ] Garantir paridade visual e UX com o projeto (Mobile/Desktop).
  - [ ] Certificar que todas as funcionalidades estão implementadas e funcionais.
  - [ ] Adicionar suporte a inspeção webview híbrida via Companion App.

## Fase: Implementação da Aba History (Toolbox)
  - [ ] Internacionalizar todos os textos.
  - [ ] Reorganizar a árvore dos módulos no código e padronizar nomes com o Desktop.
  - [ ] Equiparar funcionalidades com a respectiva aba no RR Desktop.
  - [ ] Garantir paridade visual e UX com o projeto (Mobile/Desktop).
  - [ ] Certificar que todas as funcionalidades estão implementadas e funcionais.
  - [ ] Construir layout para listagem de todos os relatórios `.json` e `.pdf` já gerados no aparelho local.

---
*Nota: Atualize o status (`[x]`, `[/]`, `[ ]`) deste documento conforme as tarefas avancem, servindo de base contínua de consulta para o projeto.*
