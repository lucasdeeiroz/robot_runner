# Página Sobre

Fornece metadados sobre a build atual, licenciamento e mecanismos de atualização do Robot Runner.

### Principais Funcionalidades

- **Controle de Versão:** Exibe a versão semântica atual do cliente instalado.
- **Canais de Atualização:** Selecione entre `stable`, `beta` ou `alpha` para receber recursos antecipados.
- **Atualizações OTA:** Botão para disparar o atualizador embutido do Tauri, baixando a nova versão automaticamente.
- **Informações de Arquitetura:** Lista as tecnologias open-source (Rust, Tauri, React) que impulsionam a ferramenta.

### Integridade da Atualização (Versão Portátil)
Ao atualizar a versão **portátil**, o Robot Runner verifica o download antes de substituir o executável:
1. O arquivo de atualização é baixado da release do GitHub.
2. O app baixa o `SHA256SUMS.txt` da **mesma release** e calcula o SHA-256 do arquivo baixado.
3. O executável só é substituído se os hashes **coincidirem**. Apenas nomes de arquivo simples da release (`Robot.Runner_*`) são aceitos; qualquer outro nome de asset é rejeitado.
4. Se o `SHA256SUMS.txt` não existir, não tiver uma entrada para o arquivo ou o hash não conferir, a atualização é **recusada**, o arquivo baixado é apagado e você é orientado a baixar a nova versão manualmente na página **Releases** do GitHub.

### Como Usar
Clique no ícone de Info no canto inferior esquerdo. Use esta página para forçar uma verificação manual de atualização no GitHub Releases.
