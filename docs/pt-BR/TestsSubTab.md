# Testes

A aba Testes é o motor de execução. Ela permite navegar pelo seu projeto de automação e iniciar rodadas de teste.

### Principais Funcionalidades

- **Explorador de Arquivos:** Visão em árvore do seu diretório `Automation Root`.
- **Modos de Execução:** Execute por Arquivo (`.robot`), Pasta inteira, ou usando arquivos de Argumentos (`.args`).
- **Granularidade de Casos:** Ao selecionar um arquivo, a interface lista os Casos de Teste internos, permitindo execução seletiva.
- **Injeção de Dispositivo:** O Robot Runner injeta automaticamente o UDID, OS e Modelo do dispositivo selecionado no contexto da execução.

### Como Usar
1. Certifique-se de que o Automation Root está configurado nas Configurações.
2. Navegue na árvore de arquivos e selecione um arquivo ou pasta.
3. Escolha casos de teste específicos se desejar, e clique em 'Executar Testes'.

### Solução de Problemas (Troubleshooting)

**Erro: `Instalação falhou com código: exit code: 103`**
Este erro ocorre no Windows quando o ambiente virtual (`.venv`) não consegue localizar o executável base do Python. É muito comum quando:
1. O Python foi instalado via **Microsoft Store** (o que gera "Execution Aliases" que podem falhar ao serem invocados por scripts internos do `.venv`).
2. A instalação do Python base foi movida, atualizada ou corrompida.

**Como corrigir:**
- Apague manualmente a pasta `.venv` do seu projeto.
- Verifique sua instalação do Python (recomenda-se instalar diretamente pelo instalador oficial do [python.org](https://www.python.org/downloads/) em vez da Microsoft Store).
- Tente criar o ambiente virtual novamente pelo Robot Runner.
