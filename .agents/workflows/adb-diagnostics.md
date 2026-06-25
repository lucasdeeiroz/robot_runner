---
name: adb-diagnostics
description: Workflow autônomo para diagnosticar problemas de conexão com dispositivos Android via ADB e reiniciar os serviços do Robot Runner.
trigger: "diagnosticar adb", "dispositivo não aparece", "adb travou"
---

# Workflow: ADB Diagnostics

**Descrição**: Este workflow ensina a IA a agir de forma autônoma (agentic workflow) para resolver problemas de conexão entre o Robot Runner e os dispositivos físicos/emuladores. Diferente de uma "Rule" (que apenas guia a formatação do código), este workflow é uma **receita de execução passo a passo**.

## Passo a Passo para a IA (Execução Mandatória)

Sempre que o usuário pedir para diagnosticar o ADB, siga estritamente os passos abaixo usando suas ferramentas de terminal (`run_command`):

1. **Verificar os Processos do ADB (Port Conflict)**
   - Use o terminal para rodar: `tasklist | findstr adb.exe` (no Windows) ou `ps aux | grep adb` (Mac/Linux).
   - Analise se existem múltiplos servidores rodando. O Appium Inspector às vezes deixa servidores "zumbis" ativos.

2. **Matar e Reiniciar o Servidor do ADB**
   - Execute o comando: `adb kill-server`.
   - Em seguida, execute: `adb start-server`.

3. **Listar Dispositivos Conectados**
   - Execute: `adb devices -l`.
   - Leia a saída do terminal. 
   - Se o dispositivo aparecer como `unauthorized`, interrompa o fluxo e avise o usuário imediatamente: *"Por favor, desbloqueie a tela do seu celular e clique em 'Permitir Depuração USB'"*.

4. **Validar Variáveis de Ambiente (Se houver falha de comando)**
   - Se o passo 2 ou 3 falhar com erro de "comando não encontrado", use o comando `echo %ANDROID_HOME%` (Windows) para verificar a variável de ambiente do SDK e instrua o usuário a consertá-la se estiver vazia.

5. **Relatório Final**
   - Após executar as validações, gere um relatório sucinto confirmando o(s) modelo(s) dos dispositivos pareados com sucesso e avise que o usuário já pode atualizar a aba **"Connect"** do Robot Runner.
