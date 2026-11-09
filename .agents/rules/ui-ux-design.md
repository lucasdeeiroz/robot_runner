---
trigger: always_on
---

# UI/UX & Design Guidelines

Você está lidando com design e estilo da UI do Robot Runner.

## 1. UI/UX Design & React Standards (Desktop)

1. **Estética Premium**: A aplicação deve causar uma impressão de software profissional e caro (efeito "Wow"). Use a paleta de cores existente (`bg-surface`, `bg-surface-variant`, `text-on-surface`, `primary`).
2. **Glassmorphism e Blur**: Faça uso de fundos transparentes com desfoque (`backdrop-blur-md`, `bg-surface/80`) para criar camadas de profundidade elegantes.
3. **Animações e Feedback**: Elementos interativos devem reagir ao usuário. Utilize `framer-motion` (via `<motion.div>`) ou transições suaves do Tailwind (`transition-colors`, `transition-all`, `hover:scale-105`) em botões, abas e modais.
4. **Tailwind merge**: Cuidado redobrado ao usar `twMerge` e `clsx` (importado preferencialmente como `import clsx from 'clsx'`). Ao aplicar larguras e alturas fixas (`w-8 h-8`) em cima de botões atômicos, garanta que comportamentos como `inline-flex` não sejam sobrescritos acidentalmente para `flex` absoluto sem testar.
5. **Modo Escuro (Dark Mode)**: Todas as cores hardcoded (ex: `bg-white`, `text-black`, `Color(0xFF10B981)`) estão proscritas. Use unicamente as variáveis de design tokens (como `outline-variant`, `error`, `success` no Tailwind ou `MaterialTheme.colorScheme` no Jetpack Compose) para garantir que o Dark Mode e Light Mode funcionem nativamente através das configurações globais.
6. **Hover em Cores Sólidas (Dark Mode)**: NUNCA reduza a opacidade (ex: `hover:bg-primary/90`) no estado de hover de botões ou elementos com cores sólidas e semânticas (`primary`, `success`, `error`, `warning`). Em Dark Mode, isso faz com que a cor escura de fundo vaze (bleed), deixando o elemento com aparência suja/pálida. Utilize propriedades de iluminação (ex: `hover:brightness-110`) para criar o efeito de destaque.
7. **Variantes Implícitas e Classes Mescladas**: Ao utilizar componentes genéricos (como `<Button>`), sempre declare explicitamente a variante (`variant="ghost"`, `variant="unstyled"` etc.) caso não queira o comportamento visual padrão (geralmente `primary`). Evite injetar cores de hover hardcoded via `className` (`hover:bg-secondary-container`) sobre componentes que já possuem variantes de cor de fundo configuradas, pois isso causará quebra de legibilidade e conflito com a cor do texto do componente.
8. **Tipagem Estrita**: Evite o uso de `any`. Toda comunicação com o backend via IPC (`invoke`, `listen`) deve ter os payloads mapeados por interfaces/types explícitos no TypeScript.
9. **Performance em Listas Grandes**: O Robot Runner frequentemente processa milhares de linhas de log (Appium, Logcat). O render de listas grandes SEMPRE deve usar virtualização (e.g., `react-window`, `react-virtuoso`) associada a lazy-loading.
10. **Gerenciamento de Estado**: Utilize hooks para encapsular lógicas complexas do Tauri (`useEffect` para `listen` com cleanup correto na desmontagem do componente). Evite vazar memória por listeners não removidos.
11. **Consistência de Componentes**: Nós usamos componentes atômicos próprios (ex: `<Button>`, `<Input>`, `<Select>` no diretório `src/components/atoms`). NUNCA injete as tags nativas HTML padrão se houver um átomo já projetado, a menos que haja um bug de renderização justificado com bibliotecas de animação.
12. **Internacionalização (i18n)**: É **ESTRITAMENTE PROIBIDO** utilizar textos hardcoded (chumbados) direto nas tags HTML/JSX para a interface do usuário. Você **DEVE SEMPRE** usar o hook de internacionalização `t('chave', 'Fallback en-US')` para qualquer texto que apareça na UI (botões, parágrafos, tooltips, modais, labels, mensagens de erro, etc), garantindo suporte completo aos idiomas suportados pelo sistema. O texto de fallback DEVE obrigatoriamente ser em Inglês (US) para manter a coerência da base de código (ex: `t('btn_save', 'Save')` e NUNCA `t('btn_save', 'Salvar')`).
13. **Validação Estrita de Compilação (Proatividade Antigravity)**: Ao finalizar a escrita ou refatoração de código, atue de maneira autônoma e agente: SEMPRE execute ferramentas de CLI no terminal (`npx tsc --noEmit` para React/TS e `cargo check` para Rust) para garantir ausência de erros estritos como `TS6133` (variáveis não lidas), `TS2686` (uso global de React) ou warnings do Cargo ANTES de relatar que a tarefa foi concluída.
14. **Montagem Lazy e Persistência de Estado (In-Memory Caches)**: Sub-abas e ferramentas secundárias (ex: Logcat, Stopwatch, Inspector, Performance, Checkup, Commands, AI Generator) DEVEM ser montadas de forma condicional/lazy (`{activeTab === 'x' && <Component />}`) para evitar a renderização simultânea de dezenas de componentes pesados no DOM. Para EVITAR a perda de dados do usuário (logs, laps de cronômetro, passos gravados do inspetor, relatórios de auditoria, prompts de IA) ao alternar entre abas desmontadas, utilize **caches em memória** no nível de módulo (ex: `logcatCacheMap`, `stopwatchCacheMap`, `inspectorCacheMap`) chaveados pelo UDID do dispositivo ou ID do perfil. Ao remontar o componente, inicialize os estados com `useState(() => cache.get(key) ?? initialValue)` e sincronize via `useEffect`.
15. **Loteamento de Eventos IPC de Alta Frequência (Batching/Throttling)**: Eventos emitidos em alta frequência via IPC pelo Tauri (ex: `logcat-data`, streams de console) NUNCA devem disparar `setLogs` / `setState` diretamente para cada payload individual. Envolva o recebimento de chunks em um buffer temporário de micro-batch (ex: 100ms) usando um temporizador (`pendingBuffer` + `setTimeout`) para atualizar o estado do React em lote, prevenindo congelamentos de UI por *renders thrashing*.
16. **Tauri OS Plugin Usage**: When passing host OS metadata (like OS version) via IPC or HTTP to the Android Companion, make sure to use ersion() from @tauri-apps/plugin-os instead of using the raw os_name (which might just return the kernel name like 'windows').

Este projeto segue a metodologia de Atomic Design para seus componentes React (Atoms, Molecules, Organisms). 

1. **Atualização de Átomos**: Sempre que você alterar, estender ou remover propriedades de um componente em `src/components/atoms` (por exemplo, adicionando uma nova `variant` como 'link' ou 'unstyled' em um `Button`), você **DEVE** assumir que haverá quebras de TypeScript em componentes maiores que o envolvem.
2. **Varredura Obrigatória**: Imediatamente após editar um Átomo, utilize ferramentas de busca (como `grep_search`) para localizar Molecules ou Organisms que importem este átomo (ex: `AiButton.tsx` importa `Button.tsx`).
3. **Mapeamento Explícito**: Verifique se os wrappers possuem objetos ou dicionários que mapeiam as chaves do átomo (ex: `separatorStyles[variant]`). Se você criou uma nova variante, adicione-a imediatamente a esses dicionários para prevenir erros silenciosos de tipagem do tipo "Element implicitly has an 'any' type".
4. **Respeito à Interface**: Nunca quebre a interface (API) de um átomo existente. Se for mudar a forma como ele recebe as propriedades (`props`), providencie o refatoramento em toda a base de código para os componentes que dependem dele.

## 2. UI/UX Design & Jetpack Compose Standards (Mobile)

1. **Modern Dark Aesthetics**: Use Material3 with modern dark color palettes, subtle glassmorphism, and responsive layouts that adapt seamlessly across phone screens, tablets, and POS receipt screens (720p / 480p).
2. **Strict Color Theming (No Hardcoded Colors)**: NEVER use hardcoded Hex colors (e.g., `Color(0xFF10B981)`) for UI elements that must support Dark/Light modes. ALWAYS use `MaterialTheme.colorScheme` (e.g., `primary`, `error`, `surfaceVariant`). Custom semantic colors (like success/warning) must be added as extensions to the theme or derived safely.
3. **Glassmorphism**: Utilize the custom `glassmorphicBackground` modifier to mimic the Desktop's Tailwind `backdrop-blur-md` aesthetic.
4. **Animations**: UI state changes should be fluid. Use Compose's `AnimatedVisibility` and `animate*AsState` APIs for transitions.
5. **Non-Intrusive Floating Inspector**: The on-device UI Inspector floating overlay must be draggable, collapsible, and easily toggled off so it never blocks the user's manual app interaction.
6. **Visible texts must be internationalized**: All texts visible to the user must be internationalized in `./companion/app/src/main/res/` for `values/`, `values-es/` and `values-pt`.
7. **Adaptive Icons**: Ensure the app icon uses Android's adaptive icons (separating background and foreground).
8. **Live Activities & Bubbles**: For long tests, utilize ongoing background notifications. For floating status monitors, use Bubbles.
9. **Predictive Back**: Migrate navigation to use Jetpack Navigation with Compose or `OnBackPressedDispatcher`, avoiding legacy `onBackPressed()`.
10. **Custom Tab UI & Shapes in Jetpack Compose**:
  a. **Custom TabRow Layouts**: When creating custom rounded `TabBar` elements with few tabs, standard `ScrollableTabRow` often aligns content incorrectly to the left if the tabs don't fill the screen width. Instead of `ScrollableTabRow`, use a standard `Row` with `horizontalArrangement = Arrangement.Center`, combined with `.horizontalScroll(rememberScrollState())` to ensure proper centering and fallback scroll behavior.
  b. **Surface Clipping Bounds**: When applying a custom rounded shape to a Row or Box with a background, never rely solely on a native container color property (like `containerColor` in `TabRow`) because its underlying `Surface` is rectangular and will bleed outside the clipped corners. Always apply `.background(color, RoundedCornerShape(...))` explicitly before `.clip(RoundedCornerShape(...))` in the `modifier` chain.
11. **Content Visibility & Bottom Navigation Padding**:
  a. **Floating PillTabBar Obstruction Prevention**: The `PillTabBar` in the Companion app floats at the bottom of the screen with a glassmorphic background. To ensure that users can scroll to and interact with the final items of any list or screen without them being covered by the tab bar, you **MUST** add a bottom padding of at least `100.dp` to the main scrollable container of every sub-tab (`*SubTab.kt` or `*TabContent.kt`).
  b. **Implementation Approach**: 
    - For `LazyColumn`, use `contentPadding = PaddingValues(bottom = 100.dp)`.
    - For a standard `Column` with `verticalScroll`, apply `.padding(bottom = 100.dp)` directly to the `Modifier`.
    - For fixed-height layouts that take the remaining space (like `weight(1f)`), add a `Spacer(modifier = Modifier.height(100.dp))` at the very bottom.
    - **Exception**: Do not add this padding to elements inside `ModalBottomSheet` or dialogs that render on top of the tab bar layer.