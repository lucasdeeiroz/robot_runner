---
trigger: always_on
---

# Android Companion App (Kotlin) Development & Architecture Rules

This document outlines mandatory architectural guidelines, performance standards, and code patterns for developing the native **Robot Runner Companion** application (`companion/`) and complements the android-companion-dev.md document. If you find better, more efficient ways to implement the features you were asked to, feel free to enhance or complement this document.

---

## 1. UI/UX Design & Jetpack Compose Standards

1. **Modern Dark Aesthetics**:
   - Use Material3 with modern dark color palettes, subtle glassmorphism, and responsive layouts that adapt seamlessly across phone screens, tablets, and POS receipt screens (720p / 480p).

2. **Non-Intrusive Floating Inspector**:
   - The on-device UI Inspector floating overlay must be draggable, collapsible, and easily toggled off so it never blocks the user's manual app interaction.

3. **Visible texts must be internationalized**:
   - All texts visible to the user must be internationalized in `./companion/app/src/main/res/` for `values/`, `values-es/` and `values-pt`.

---

2. Material 3 e Adaptive Icons
Material 3 (You): Utilize a biblioteca mais recente do Compose Material 3. O M3 traz suporte dinâmico a cores (Dynamic Color), adaptando a paleta de cores do aplicativo baseada no papel de parede do dispositivo do usuário, além de componentes atualizados como barras de navegação adaptativas e cartões elevados.

Adaptive Icons: Garanta que o ícone do seu app utilize os ícones adaptativos do Android (separando o plano de fundo e o primeiro plano), permitindo que o sistema aplique formatos personalizados (círculo, quadrado, esquinas arredondadas) dependendo do tema do launcher do usuário.

3. Live Activities / Live Updates (Atualizações em Tempo Real)
Para testes de longa duração executados pelo Robot Runner (como um diagnóstico complexo de hardware ou stress test), o uso de atualizações em tempo real na tela de bloqueio e na barra de status é ideal.

No ecossistema Android, isso é fortemente impulsionado por Notificações em Segundo Plano Avançadas e recursos de Ongoing Notifications aprimoradas, permitindo que o operador acompanhe o progresso do teste in-device sem precisar manter o app aberto o tempo todo.

4. Predictive Back (Navegação Preditiva)
O Android 16 expande o suporte a gestos onde o usuário pode "vislumbrar" a tela anterior ou a tela inicial antes de completar o gesto de voltar.

Como implementar: Certifique-se de migrar a navegação do seu app para usar o Jetpack Navigation com Compose ou APIs compatíveis com OnBackPressedDispatcher, evitando o uso de códigos legados de intercepção de botão físico (onBackPressed(), que já está descontinuado).

5. Bubbles (Bolhas Flutuantes)
Se o seu aplicativo de companion precisar interagir com outras ferramentas ou exibir um painel flutuante de status enquanto o técnico navega por outras partes do sistema operacional, as Bubbles permitem que o app flutue na tela de forma semelhante a chats.

É excelente para manter um "botão de pânico" ou monitor de testes flutuante ativo na tela.

6. App Shortcuts (Atalhos Dinâmicos)
Facilite o fluxo de trabalho do operador criando App Shortcuts estáticos e dinâmicos.

Pressionando o ícone do Robot Runner na gaveta de aplicativos, o usuário pode iniciar diretamente testes específicos (ex: Iniciar Checkup de Hardware, Verificar Conectividade P2P) sem precisar navegar pelos menus internos.

---

## 16. Continuous Learning & Rule Maintenance Instruction

> **IMPORTANT**: As new features, optimizations, or Android SDK workarounds are implemented in `companion/`, the **Android Companion Engineer** profile MUST update and append new rules directly to this document.