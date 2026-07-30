# Robot Runner - Roadmap de Implementações

Este documento contém o roadmap de funcionalidades e melhorias a serem implementadas no projeto. Ele deve servir como guia central e não será sobrescrito pelos planos de execução e tarefas diárias (tasks/implementation plans).

## Fase Atual: Funcionalidades Essenciais e Integração

- [ ] **Teste de Câmera/Barcode**
  - *Objetivo:* Implementar e validar testes automatizados para fluxos que utilizam a câmera e leitores de código de barras no dispositivo físico/emulador.

- [ ] **Integração com PowerMonitor API**
  - *Objetivo:* Integrar o ecossistema do Robot Runner com a API do PowerMonitor para análise avançada de consumo de bateria, CPU e recursos durante a execução de automações.

- [ ] **Criação do protocolo de testes RRT (testes de UI in-device)**
  - *Objetivo:* Desenvolver o "Robot Runner Test" (RRT) protocol. Estabelecer o padrão de execução de testes de interface diretamente no dispositivo (via Companion App), sem dependência excessiva do host.

- [ ] **Alinhamento de funcionalidades, telas e layouts entre Desktop e Mobile**
  - *Objetivo:* Garantir consistência de UI/UX (Glassmorphism, Dark Mode, etc.) e simetria de funcionalidades entre o Robot Runner Desktop (Tauri/React) e o Companion App (Android/Compose).

- [x] **Alterar pacote do app mobile**
  - *Objetivo:* Alterar o nome do pacote (Application ID/Package Name) do Companion App Android para `com.lucasdeeiroz.robotrunner`, alinhando-o com o identificador Winget do Robot Runner Desktop.

---
*Nota: Atualize o status (`[x]`, `[/]`, `[ ]`) deste documento conforme as tarefas avancem, servindo de base contínua de consulta para o projeto.*
