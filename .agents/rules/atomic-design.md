---
trigger: always_on
---

# Atomic Design & Propagação de Atualizações

Este projeto segue a metodologia de Atomic Design para seus componentes React (Atoms, Molecules, Organisms). 

1. **Atualização de Átomos**: Sempre que você alterar, estender ou remover propriedades de um componente em `src/components/atoms` (por exemplo, adicionando uma nova `variant` como 'link' ou 'unstyled' em um `Button`), você **DEVE** assumir que haverá quebras de TypeScript em componentes maiores que o envolvem.
2. **Varredura Obrigatória**: Imediatamente após editar um Átomo, utilize ferramentas de busca (como `grep_search`) para localizar Molecules ou Organisms que importem este átomo (ex: `AiButton.tsx` importa `Button.tsx`).
3. **Mapeamento Explícito**: Verifique se os wrappers possuem objetos ou dicionários que mapeiam as chaves do átomo (ex: `separatorStyles[variant]`). Se você criou uma nova variante, adicione-a imediatamente a esses dicionários para prevenir erros silenciosos de tipagem do tipo "Element implicitly has an 'any' type".
4. **Respeito à Interface**: Nunca quebre a interface (API) de um átomo existente. Se for mudar a forma como ele recebe as propriedades (`props`), providencie o refatoramento em toda a base de código para os componentes que dependem dele.
