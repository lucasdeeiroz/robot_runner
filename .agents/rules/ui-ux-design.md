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
6. **Hover em Cores Sólidas (Dark Mode)**: NUNCA reduza a opacidade (ex: `hover:bg-primary/90`) no estado de hover de botões ou elementos com cores sólidas e semânticas (`primary`, `success`, `error`, `warning`). Em Dark Mode, isso faz com que a cor escura de fundo vaze (bleed), deixando o elemento com aparência suja/pálida. Utilize propriedades de iluminação (ex: `hover:brightness-110`) para criar o efeito de destaque.
7. **Variantes Implícitas e Classes Mescladas**: Ao utilizar componentes genéricos (como `<Button>`), sempre declare explicitamente a variante (`variant="ghost"`, `variant="unstyled"` etc.) caso não queira o comportamento visual padrão (geralmente `primary`). Evite injetar cores de hover hardcoded via `className` (`hover:bg-secondary-container`) sobre componentes que já possuem variantes de cor de fundo configuradas, pois isso causará quebra de legibilidade e conflito com a cor do texto do componente.