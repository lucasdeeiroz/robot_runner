# Mapeador (Exploración Autónoma)

La pestaña Mapeador alberga el Motor de Exploración Autónoma de Grafos, diseñado para construir un gemelo digital de su aplicación.

### Características Clave

- **Exploración Autónoma DFS:** El bot toma el control del dispositivo, haciendo clic en todos los botones no visitados para mapear todas las rutas posibles.
- **Visualización de Grafos:** Se visualizan las relaciones entre pantallas, lo que le permite ver la profundidad de la navegación.
- **Cosecha de Elementos:** Cada pantalla visitada se vuelca en un archivo `JSON` que contiene todos los elementos interactivos.
- **Resiliencia:** El estado se guarda gradualmente. Si la aplicación se bloquea, la exploración puede pausarse y reanudarse.

### Cómo Usar
1. Inicie la aplicación en su dispositivo.
2. Haga clic en 'Iniciar Exploración'.
3. Observe cómo el bot navega y rellena el gráfico en tiempo real.
4. Haga clic en 'Exportar JSON' cuando esté satisfecho.
