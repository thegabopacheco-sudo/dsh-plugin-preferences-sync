# Cómo funciona dsh-plugin-preferences-sync

Hub de preferencias para DeepSeek Harness: guarda claves por categoria, importa/exporta PREFERENCIAS en Markdown y mantiene una fuente unica para los plugins.

## Arquitectura

```
DSH ──MCP stdio──► server.mjs (bundle single-file)
                    └─ lógica local del plugin
```

## Herramientas reales

- `status`: Estado
- `list`: Listar preferencias
- `get`: Obtener preferencia
- `set`: Definir preferencia
- `remove`: Eliminar preferencia
- `import`: Importar Markdown
- `export`: Exportar Markdown

## Seguridad

- Lectura por defecto; acciones con `confirm:true`.
- Modo `read-only` por variable de entorno.
- Listas blancas cuando aplique.
- Auditoría en `<DSH_HOME>\cache\preferences-sync\audit.jsonl`.
- Rate limit de acciones.

## Verificación

Tests end-to-end con el cliente MCP oficial (`@modelcontextprotocol/client@2.2.0`)
y artefacto empaquetado (`npm pack` → `postinstall` → servidor desplegado).
