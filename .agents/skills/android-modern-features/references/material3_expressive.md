# Material 3 Expressive (M3X) em Jetpack Compose

O **Material 3 Expressive** eleva o design do Android trazendo mais calor, fluidez orgânica, contraste intencional, físicas elásticas (springs) e superfícies táteis.

---

## 1. MaterialExpressiveTheme e Paleta de Cores Dinâmicas

A base do M3X no Compose substitui ou aprimora o `MaterialTheme` tradicional por `MaterialExpressiveTheme` com suporte a `MotionScheme`.

### Hierarquia de Superfícies (Surface Containers)
O M3X elimina a necessidade de desenhar divisores ou sombras pesadas, utilizando camadas tonais de contraste:

- `surfaceContainerLowest`: Fundo mais profundo de cartões aninhados.
- `surfaceContainerLow`: Fundo principal de listas ou páginas.
- `surfaceContainer`: Padrão para cartões flutuantes e painéis.
- `surfaceContainerHigh`: Foco, modais ou barras de ação.
- `surfaceContainerHighest`: Entradas de texto, chips e botões inativos com destaque.

```kotlin
@Composable
fun AppTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    dynamicColor: Boolean = true,
    content: @Composable () -> Unit
) {
    val context = LocalContext.current
    val colorScheme = when {
        dynamicColor && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> {
            if (darkTheme) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
        }
        darkTheme -> DarkColorScheme
        else -> LightColorScheme
    }

    MaterialExpressiveTheme(
        colorScheme = colorScheme,
        motionScheme = MotionScheme.expressive(),
        typography = Typography,
        content = content
    )
}
```

---

## 2. Expressive Motion & Físicas de Mola (Spring Physics)

O M3X substitui curvas de aceleração padrão (cubic-bezier mecânicas) por físicas de mola tangíveis e elásticas.

### Padrão de Animação de Entrada e Interação
```kotlin
// Transição elástica expressiva padrão
val expressiveSpring = spring<Float>(
    dampingRatio = Spring.DampingRatioMediumBouncy,
    stiffness = Spring.StiffnessLow
)

// Animação de escala ao pressionar
val scale by animateFloatAsState(
    targetValue = if (isPressed) 0.96f else 1.0f,
    animationSpec = spring(
        dampingRatio = Spring.DampingRatioMediumBouncy,
        stiffness = Spring.StiffnessMedium
    ),
    label = "button_scale"
)
```

---

## 3. Formas Expressivas (Shapes) e Pílulas

- **Pílulas Contínuas**: Botões de ação rápida, chips e switches usam cantos 100% arredondados (`CircleShape` ou `RoundedCornerShape(50)`).
- **Cards e Diálogos**: Cantos de curvatura acentuada (`24.dp` a `32.dp`) criando uma estética orgânica e convidativa.
- **Cantos Assimétricos**: Usados para denotar direcionalidade em balões de mensagens ou cartões empilhados.

```kotlin
val ExpressiveCardShape = RoundedCornerShape(28.dp)
val ExpressivePillShape = RoundedCornerShape(100.dp)
val ExpressiveDialogShape = RoundedCornerShape(32.dp)
```

---

## 4. Vidro Fosco, Blur e Efeitos Translúcidos

O M3X faz uso extensivo de desfoque de fundo (background blur) para barras de navegação flutuantes e cartões destacados:

```kotlin
Modifier
    .graphicsLayer {
        clip = true
        shape = ExpressiveCardShape
    }
    .blur(if (Build.VERSION.SDK_INT >= 31) 24.dp else 0.dp)
    .background(MaterialTheme.colorScheme.surfaceContainer.copy(alpha = 0.85f))
```

---

## 5. Implementação Rigorosa de Edge-to-Edge

No Android 15/16/17, `enableEdgeToEdge()` é obrigatório e desenha atrás das barras de sistema por padrão.

### Padrão de Consumo de Insets
```kotlin
// No ComponentActivity
enableEdgeToEdge()

// No Scaffold ou Container Raiz
Scaffold(
    contentWindowInsets = WindowInsets.safeDrawing, // Garante que cutouts e status bars sejam respeitados
    bottomBar = {
        // Consumir navigationBarsPadding especificamente em barras customizadas
        FloatingBottomBar(
            modifier = Modifier
                .windowInsetsPadding(WindowInsets.navigationBars)
                .padding(horizontal = 16.dp, vertical = 8.dp)
        )
    }
) { innerPadding ->
    Box(
        modifier = Modifier
            .fillMaxSize()
            .padding(innerPadding)
            .imePadding() // Adaptação elástica ao teclado
    ) {
        // Conteúdo rolável
    }
}
```

---

## 6. Feedback Háptico Expressivo

A sensação tátil é parte integral do Material 3 Expressive:

```kotlin
val haptic = LocalHapticFeedback.current

// Ao disparar ações importantes ou alternar interruptores
haptic.performHapticFeedback(HapticFeedbackType.LongPress)

// Em seleções de texto ou rolagem com snappings
haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
```
