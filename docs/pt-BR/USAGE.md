# 📖 Guia do Usuário: Primeiros Passos com o Robot Runner

Este documento fornece uma visão geral abrangente de como usar o **Robot Runner** para gerenciar seu fluxo de trabalho de automação Android.

---

## 📱 Gerenciamento de Dispositivos

### Conexão do Dispositivo
O Robot Runner pode se conectar aos dispositivos de 4 maneiras diferentes. Você deve ter o ADB instalado e configurado em seu computador para usar este recurso. Você pode obtê-lo em https://developer.android.com/studio/releases/platform-tools.
- **USB**: Simplesmente conecte seu dispositivo Android com a **Depuração USB** ativada. O Robot Runner o detectará na lista de Seleção de Dispositivo (clique no botão de atualizar para atualizar a lista).
- **Sem Fio (Wireless - TCP/IP)**: Você também pode conectar seu dispositivo ao computador via Wi-Fi. Observe que o dispositivo e o computador devem estar na mesma rede.
    1. Primeiro, você precisa habilitar a **Depuração TCP/IP** no dispositivo usando a porta 5555 (padrão). Você pode fazer isso facilmente no Robot Runner conectando seu dispositivo via USB pela primeira vez e clicando no botão **Enable 5555** na aba **Connect** na página principal.
    2. IP e Porta serão preenchidos automaticamente. Clique no botão **Connect** para conectar.
    3. Uma vez conectado, você pode desconectar o cabo USB. O dispositivo permanecerá conectado via Wi-Fi até que o aplicativo seja fechado ou o dispositivo seja desconectado.
- **Pareamento Wi-Fi (Wi-Fi Pairing - Android 11+)**: Use a opção "Pair Device" para conectar usando um código de pareamento.
    1. Primeiro, você precisa habilitar a **Depuração Sem Fio (Wireless debugging)** no dispositivo.
    2. IP e Porta serão preenchidos automaticamente. Digite o código de pareamento mostrado na tela do dispositivo. Clique no botão **Pair** para parear. Você só precisará fazer isso uma vez para cada dispositivo.
    3. Se o seu dispositivo já estiver pareado, basta clicar no botão **Connect** para conectar.
    4. Uma vez conectado, você pode desconectar o cabo USB. O dispositivo permanecerá conectado via Wi-Fi até que o aplicativo seja fechado ou o dispositivo seja desconectado.
- **Remoto via ngrok**: Você pode compartilhar seu dispositivo com outras pessoas habilitando a conexão remota. O dispositivo será conectado via túnel ngrok.
    1. Primeiro, você precisa habilitar a **Conexão Remota** no Robot Runner. Clique no botão **Enable Remote Connection** na aba **Connect** da página principal.
    2. Leia a mensagem de aviso e, se concordar, clique no botão **Enable Ngrok**.
    3. Escolha o dispositivo desejado na lista de Seleção de Dispositivo. Então, clique no botão **Start Public Tunnel**.
    4. Uma vez que o túnel for estabelecido, uma mensagem "Public Tunnel: [URL]" será exibida. Você pode compartilhar esta URL com outras pessoas para acessarem seu dispositivo.
    5. Para parar a conexão remota, clique no botão **Stop Public Tunnel**.
    * Nota: Você precisará ter uma conta ngrok e uma API key para usar este recurso. Você pode obter uma em https://ngrok.com.

### Caixa de Ferramentas do Dispositivo (Device Toolbox)
A caixa de ferramentas do dispositivo oferece várias opções para ajudá-lo em suas tarefas de automação. Você pode acessar a caixa de ferramentas clicando no ícone de chave de fenda próximo ao dispositivo desejado na lista de Seleção de Dispositivo. Aqui estão algumas delas:
- **Espelhamento via scrcpy (Mirroring)**: Espelhe a tela do seu dispositivo no seu computador.
    1. Clique no botão **Screen Mirroring** para abrir uma nova janela com a tela do seu dispositivo.
    * Nota: Você precisará instalar o scrcpy no seu computador para usar este recurso. O diretório onde ele está instalado deve ser adicionado à variável de ambiente PATH. Você pode obtê-lo em https://github.com/Genymobile/scrcpy.
- **Captura de Tela (Screenshot)**: Tire um print da tela do seu dispositivo.
    1. Clique no botão **Take Screenshot** para tirar um print da tela do seu dispositivo.
    * O print será salvo na pasta **screenshots** no diretório do seu projeto.
- **Gravação de Tela (Screen Recording)**: Grave um vídeo da tela do seu dispositivo.
    1. Clique no botão **Start Screen Recording** para iniciar a gravação.
    2. Clique no botão **Stop Screen Recording** para parar a gravação.
    * O vídeo será salvo na pasta **screen_recordings** no diretório do seu projeto.
- **Logcat**: Capture logs do seu dispositivo.
    1. Abra a aba **Logcat** na Caixa de Ferramentas do Dispositivo.
    2. Escolha o nível de log desejado no menu suspenso **Level** (Verbose, Debug, Info, Warn, Error, Fatal ou Silent).
    3. Escolha o nome do pacote desejado no menu suspenso **Package** (ou mude para "Entire System" para ver todos os logs).
    4. Clique no botão **Start** para começar a capturar os logs.
    5. Clique no botão **Stop** para parar a captura.
    * Os logs serão salvos na pasta **logs** no diretório do seu projeto.
- **Desempenho (Performance)**: Rastreie CPU, RAM e Bateria (Temp/Tensão) em gráficos em tempo real.
    1. Abra a aba **Performance** na Caixa de Ferramentas do Dispositivo.
    2. Clique no botão **REC** para começar a coletar as métricas.
    3. Clique no botão **Stop** para parar a coleta.
    * As métricas de desempenho serão salvas na pasta **logs** no diretório do seu projeto.
- **Comandos ADB (ADB Commands)**: Execute comandos ADB personalizados no seu dispositivo.
    1. Abra a aba **ADB** na Caixa de Ferramentas do Dispositivo.
    2. Digite seu comando ADB no campo **Command**.
    3. Clique no botão **Run** para executar o comando.
    4. Você também pode salvar seus comandos ADB para poder executá-los novamente mais tarde.
- **Gerenciador de Aplicativos (App Manager)**: Gerencie as instalações de aplicativos no dispositivo.
    1. Abra a aba **Apps** na Caixa de Ferramentas do Dispositivo.
    2. Clique no botão **Install APK** para instalar um arquivo APK no seu dispositivo.
    3. Você pode desinstalar, reinstalar, limpar dados ou congelar/descongelar (freeze/unfreeze) qualquer aplicativo no seu dispositivo.

---

## 🔍 Inspetor de UI e Estratégia de Localizadores

O Inspetor é sua principal ferramenta para projetar localizadores de automação estáveis.

### Como Inspecionar
1. Abra a sub-aba **Inspector** na página **Run**.
2. Certifique-se de que seu dispositivo esteja conectado (veja a seção Conexão do Dispositivo, deve ter Depuração USB ativada). No painel de Dispositivos (Devices), selecione o dispositivo desejado.
3. Clique em um elemento na tela ou navegue pela **Árvore de Hierarquia (Hierarchy Tree)**.
4. Todos os atributos do elemento serão exibidos no painel de **Atributos (Attributes)**.

### Geração de Localizadores
- **Auto-Prioridade (Auto-Priority)**: A ferramenta sugere automaticamente o melhor localizador usando a hierarquia `resource-id` > `content-desc` > `text`.
- **Localizadores Avançados (Advanced Locators)**: Selecione vários atributos para criar um `UiSelector` encadeado ou XPaths complexos.
- **Validação (Validation)**: Use o campo "Pesquisa (Search)" para verificar se seu localizador identifica exclusivamente o elemento alvo.

### Interações na Tela
- **Clicar (Click)**: Dê um duplo clique em um elemento.
- **Deslizar (Swipe)**: Clique e arraste na tela para deslizar na direção desejada.
- **Voltar (Back)**: Clique no botão **Back**.
- **Início (Home)**: Clique no botão **Home**.
- **Recentes (Recent)**: Clique no botão **Recent**.

### Gravador de Passos (Steps Recorder)
1. Abra a sub-aba **Inspector** na página **Run**.
2. Certifique-se de que seu dispositivo esteja conectado (veja a seção Conexão do Dispositivo, deve ter Depuração USB ativada). No painel de Dispositivos, selecione o dispositivo desejado.
3. Clique no botão **Steps Recorder** para abrir o painel do Gravador.
4. Escolha a interação que você deseja realizar (por exemplo, tocar, deslizar, arrastar e soltar).
5. Selecione o elemento com o qual você deseja interagir (clicando nele no espelho ou selecionando-o na Árvore de Hierarquia).
6. Cada modo de interação oferece opções diferentes (por exemplo, tap, swipe right, long press, etc). Selecione uma para gerar o código de automação do Robot Framework.
7. Execute todas as interações que você deseja gravar.
8. Você pode copiar o código gerado para usar em sua suíte de testes do Robot Framework.

---

## 🧠 Mapeamento e Gerador por IA

O Robot Runner usa IA para preencher a lacuna entre a exploração de UI e a documentação. Você pode usar os dados para gerar artefatos para ajudá-lo com suas tarefas de QA.

### Mapeando o Aplicativo
1. Abra a sub-aba **Mapper** na página **Dashboard**.
2. Certifique-se de que seu dispositivo esteja conectado (veja a seção Conexão do Dispositivo, deve ter Depuração USB ativada). No painel de Dispositivos, selecione o dispositivo desejado.
3. Você pode salvar a tela atual e mapear todos os seus elementos manualmente, para ter mais controle sobre os dados enviados para a IA.
4. Ou você pode usar a IA para explorar e mapear automaticamente seu aplicativo, clicando no botão **Star Autonomous Exploration**. A IA cuidará do processo de navegação e exploração e salvará os dados no mapeador.
5. Clique em **Open Flowchart** para abrir o editor de fluxograma e ver os dados capturados.

### Gerando Artefatos
Use o **AI Generator** para transformar as telas capturadas em:
- **Casos de Teste (Gherkin/BDD)**
- **Histórias de Usuário e PBIs**
- **Relatórios de Bugs**
- **Modelos de Objetos de Página (POM)**

*Nota: Requer uma API Key válida do Gemini, OpenAI ou Claude em Configurações.*

---

## ⚡ Executando e Depurando Testes de Automação

### Modos de Execução
1. **Arquivo (File)**: Execute um único arquivo `.robot`.
2. **Pasta (Folder)**: Execute todas as suítes dentro de um diretório.
3. **Argumentos (Args)**: Use um arquivo `.args` ou `.txt` para configurações complexas (modo headless, variáveis, etc.).

### Raiz da Automação (Automation Root)
Certifique-se de que sua **Raiz da Automação** esteja configurada corretamente em Configurações. Este é o diretório base usado para resolver caminhos relativos para resources e libraries.

### Variáveis Injetadas
O Robot Runner fornece automaticamente estas variáveis para seus scripts:
- `${udid}`: Número de série do dispositivo.
- `${device_name}`: Nome do modelo.
- `${os_version}`: Versão do Android.

### Suítes de Teste Customizadas
Você pode misturar e combinar diferentes suítes de teste para uma execução de automação customizada.
1. Clique no ícone próximo a cada suíte de teste para selecionar os testes que deseja executar. Você pode selecionar várias suítes de teste ou testes individuais dentro de uma suíte.
2. Certifique-se de que o dispositivo correto está selecionado na lista de Seleção de Dispositivo. Você pode selecionar mais de um dispositivo para rodar seus testes em paralelo.
3. Clique no botão **Run Selected** para executar os testes selecionados.

### Depurando Testes de Automação
1. Abra a sub-aba **History** na página **Tests**.
2. Selecione a execução do teste que você deseja depurar.
3. Todos os logs do teste serão exibidos, e você pode ver o status do teste, a duração e outras informações.
4. Você pode usar a IA para analisar os logs do teste e encontrar a causa raiz da falha.
