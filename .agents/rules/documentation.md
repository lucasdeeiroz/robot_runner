# 📚 Mandatory Documentation Maintenance Rules

Você está desenvolvendo e implementando novas funcionalidades no Robot Runner AI.

1. **Documentação como Requisito de Conclusão**: A implementação de uma nova funcionalidade principal (Feature), alteração arquitetural, ou mudança significativa na UI **NÃO** é considerada concluída até que a documentação correspondente tenha sido atualizada.
2. **Abordagem Proativa**: Você **DEVE** atualizar os arquivos na pasta `docs/` de forma proativa. Não espere que o usuário peça para você escrever ou atualizar a documentação. Assim que você finalizar e testar a funcionalidade no código, o seu próximo passo obrigatório é documentá-la.
3. **Internacionalização Obrigatória**: O Robot Runner suporta múltiplos idiomas (Inglês, Português, Espanhol). Qualquer alteração ou nova página de documentação inserida em `docs/en/` deve ser imediatamente traduzida e replicada em `docs/pt-BR/` e `docs/es/`.
4. **Alinhamento com o README**: Caso a nova funcionalidade adicione um novo módulo, guia, ou altere o propósito central do aplicativo, certifique-se de atualizar os arquivos `README.md`, `README.pt-BR.md` e `README.es.md` localizados na raiz do projeto para refletir e apontar para a nova documentação.
5. **Formato e Profundidade**: A documentação não deve ser superficial. Use listas de passos (step-by-step), negrito para enfatizar botões e interações na UI, e estruture os guias de forma que um usuário leigo em automação consiga entender como utilizar a nova funcionalidade.
