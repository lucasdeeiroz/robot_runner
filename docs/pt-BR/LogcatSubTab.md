# Toolbox: Logcat

Uma implementação de alto desempenho do Logcat do Android, adaptada para engenheiros de QA.

### Principais Funcionalidades

- **Virtualização:** Capaz de renderizar dezenas de milhares de linhas sem travar a interface.
- **Filtro por PID/Pacote:** Isole automaticamente os logs que pertencem exclusivamente ao seu aplicativo, ignorando o ruído do sistema.
- **Níveis de Log e Regex:** Filtre visualmente por Nível (Debug, Error, etc.) e use Expressões Regulares.
- **Pausar/Retomar:** Congele o fluxo de logs para investigar uma exception sem perder a posição da rolagem.

### Como Usar
1. Selecione o pacote do seu aplicativo alvo no menu dropdown.
2. A visão filtrará todo o caos do Android para exibir apenas as mensagens do seu app.
