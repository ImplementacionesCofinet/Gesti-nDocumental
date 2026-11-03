# Gestión de facturas — modelo de datos para TI

## 1. Propósito

Este documento acompaña el código del aplicativo de gestión documental de facturas. Describe el modelo empresarial recomendado y distingue las entidades que aún faltan normalizar en el esquema operativo.

La solución debe conservar una sola ficha por documento y registrar cada permanencia en una bandeja como un registro independiente. De esta manera es posible responder, sin promedios ni tiempos objetivo:

- ¿Dónde está actualmente el documento?
- ¿Qué usuario lo tiene asignado?
- ¿Desde cuándo está allí?
- ¿Cuánto tiempo permaneció en cada bandeja anterior?
- ¿Quién lo devolvió, por qué motivo y hacia dónde?

## 2. Decisión tecnológica

La arquitectura de despliegue acordada es Next.js en Vercel, Drizzle ORM con PostgreSQL administrado por Neon, Microsoft Entra ID/Auth.js para autenticación y SharePoint privado para archivos mediante Microsoft Graph. El esquema operativo actual tiene estas tablas:

| Tabla actual | Uso |
|---|---|
| `invoice_records` | Datos principales, bandeja y estado JSONB del workflow |
| `invoice_files` | Metadatos y ruta de PDF/XML/soportes guardados en SharePoint |
| `ingestion_messages` | Idempotencia y resultado de la lectura del buzón |

Las migraciones Drizzle operativas están en `gestion-facturas-ti-2026-10-19/drizzle/postgres/`; el DDL ampliado de `schema-postgresql.sql` sigue siendo la referencia para normalizar trazabilidad, comentarios, pagos y auditoría. No existe un importador automático desde D1: antes del corte se debe inventariar y migrar cualquier dato real que deba conservarse.

## 3. Relación general

```mermaid
erDiagram
    APP_USERS ||--o{ USER_ROLES : tiene
    APP_ROLES ||--o{ USER_ROLES : asigna
    INVOICES ||--o{ WORKFLOW_VISITS : registra
    INVOICES ||--o{ WORKFLOW_EVENTS : audita
    INVOICES ||--o{ DOCUMENT_FILES : contiene
    INVOICES ||--o{ DOCUMENT_COMMENTS : recibe
    INVOICES ||--o| ACCOUNTING_RECORDS : tiene
    INVOICES ||--o| PAYMENTS : tiene
    DIAN_BATCHES ||--o{ DIAN_ROWS : contiene
    DIAN_ROWS }o--o| INVOICES : puede_coincidir
    MAILBOXES ||--o{ INGESTION_MESSAGES : recibe
    INGESTION_MESSAGES }o--o| INVOICES : origina
```

## 4. Tablas principales

### Catálogos y seguridad

- `app_users`: personas que interactúan con el aplicativo.
- `app_roles`: Radicador, Aprobador, Contabilidad, Rechazos DIAN manuales, Tesorería, Legalizaciones y Administrador.
- `user_roles`: relación muchos a muchos entre usuarios y roles.
- `areas`: TIC, Compras, Contabilidad, Gestión documental, Tesorería, etc.
- `cost_centers`: opciones seleccionables por el Aprobador.
- `mailboxes`: buzones configurados para recepción.

### Documento y archivos

- `invoices`: ficha única del documento, CUFE/CUDE, proveedor, valor, vencimiento, NIT receptor, bandeja y asignación actual.
- `document_files`: PDF, XML, soportes, certificados de rechazo, documentos de causación y comprobantes de pago. El archivo físico vive en SharePoint privado; la base guarda metadatos y la ruta segura.
- `document_comments`: comentarios opcionales realizados por cualquier rol autorizado.
- `invoice_relations`: relación de notas crédito o débito con la factura original.

### Trazabilidad

- `workflow_visits`: una fila por permanencia en Radicación, Aprobación, Contabilidad, Tesorería, Rechazos o Legalizaciones. Al salir de la bandeja se cierra con `ended_at` y `duration_seconds`.
- `workflow_events`: acciones ejecutadas y auditoría del movimiento. Incluye motivo y categoría cuando se devuelve o se envía a rechazo.
- `audit_log`: cambios sensibles de seguridad, configuración y administración.

### Procesos especiales

- `accounting_records`: documento de causación diligenciado por Contabilidad.
- `payments`: fecha, referencia y usuario que registra el pago. El comprobante se guarda como `document_files` con tipo `PAYMENT_PROOF`.
- `legalizations`: documento de legalización para soportes pagados de contado que no generan CxP.
- `rejection_cases`: gestión manual ante DIAN, certificado adjunto y archivo posterior.
- `ingestion_messages`: control de mensajes y adjuntos procesados para no duplicar facturas.
- `dian_batches`: archivo mensual cargado desde DIAN.
- `dian_rows`: filas del listado DIAN, resultado de conciliación y eventual factura radicada por CUFE.
- `dian_xml_requests`: trazabilidad de la solicitud de XML por CUFE cuando se active el conector oficial DIAN.

## 5. Reglas funcionales que debe aplicar la base o el servicio

1. El NIT receptor se guarda normalizado, sin puntos ni dígito de verificación, y debe ser `901373083` para radicar.
2. Un CUFE/CUDE no puede crear dos fichas de factura.
3. La combinación proveedor + prefijo + folio debe controlar duplicados cuando todavía no exista CUFE.
4. Cada cambio de bandeja debe cerrar la permanencia abierta y crear una nueva. El endpoint actual registra las visitas en `workflow_state` JSONB; para auditoría empresarial de largo plazo deben normalizarse a `workflow_visits` y `workflow_events`.
5. El documento de causación es un campo de Contabilidad; enviar a Tesorería no significa crear automáticamente la causación.
6. Tesorería permanece responsable hasta que registre el comprobante de pago y cierre el expediente.
7. La devolución exige categoría y comentario. El rechazo manual exige motivo y certificado antes de archivar.
8. El PDF y el XML deben permanecer descargables según permisos; el PDF puede mostrarse en línea.
9. Un archivo recibido debe identificarse por `message_id + attachment_id` para evitar reprocesamiento.
10. Los secretos de Microsoft Graph, DIAN y almacenamiento no deben estar en el repositorio; deben vivir en el administrador de secretos o variables protegidas del entorno.

## 6. Flujo de tiempos recomendado

Al completar la normalización, cada expediente tendrá una fila en `workflow_visits` para Radicación. Ejemplo de movimiento:

1. Se cierra la visita de Radicación con `ended_at` y duración.
2. Se registra un `workflow_event` con acción `ASSIGN_TO_APPROVER`.
3. Se crea una visita abierta para Aprobación con el usuario elegido.
4. Al devolver o avanzar se repite el patrón.

La bandeja de consulta calcula el tiempo actual con `COALESCE(duration_seconds, NOW() - started_at)` y muestra la última visita abierta. El historial muestra todas las visitas cerradas, incluso si el documento fue devuelto y pasó nuevamente por la misma bandeja.

## 7. Índices mínimos

El DDL crea índices para CUFE/CUDE, bandeja actual, responsable, vencimiento, proveedor, fechas de recepción y eventos. Para búsquedas de texto de alto volumen, TI puede agregar un índice full-text o Elasticsearch/OpenSearch; no es necesario para el demo.

## 8. Migración y corte

1. Crear Neon y aplicar las migraciones Drizzle de `drizzle/postgres/`.
2. Determinar si existe información real en D1; no copiar las facturas de muestra del demo.
3. Si existen expedientes reales, migrar `invoice_records` a la estructura equivalente conservando UUID, claves de idempotencia e historial.
4. Copiar los objetos físicos del almacenamiento actual a SharePoint privado y actualizar sus `object_key`.
5. Mantener `invoice_records`, `invoice_files` e `ingestion_messages` durante la transición.
6. Migrar `history`/`workflow_state` a visitas y eventos normalizados cuando se despliegue ese modelo.
7. Validar duplicados por CUFE y por proveedor + prefijo + folio antes del corte.
8. Activar backups, monitorización y un plan de reversión antes de retirar la fuente anterior.

## 9. Entornos

- **Desarrollo:** base aislada y almacenamiento de pruebas; nunca usar el buzón productivo.
- **Pruebas/UAT:** datos anonimizados, usuarios de prueba y buzón de ensayo.
- **Producción:** Vercel + Neon, Microsoft Graph con consentimiento de administrador Entra, SharePoint con `Sites.Selected` limitado al sitio del aplicativo, backups y permisos por rol.

