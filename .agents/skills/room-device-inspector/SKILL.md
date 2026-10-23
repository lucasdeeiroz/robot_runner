---
name: room-device-inspector
description: Inspeção, extração e auditoria em tempo real do banco de dados Room criptografado (AutoReplyDatabase: memories, chat_turns, engine_logs) do dispositivo Android via ADB e scripts locais.
---

# Room Device Inspector Skill

Esta skill permite inspecionar, exportar e consultar diretamente o banco de dados Room do aplicativo (`AutoReplyDatabase`), mesmo sendo protegido por **SQLCipher** com chave dinâmica no Android Keystore.

## Como Funciona

1. **Descriptografia On-Device**:
   O aplicativo conta com o `RoomInspectorReceiver` (`com.lucasdeeiroz.autoreply.EXPORT_DB`), que aciona a função interna do SQLCipher `sqlcipher_export('plaintext')`. Isso gera uma cópia limpa, sem chave, em `/sdcard/Android/data/com.lucasdeeiroz.autoreply/files/autoreply_plain.db`.
2. **Extração via ADB**:
   O script `pull_db.ps1` dispara o broadcast e realiza o `adb pull` para a pasta `.local_db/autoreply_plain.db`.
3. **Consulta Imediata**:
   O script `query_db.ps1` executa consultas SQL locais formatadas em tabela no terminal.
4. **Integração com MCP SQLite**:
   Uma vez puxado para `.local_db/autoreply_plain.db`, o MCP Server `sqlite` (ou `sqlite-mcp`) tem acesso total às tabelas para que o agente AI inspecione memórias, fatos, lembretes, logs e turnos de conversa durante o desenvolvimento.

---

## Comandos Rápidos

### 1. Puxar o banco do dispositivo conectado
```powershell
.\.agents\skills\room-device-inspector\scripts\pull_db.ps1
```
*Com múltiplos dispositivos:*
```powershell
.\.agents\skills\room-device-inspector\scripts\pull_db.ps1 -DeviceSerial RQCR6002S1H
```

### 2. Consultar tabelas locais
```powershell
# Ver fatos cadastrados
.\.agents\skills\room-device-inspector\scripts\query_db.ps1 -Table facts

# Ver lembretes
.\.agents\skills\room-device-inspector\scripts\query_db.ps1 -Table reminders

# Ver histórico de turnos de chat
.\.agents\skills\room-device-inspector\scripts\query_db.ps1 -Table chat

# Ver logs do motor de IA
.\.agents\skills\room-device-inspector\scripts\query_db.ps1 -Table logs

# Query SQL arbitrária
.\.agents\skills\room-device-inspector\scripts\query_db.ps1 -Sql "SELECT category, count(*) FROM memories GROUP BY category"
```

### 3. Consulta rápida direto no dispositivo via ADB (sem pull)
```bash
adb shell am broadcast -a com.lucasdeeiroz.autoreply.QUERY_DB --es sql "SELECT id, category, content FROM memories LIMIT 5"
```
Os resultados são emitidos imediatamente no logcat sob a tag `RoomInspector`.

---

## Estrutura do Banco (`AutoReplyDatabase`)

| Tabela | Descrição |
|--------|-----------|
| `memories` | Fatos, regras aprendidas e lembretes (`id`, `category`, `status`, `importance`, `content`, `targetContact`, `targetDate`, `targetTime`, etc.) |
| `chat_turns` | Turnos de conversa (`id`, `role`, `text`, `time`) |
| `engine_logs` | Logs estruturados do motor de IA (`id`, `timestamp`, `level`, `message`, `source`) |

