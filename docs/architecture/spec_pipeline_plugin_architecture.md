# Arquitetura de Plugins & Integração com Esteiras de IA (Spec-Driven Pipelines)

Este documento define a especificação arquitetural para conectar o **Robot Runner** a **Esteiras de IA de Desenvolvimento e Governança de Software** (como a *EsteiraIA*, pipelines Claude Code/Devin/Antigravity, ou esteiras baseadas em *Spec-Driven Development*).

---

## 1. Princípio da Neutralidade e Design Baseado em Plugins

O Robot Runner é uma ferramenta de automação e inspeção de testes móveis **genérica e aberta**. Portanto:
- **Nenhum detalhe proprietário, URL corporativa interna ou segredo deve ser embutido no código-fonte.**
- Todas as integrações com esteiras de engenharia corporativas operam através de **Plugins Configuráveis e Perfis JSON**.
- A adaptação do Robot Runner para trabalhar com a *EsteiraIA* da Positivo Tecnologia (ou qualquer outra esteira) é feita exclusivamente por **configuração de usuário** (`settings.json` / Perfis de Plugins).

---

## 2. Diagrama de Arquitetura

```
   ┌──────────────────────────────────────────────────────────────────────────┐
   │                    ESTEIRA DE IA (Ex: EsteiraIA / Claude)                │
   │   specs/<id>/spec.md ──► cenarios-de-teste.md ──► /qa <id>               │
   └──────────────────────────────────────┬───────────────────────────────────┘
                                          │ Chamada CLI / Headless ou Hook
                                          ▼
   ┌──────────────────────────────────────────────────────────────────────────┐
   │               ROBOT RUNNER (Desktop & Backend Rust)                     │
   │                                                                          │
   │  [1. Spec & BDD Pipeline Plugin]                                         │
   │   • Transpilador Genérico Markdown Spec ──► .robot Suite (POM)           │
   │   • Executor Headless CLI (`robot_runner --spec ... --device ...`)       │
   │   • Gerador de resultados (`resultados.md` + screenshots em `evidencias`)│
   │                                                                          │
   │  [2. Compliance & Logcat Safety Watcher]                                 │
   │   • Motor de Regex Configurável (PCI / PAN / CVV / SELinux / API Keys)   │
   │   • Detecção em tempo real no Ring-Buffer (Desktop & Companion)          │
   │                                                                          │
   │  [3. Webhook & Telemetry Event Dispatcher]                              │
   │   • Pipeline de Envio Assíncrono para endpoints de métricas              │
   │   • Payload Mapeável (Tags, Duração, Status PASS/FAIL, Bugs detectados)  │
   └──────────────────────────────────────┬───────────────────────────────────┘
                                          │ POST /api/eventos (Assíncrono/Retry)
                                          ▼
   ┌──────────────────────────────────────────────────────────────────────────┐
   │                    PLATAFORMA DE MÉTRICAS EXTERNA                        │
   │              (Ex: web-metricas Positivo, Datadog, Grafana)               │
   └──────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Módulos da Integração

### 3.1 Plugin de Pipeline de Specs (Spec-Driven QA)
Permite que o Robot Runner leia diretamente pastas de especificação (ex: `specs/<codigo>-<slug>/testes/cenarios-de-teste.md`), execute os testes no dispositivo Android real via Appium/Robot Framework e grave a saída padronizada:
- **Entrada:** Arquivo markdown com cenários BDD (Gherkin) ou suíte `.robot`.
- **Saída:** Arquivo `resultados.md` com tabela detalhada de itens `AUTO` e `MANUAL`, resumo de `PASS`/`FAIL` e screenshots salvas na subpasta `evidencias/`.

#### Exemplo de Configuração no `settings.json`:
```json
{
  "specPipeline": {
    "enabled": true,
    "baseSpecsDir": "specs",
    "scenariosFilename": "cenarios-de-teste.md",
    "resultsFilename": "resultados.md",
    "evidenceSubdir": "evidencias",
    "autoTranspileToRobot": true
  }
}
```

---

### 3.2 Dispatcher de Telemetria e Webhooks (Metrics Integration)
Permite ao Robot Runner emitir eventos de telemetria e produtividade para plataformas externas (como a API do `web-metricas` ou coletores OpenTelemetry):
- **Eventos Disparados:**
  - `spec_qa_completed`: Resumo da rodada de QA de uma especificação (duração, contagem PASS/FAIL/BLOQUEADO).
  - `suite_completed`: Execução manual ou automatizada de suíte de testes.
  - `hardware_checkup_completed`: Relatório de saúde do dispositivo (temperatura, bateria, latência de tela).
- **Tratamento Resiliente:** Envio em segundo plano (non-blocking) via Rust com fila de retentativas.

#### Exemplo de Configuração no `settings.json`:
```json
{
  "telemetryWebhooks": {
    "enabled": true,
    "endpointUrl": "http://localhost:4317/api/eventos",
    "headers": {
      "Content-Type": "application/json"
    },
    "tags": {
      "source": "robot_runner",
      "modo": "COM_IA"
    },
    "sendOnTestCompleted": true,
    "sendOnHardwareAudit": true
  }
}
```

---

### 3.3 Motor de Compliance e Segurança no Logcat (PCI & SELinux Watcher)
Mecanismo de inspeção contínua no Ring-Buffer de Logcat (Desktop & Companion) para identificar e mitigar vazamento de dados sensíveis ou falhas críticas de sistema:
- **Regras Configuráveis por Regex:**
  - Padrões de Cartão de Crédito (PAN de 13 a 19 dígitos).
  - Códigos de Segurança (CVV de 3 ou 4 dígitos).
  - Violações de Políticas SELinux (`avc: denied`).
  - Tokens de Autenticação / Chaves Privadas (`ghp_`, `eyJh...`, `-----BEGIN PRIVATE KEY`).
- **Ações ao Detectar:**
  - Mascarar dados sensíveis nos logs exibidos na interface (`[DADO SENSÍVEL OCULTADO]`).
  - Alertar visualmente o operador de QA com badge de segurança.
  - Marcar o teste como `FAIL (Crítico)` no relatório final.

#### Exemplo de Regra Configurável:
```json
{
  "complianceWatcher": {
    "enabled": true,
    "rules": [
      {
        "id": "pci-pan",
        "name": "PCI PAN Detection",
        "pattern": "\\b(?:\\d[ -]*?){13,19}\\b",
        "severity": "critical",
        "maskInLogs": true,
        "blockOnViolation": true
      },
      {
        "id": "selinux-denied",
        "name": "SELinux AVC Denials",
        "pattern": "avc:\\s+denied",
        "severity": "warning",
        "maskInLogs": false,
        "blockOnViolation": false
      }
    ]
  }
}
```

---

## 4. Roteiro de Implementação

| Fase | Escopo | Entregáveis |
| :--- | :--- | :--- |
| **Fase 1** | **Spec Pipeline & Transpiler** | Leitura de `cenarios-de-teste.md` $\rightarrow$ `.robot` $\rightarrow$ gravação de `resultados.md` e `evidencias/`. |
| **Fase 2** | **Telemetry Dispatcher** | Envio assíncrono de eventos de execução e QA para endpoints de métricas configuráveis. |
| **Fase 3** | **Compliance Watcher** | Varredura de PCI/SELinux no Logcat do Desktop e do Companion com mascaramento automático. |
| **Fase 4** | **UI de Configuração** | Interface em *Configurações $\rightarrow$ Plugins & Integrações* para gerenciamento dos perfis. |
