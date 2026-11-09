---
name: ui-visual-bug-resolution
description: Workflow autônomo e focado para diagnosticar e resolver bugs visuais e de CSS (Tailwind) relacionados ao Design System do Robot Runner.
trigger: "bug visual", "cor errada", "texto invisível", "hover estranho", "botão não clica"
---

# Workflow: UI & Tailwind Visual Bug Resolution

**Descrição**: Este workflow orienta a IA na investigação e correção de falhas visuais de UI causadas por conflitos no TailwindCSS, sobreposição de classes no React e má implementação do Dark Mode.

## Passo a Passo para a IA (Execução Mandatória)

Sempre que o usuário reportar problemas visuais, de cores, ou de responsividade em elementos interativos, siga esta investigação lógica:

1. **Localização do Componente**
   - Encontre a aba ou painel afetado via `grep_search`. Se o usuário der o nome de um botão, busque por chaves de tradução (ex: `t('chave')`) ou ícones do `lucide-react` atrelados a ele.

2. **Auditoria de Componentes Atômicos**
   - Inspecione se o elemento com problema é um Átomo (ex: `<Button>`, `<Badge>`).
   - Verifique se a cor, tamanho ou estilo desejado já não está contemplado em uma `variant` ou `size` existente do próprio Átomo. 
   - **Crucial**: Verifique se o componente não está implicitamente assumindo uma `variant` padrão incorreta por falta de declaração (ex: um botão de ícone isolado deve ser `variant="ghost"`, e não `primary`).

3. **Caça aos Overrides e twMerge Conflicts**
   - Procure por overrides injetados no `className` do componente. 
   - Se um botão está com problema de legibilidade de texto em hover (ex: "texto fica invisível"), é muito provável que um fundo explícito (`hover:bg-secondary-container`) no `className` esteja entrando em conflito com o estado de texto (`text-on-primary`) gerenciado dentro do Átomo. Remova a classe conflitante em favor das regras da Variante original.

4. **Investigação de Vazamento do Dark Mode (Bleeding)**
   - Caso a queixa seja "cor lamacenta", "pálida" ou "vazada", cheque imediatamente o uso de **modificadores de opacidade** (`bg-primary/90`, `bg-success/50`) em botões ou painéis que deveriam ser **sólidos**.
   - No modo escuro, fundos semitransparentes permitem que a cor preta/cinza do canvas principal se misture com a cor semântica, sujando-a. 
   - Aja substituindo regras de opacidade por regras de iluminação geométrica, como `hover:brightness-110`, que resolvem o problema nativamente.

5. **Validação Final**
   - Assegure-se de que a remoção das classes de CSS não impactou outras margens (`margin`), paddings (`p-`) ou tamanhos absolutos (`w-`, `h-`) do layout. Se impactar, migre as regras de tamanho para o local correto (ex: se era um botão que ficou grande, mude para `variant="unstyled"` e retenha as margens).
