# Mapeador (Exploração Autônoma)

A aba Mapeador abriga a Engine de Exploração Autônoma de Grafos, projetada para construir um gêmeo digital do seu aplicativo.

### Principais Funcionalidades

- **Exploração DFS Autônoma:** O bot assume o controle do dispositivo, clicando em todos os botões não visitados para mapear todas as rotas possíveis.
- **Visualização em Grafo:** Relacionamentos entre telas são visualizados, permitindo ver a profundidade da navegação.
- **Colheita de Elementos:** Cada tela visitada salva um `JSON` com os elementos interativos, atuando como um dicionário automatizado de localizadores.
- **Resiliência:** O estado é salvo incrementalmente. Se o app crachar, a exploração pode ser pausada e retomada de onde parou.

### Como Usar
1. Inicie o aplicativo no dispositivo.
2. Clique em 'Iniciar Exploração'.
3. Assista enquanto o bot navega e preenche o grafo em tempo real.
4. Exporte os resultados para JSON quando finalizar.
