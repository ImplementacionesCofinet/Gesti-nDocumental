# Gestión documental de facturas

Aplicación interna desplegable en Vercel, con PostgreSQL administrado por Neon, autenticación Microsoft Entra ID y documentos privados en SharePoint mediante Microsoft Graph.

## Requisitos

- Node.js 22 o posterior
- pnpm 11.25.0
- Proyecto Vercel conectado al repositorio
- Base de datos Neon
- Aplicación registrada en Microsoft Entra ID
- Sitio y biblioteca privada de SharePoint

## Configuración

Copia `.env.example` a `.env.local` para desarrollo. En Vercel configura las mismas variables en Project Settings > Environment Variables; no subas `.env.local` ni secretos al repositorio.

- `DATABASE_URL`: cadena pooled de Neon para la aplicación.
- `AUTH_SECRET`: secreto aleatorio de Auth.js; genera uno con `openssl rand -base64 32`.
- `AUTH_MICROSOFT_ENTRA_ID_ID`, `AUTH_MICROSOFT_ENTRA_ID_SECRET`, `AUTH_MICROSOFT_ENTRA_ID_ISSUER`: credenciales y tenant de la aplicación Entra.
- `CRON_SECRET`: secreto aleatorio compartido con Vercel Cron para la sincronización programada.
- `APP_ROLE_ASSIGNMENTS`: JSON que asigna un rol a cada email corporativo. Solo emails incluidos pueden iniciar sesión.
- `APP_USER_PROFILES`: JSON opcional por email con `area` y `costCenter`.
- `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID`, `GRAPH_CLIENT_SECRET`: identidad de aplicación usada por Microsoft Graph para correo y SharePoint.
- `INVOICE_MAILBOX_ADDRESS`: buzón compartido de facturas; no hay un valor por defecto.
- `SHAREPOINT_SITE_ID`: ID del sitio; la app resuelve la biblioteca predeterminada automáticamente.
- `SHAREPOINT_DRIVE_ID`: opcional; configura un drive específico si el sitio tiene más de una biblioteca.

En Entra registra la URL de callback `https://<dominio-vercel>/api/auth/callback/microsoft-entra-id`. Concede consentimiento de administrador para Microsoft Graph `Mail.Read` (Application) y `Sites.Selected` (Application). TI debe otorgar a la aplicación acceso `write` solo al sitio documental destinado al aplicativo. Restringe también el permiso de correo a `INVOICE_MAILBOX_ADDRESS` mediante Exchange Application RBAC; no dejes `Mail.Read` con alcance a todos los buzones. No concedas `Sites.ReadWrite.All` si `Sites.Selected` es suficiente.

Crea en SharePoint una biblioteca privada con retención, auditoría y respaldo según la política corporativa. Los archivos se guardan bajo `invoices/<invoice-id>/`; el backend los transmite, no genera enlaces anónimos. Las cargas de soporte, certificados y comprobantes aceptan PDF, PNG o JPEG hasta 4 MiB, límite deliberado bajo el máximo de body de una función Vercel.

## Roles

Ejemplo para `APP_ROLE_ASSIGNMENTS`:

```json
{"radicador@empresa.com":"Radicador","aprobador@empresa.com":"Aprobador","admin@empresa.com":"Administrador"}
```

Ejemplo para `APP_USER_PROFILES`:

```json
{"aprobador@empresa.com":{"area":"Compras","costCenter":"Centro de costos 3"}}
```

Los roles permitidos son `Administrador`, `Radicador`, `Aprobador`, `Contabilidad`, `Rechazos DIAN manuales`, `Tesorería` y `Legalizaciones`. La configuración vive en variables protegidas del entorno. Las API comprueban sesión, rol, asignación a la bandeja y origen de las mutaciones. Vercel Cron sincroniza el buzón cada cinco minutos; esta frecuencia requiere un plan Vercel compatible con ejecuciones de cron de cinco minutos. Configura `CRON_SECRET` en el entorno de producción.

## Base de datos

La migración PostgreSQL inicial y el cambio incremental se encuentran en `drizzle/postgres/`. Tras crear Neon, configura `DATABASE_URL` y aplica las migraciones una sola vez:

```sh
pnpm install --frozen-lockfile
pnpm db:migrate
```

No ejecutes migraciones automáticamente en cada build de Vercel. El esquema actual persiste las facturas, referencias a archivos, idempotencia de ingesta e información de workflow. No hay un proceso automático de importación desde una base D1 anterior; antes del corte, valida si existen datos que deban migrarse.

## Desarrollo y despliegue

```sh
pnpm install --frozen-lockfile
pnpm dev
```

En Vercel configura Node.js 22, usa `pnpm install --frozen-lockfile` como instalación y `pnpm build` como build. Ejecuta antes de publicar:

```sh
pnpm exec tsc --noEmit
pnpm run lint
pnpm build
```

El proyecto no se ha publicado desde este workspace: faltan la cuenta/proyecto de Vercel, Neon, el tenant Entra, el sitio SharePoint y sus secretos. `.env.example` contiene solo nombres y valores de muestra, nunca credenciales reales.

## Límites funcionales conocidos

- La conciliación del Excel DIAN está disponible. La consulta oficial de XML por CUFE y la radicación automática DIAN permanecen deshabilitadas hasta contar con integración y autorización oficial; no se simulan en producción.
- Las trazas principales de movimiento se generan en servidor. El modelo corporativo completo descrito en `../Modelo_Datos_TI.md` todavía requiere tablas normalizadas para visitas/eventos, comentarios, pagos, causaciones y retención de auditoría.
- Configura backups de Neon y retención/versionado de SharePoint desde los servicios administrados; no se crean automáticamente con el despliegue.
