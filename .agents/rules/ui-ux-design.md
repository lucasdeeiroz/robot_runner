---
trigger: always_on
---

# UI/UX & Design Guidelines

Você está lidando com design e estilo da UI do Robot Runner AI.

1. **Estética Premium**: A aplicação deve causar uma impressão de software profissional e caro (efeito "Wow"). Use a paleta de cores existente (`bg-surface`, `bg-surface-variant`, `text-on-surface`, `primary`).
2. **Glassmorphism e Blur**: Faça uso de fundos transparentes com desfoque (`backdrop-blur-md`, `bg-surface/80`) para criar camadas de profundidade elegantes.
3. **Animações e Feedback**: Elementos interativos devem reagir ao usuário. Utilize `framer-motion` (via `<motion.div>`) ou transições suaves do Tailwind (`transition-colors`, `transition-all`, `hover:scale-105`) em botões, abas e modais.
4. **Tailwind merge**: Cuidado redobrado ao usar `twMerge` e `clsx` (importado preferencialmente como `import clsx from 'clsx'`). Ao aplicar larguras e alturas fixas (`w-8 h-8`) em cima de botões atômicos, garanta que comportamentos como `inline-flex` não sejam sobrescritos acidentalmente para `flex` absoluto sem testar.
5. **Modo Escuro (Dark Mode)**: Todas as cores hardcoded (ex: `bg-white`, `text-black`) estão proscritas. Use unicamente as variáveis de design tokens (como `outline-variant`, `error`, `success`) para garantir que o Dark Mode e Light Mode funcionem nativamente através das configurações globais do `index.css`.