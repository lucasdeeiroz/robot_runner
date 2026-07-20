# ⚠️ Problemas Conhecidos e Solução de Problemas (Troubleshooting)

Este documento rastreia problemas comuns e fornece soluções para os problemas mais frequentes encontrados no **Robot Runner**.

---

## 📱 Problemas de Conexão do Dispositivo

### Dispositivo não detectado
- **Causa**: A Depuração USB está desativada ou os drivers estão faltando.
- **Solução**:
    1. Ative as **Opções de Desenvolvedor** e a **Depuração USB** no seu dispositivo.
    2. Para Windows, certifique-se de ter os **Google USB Drivers** instalados.
    3. Execute `adb kill-server` seguido de `adb devices` para reiniciar a conexão.

### Status "Não Autorizado (Unauthorized)" na lista de dispositivos
- **Causa**: O dispositivo não aceitou a impressão digital da chave RSA.
- **Solução**: Verifique a tela do seu dispositivo para um prompt de permissão e selecione "Sempre permitir deste computador".

---

## 🖥️ Problemas de Espelhamento e Inspetor

### O Scrcpy falha ao iniciar
- **Causa**: O Scrcpy não está no `PATH` do sistema ou outra ferramenta de espelhamento está ativa.
- **Solução**:
    1. Verifique se `scrcpy --version` funciona no seu terminal.
    2. Feche outros aplicativos que possam estar usando a conexão ADB (por exemplo, Android Studio, outros inspetores).
    3. Reduza a resolução/taxa de bits nas Configurações > Espelhamento (Mirroring).

### Inspetor mostra hierarquia vazia
- **Causa**: A sessão do Appium ou ADB expirou, ou o aplicativo usa uma visualização personalizada que impede o dump XML.
- **Solução**:
    1. Atualize o inspetor manualmente.
    2. Certifique-se de que o aplicativo esteja em primeiro plano e não em uma tela segura (por exemplo, telas de login com `FLAG_SECURE`).

---

## ⚡ Erros de Execução

### Erros de "Recurso não encontrado" ou Importação
- **Causa**: Configuração incorreta da **Raiz da Automação (Automation Root)**.
- **Solução**: Vá para Configurações e certifique-se de que a **Raiz da Automação** esteja definida como o diretório base do seu projeto, e NÃO a pasta de suítes.

### Variável `${udid}` está vazia
- **Causa**: O teste foi iniciado sem selecionar um dispositivo ou substituição manual de variável.
- **Solução**: Sempre selecione um dispositivo no menu suspenso antes de clicar em "Executar (Run)". Não defina uma variável customizada `${udid}` em seus arquivos Robot se desejar usar a injeção automática.

---

## 🧠 Problemas de IA e Gerador

### Erro de "API Key Ausente"
- **Causa**: O provedor de IA selecionado não possui nenhuma chave configurada.
- **Solução**: Verifique Configurações > IA e certifique-se de que a chave para o provedor selecionado (Gemini, OpenAI ou Claude) está colada corretamente.

### A análise de IA falha para logs grandes
- **Causa**: Limite da janela de contexto excedido para o modelo selecionado.
- **Solução**: Tente usar um modelo com uma janela de contexto maior (por exemplo, `gemini-1.5-pro` ou `gpt-4-turbo`) ou execute suítes de teste menores.

---

## ⚡ Problemas de Desempenho

### Latência da interface com logs muito grandes
- **Status**: Limitação conhecida do sistema de renderização recursiva.
- **Detalhe**: Suítes de teste com milhares de nós aninhados (palavras-chave/etapas) podem causar um atraso durante a renderização inicial da árvore.
- **Mitigação**: 
    1. Recolha as seções que não estão sendo investigadas no momento.
    2. Divida suítes de teste muito grandes em arquivos menores e mais modulares.
    3. Use as funções de "Pesquisa" ou "Filtro", se disponíveis, para restringir a visualização.
