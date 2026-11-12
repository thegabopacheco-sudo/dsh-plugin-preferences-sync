# dsh-plugin-preferences-sync — Preferences Sync

Hub de preferencias para DeepSeek Harness: guarda claves por categoria, importa/exporta PREFERENCIAS en Markdown y mantiene una fuente unica para los plugins.

## Herramientas

| Tool | Qué hace |
|---|---|
| `status` | Estado |
| `list` | Listar preferencias |
| `get` | Obtener preferencia |
| `set` | Definir preferencia |
| `remove` | Eliminar preferencia |
| `import` | Importar Markdown |
| `export` | Exportar Markdown |

## Instalación

Desde **DSH → Settings → Plugins** instala `github:thegabopacheco-sudo/dsh-plugin-preferences-sync` y permite el script de instalación.

```
dsh plugin --profile <perfil> add github:thegabopacheco-sudo/dsh-plugin-preferences-sync
```

## Seguridad

- Lectura por defecto; escritura solo con `confirm:true` y pedido explícito.
- `DSH_PREFERENCES_SYNC_MODE=read-only` desactiva acciones.
- Listas blancas y auditoría en `<DSH_HOME>\cache\preferences-sync\audit.jsonl`.

## Licencia

MIT © thegabopacheco-sudo
