# Paquete para implementación interna

## Contenido

- `app/`: pantallas del aplicativo y rutas de API.
- `components/`: componentes visuales reutilizables.
- `db/`: esquema Drizzle vigente para D1/SQLite del demo.
- `drizzle/`: migraciones del demo.
- `public/demo/`: archivos de ejemplo usados en la demostración.
- `lib/`: utilidades de lectura del Excel DIAN.
- `docs/Modelo_Datos_TI.md`: explicación funcional y de trazabilidad.
- `docs/schema-postgresql.sql`: estructura recomendada para la base empresarial.
- `README.md`: instrucciones generales del proyecto.

## Variables de entorno necesarias

Los valores reales deben configurarse en el administrador de secretos del entorno, nunca dentro del repositorio:

```text
GRAPH_TENANT_ID=
GRAPH_CLIENT_ID=
GRAPH_CLIENT_SECRET=
INVOICE_MAILBOX_ADDRESS=analista.contable@cofinet.com.au
```

En la instalación actual, los bindings de Cloudflare son:

```text
DB=base D1/SQLite
BUCKET=almacenamiento privado para PDF, XML y soportes
```

Para producción debe definirse además el proveedor de autenticación corporativa, la política de permisos y el almacenamiento de backups.

## Puesta en marcha del código

```bash
pnpm install --frozen-lockfile
pnpm run lint
pnpm run build
pnpm run dev
```

## Consideraciones antes de producción

El demo ya expone la ingesta Graph, lectura de ZIP, validación del NIT, consulta del listado DIAN, descarga de documentos, previsualización PDF, roles, flujo de bandejas e indicadores. Para dejarlo en firme, TI debe trasladar a persistencia empresarial los datos que durante la demostración se manejan en memoria de interfaz: visitas de workflow, comentarios, motivos, causaciones, pagos, certificados, legalizaciones y eventos de auditoría. Las tablas necesarias están incluidas en `schema-postgresql.sql`.

También debe reemplazarse la respuesta simulada de `app/api/dian/radicate/route.ts` por la integración oficial autorizada cuando la empresa cuente con certificado y credenciales DIAN.

