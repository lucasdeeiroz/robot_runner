# Inspetor

A aba Inspetor é a ferramenta de interação de UI mais poderosa do Robot Runner. Ela combina espelhamento de tela em tempo real com dump de hierarquia XML.

### Principais Funcionalidades

- **Espelhamento ao Vivo (Scrcpy):** Interaja com seu dispositivo (clique, rolagem) diretamente do computador com baixíssima latência.
- **Árvore de Elementos (UI):** Capture o XML da tela atual para visualizar a hierarquia exata de nós.
- **Seletores de IA:** Ao clicar em um elemento, a IA sugere o localizador mais resiliente (ID de acessibilidade, XPath robusto, etc).
- **Gravação de Ações:** Ative o botão 'Gravar'. Cada toque é registrado como uma ação genérica que pode ser convertida em código Robot Framework posteriormente.

### Como Usar
1. Selecione um dispositivo e abra a aba Inspetor.
2. Clique em 'Capturar Tela' para puxar o XML e exibir a interface interativa.
3. Clique em um elemento para ver seus atributos e copiar o localizador sugerido.
