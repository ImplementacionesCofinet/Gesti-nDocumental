# Implementación de Gestión Documental

## Arquitectura objetivo

- Aplicación Next.js desplegada en Vercel.
- PostgreSQL administrado por Neon mediante Drizzle ORM.
- PDF, XML y soportes en una biblioteca privada de SharePoint, accedida desde el backend mediante Microsoft Graph.
- Inicio de sesión y asignación de roles con Microsoft Entra ID y Auth.js.

El código está en `gestion-facturas-ti-2026-10-19/`. La guía para instalar y desplegar está en su `README.md`.

## Configuración que debe entregar TI

- Proyecto Vercel y dominio corporativo.
- Base Neon y `DATABASE_URL` protegida.
- Registro de Entra para inicio de sesión y credenciales Graph.
- Lista de emails y roles en `APP_ROLE_ASSIGNMENTS`; áreas y centros de costo opcionales en `APP_USER_PROFILES`.
- `CRON_SECRET` para sincronizar el buzón cada cinco minutos desde Vercel Cron; confirmar que el plan Vercel soporte esa frecuencia.
- Buzón compartido configurado en `INVOICE_MAILBOX_ADDRESS`.
- Sitio SharePoint privado y permiso de aplicación `Sites.Selected` con acceso de escritura solo al sitio del aplicativo.
- Consentimiento de administrador para `Mail.Read` (Application) y `Sites.Selected` (Application).
- Restringir `Mail.Read` al buzón de facturas con Exchange Application RBAC.
- Política de backups de Neon, retención de SharePoint, rotación de secretos y monitoreo.

Los secretos se guardan en Vercel Environment Variables; no deben incluirse en el repositorio ni enviarse por chat.

## Migraciones y validación

Las migraciones inicial e incremental de PostgreSQL están en `gestion-facturas-ti-2026-10-19/drizzle/postgres/`. Después de configurar `DATABASE_URL`, aplicar una sola vez con `pnpm db:migrate`; no ejecutar migraciones en cada build.

Comprobaciones antes del despliegue:

```sh
pnpm exec tsc --noEmit
pnpm run lint
pnpm build
```

No se ha conectado ni publicado aún en cuentas de Vercel, Neon, Entra o SharePoint. Tampoco existe un importador automático desde una instalación D1 anterior; revisar y migrar cualquier dato que deba conservarse antes del corte.

## Alcance funcional pendiente

La conciliación del Excel DIAN está disponible. La consulta oficial de XML por CUFE y la radicación directa ante DIAN están deshabilitadas hasta contar con acceso e integración autorizados; la aplicación no debe presentarlas como funciones disponibles.

El esquema operativo actual persiste facturas, archivos, idempotencia de ingesta e información de workflow. El modelo normalizado empresarial descrito en `Modelo_Datos_TI.md` sigue siendo referencia para ampliar auditoría, visitas de bandeja, causaciones y pagos.
