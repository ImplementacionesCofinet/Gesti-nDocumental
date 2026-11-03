-- Gestión de facturas electrónicas
-- Modelo de referencia para PostgreSQL 15+
-- El código del demo usa D1/SQLite; este archivo representa el modelo normalizado
-- recomendado para una implementación empresarial.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS facturacion;
SET search_path TO facturacion, public;

CREATE TABLE areas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code varchar(40) NOT NULL UNIQUE,
    name varchar(120) NOT NULL UNIQUE,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE cost_centers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code varchar(40) NOT NULL UNIQUE,
    name varchar(120) NOT NULL,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app_users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    username varchar(120) NOT NULL UNIQUE,
    display_name varchar(160) NOT NULL,
    email varchar(255),
    area_id uuid REFERENCES areas(id),
    active boolean NOT NULL DEFAULT true,
    external_identity varchar(255),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app_roles (
    code varchar(50) PRIMARY KEY,
    name varchar(120) NOT NULL UNIQUE,
    description varchar(255),
    active boolean NOT NULL DEFAULT true
);

CREATE TABLE user_roles (
    user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    role_code varchar(50) NOT NULL REFERENCES app_roles(code),
    assigned_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, role_code)
);

CREATE TABLE mailboxes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    address varchar(255) NOT NULL UNIQUE,
    provider varchar(40) NOT NULL DEFAULT 'MICROSOFT_GRAPH',
    active boolean NOT NULL DEFAULT true,
    last_sync_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE providers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nit varchar(30) NOT NULL,
    legal_name varchar(255) NOT NULL,
    email varchar(255),
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (nit)
);

CREATE TABLE invoices (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    source_key varchar(255) NOT NULL UNIQUE,
    provider_id uuid REFERENCES providers(id),
    document_type varchar(40) NOT NULL DEFAULT 'FACTURA_ELECTRONICA'
        CHECK (document_type IN ('FACTURA_ELECTRONICA', 'NOTA_CREDITO', 'NOTA_DEBITO', 'DOCUMENTO_EQUIVALENTE', 'CUENTA_COBRO', 'DOCUMENTO_SOPORTE')),
    document_number varchar(120) NOT NULL,
    prefix varchar(40) NOT NULL DEFAULT '',
    folio varchar(80) NOT NULL,
    cufe varchar(150),
    cude varchar(150),
    supplier_nit varchar(30) NOT NULL DEFAULT '',
    supplier_name_snapshot varchar(255) NOT NULL,
    amount numeric(18,2) NOT NULL DEFAULT 0,
    currency_code char(3) NOT NULL DEFAULT 'COP',
    issue_date date,
    due_date date,
    due_source varchar(40) NOT NULL DEFAULT 'NO_REGISTRADA',
    received_at timestamptz NOT NULL,
    recipient_name varchar(255) NOT NULL,
    recipient_nit varchar(30) NOT NULL,
    recipient_nit_valid boolean NOT NULL DEFAULT false,
    payment_term varchar(120),
    description text NOT NULL DEFAULT '',
    source_subject text NOT NULL DEFAULT '',
    mailbox_id uuid REFERENCES mailboxes(id),
    area_id uuid REFERENCES areas(id),
    cost_center_id uuid REFERENCES cost_centers(id),
    routing_destination varchar(30) NOT NULL DEFAULT 'CXP'
        CHECK (routing_destination IN ('CXP', 'LEGALIZACIONES')),
    status varchar(30) NOT NULL DEFAULT 'NUEVA'
        CHECK (status IN ('NUEVA', 'EN_REVISION', 'DEVUELTA', 'POR_RECHAZAR', 'EN_PAGO', 'ARCHIVADA')),
    current_queue varchar(40) NOT NULL DEFAULT 'RADICADOR'
        CHECK (current_queue IN ('RADICADOR', 'APROBADOR', 'CONTABILIDAD', 'RECHAZOS_DIAN_MANUALES', 'TESORERIA', 'LEGALIZACIONES', 'ARCHIVO')),
    current_assigned_user_id uuid REFERENCES app_users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    archived_at timestamptz,
    CHECK (recipient_nit_valid OR status = 'NUEVA')
);

CREATE UNIQUE INDEX uq_invoices_cufe ON invoices (cufe) WHERE cufe IS NOT NULL AND cufe <> '';
CREATE UNIQUE INDEX uq_invoices_cude ON invoices (cude) WHERE cude IS NOT NULL AND cude <> '';
CREATE UNIQUE INDEX uq_invoices_provider_document ON invoices (supplier_nit, prefix, folio);
CREATE INDEX idx_invoices_current_queue ON invoices (current_queue, status);
CREATE INDEX idx_invoices_current_user ON invoices (current_assigned_user_id, status);
CREATE INDEX idx_invoices_due_date ON invoices (due_date);
CREATE INDEX idx_invoices_received_at ON invoices (received_at);
CREATE INDEX idx_invoices_supplier_name ON invoices (supplier_name_snapshot);

CREATE TABLE document_files (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    file_type varchar(30) NOT NULL
        CHECK (file_type IN ('PDF', 'XML', 'SUPPORT', 'CAUSATION', 'REJECTION_CERTIFICATE', 'PAYMENT_PROOF', 'LEGALIZATION_SUPPORT', 'OTHER')),
    file_name varchar(255) NOT NULL,
    content_type varchar(150) NOT NULL,
    storage_provider varchar(40) NOT NULL DEFAULT 'R2',
    storage_key text NOT NULL UNIQUE,
    size_bytes bigint NOT NULL DEFAULT 0,
    sha256 char(64),
    uploaded_by_user_id uuid REFERENCES app_users(id),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_document_files_invoice ON document_files (invoice_id, file_type);

CREATE TABLE workflow_visits (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    queue_code varchar(40) NOT NULL
        CHECK (queue_code IN ('RADICADOR', 'APROBADOR', 'CONTABILIDAD', 'RECHAZOS_DIAN_MANUALES', 'TESORERIA', 'LEGALIZACIONES', 'ARCHIVO')),
    assigned_user_id uuid REFERENCES app_users(id),
    started_at timestamptz NOT NULL,
    ended_at timestamptz,
    duration_seconds bigint,
    closed_by_user_id uuid REFERENCES app_users(id),
    close_action varchar(60),
    CHECK (ended_at IS NULL OR ended_at >= started_at),
    CHECK (duration_seconds IS NULL OR duration_seconds >= 0)
);

CREATE UNIQUE INDEX uq_workflow_visits_open ON workflow_visits (invoice_id) WHERE ended_at IS NULL;
CREATE INDEX idx_workflow_visits_invoice ON workflow_visits (invoice_id, started_at);
CREATE INDEX idx_workflow_visits_user ON workflow_visits (assigned_user_id, started_at);
CREATE INDEX idx_workflow_visits_queue ON workflow_visits (queue_code, started_at);

CREATE TABLE workflow_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    actor_user_id uuid REFERENCES app_users(id),
    action_code varchar(60) NOT NULL,
    from_queue varchar(40),
    to_queue varchar(40),
    reason_category varchar(120),
    reason text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_workflow_events_invoice ON workflow_events (invoice_id, created_at);
CREATE INDEX idx_workflow_events_action ON workflow_events (action_code, created_at);

CREATE TABLE document_comments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    author_user_id uuid NOT NULL REFERENCES app_users(id),
    body text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_document_comments_invoice ON document_comments (invoice_id, created_at);

CREATE TABLE invoice_relations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    related_invoice_id uuid NOT NULL REFERENCES invoices(id),
    relation_type varchar(30) NOT NULL
        CHECK (relation_type IN ('NOTA_CREDITO_DE', 'NOTA_DEBITO_DE', 'SUSTITUYE', 'REFERENCIA')),
    reason text,
    created_by_user_id uuid REFERENCES app_users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (invoice_id, related_invoice_id, relation_type)
);

CREATE TABLE accounting_records (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id uuid NOT NULL UNIQUE REFERENCES invoices(id) ON DELETE CASCADE,
    causation_document varchar(120) NOT NULL,
    recorded_by_user_id uuid NOT NULL REFERENCES app_users(id),
    recorded_at timestamptz NOT NULL DEFAULT now(),
    notes text
);

CREATE TABLE payments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id uuid NOT NULL UNIQUE REFERENCES invoices(id) ON DELETE CASCADE,
    payment_reference varchar(120),
    payment_date date,
    amount numeric(18,2),
    recorded_by_user_id uuid NOT NULL REFERENCES app_users(id),
    recorded_at timestamptz NOT NULL DEFAULT now(),
    closed_at timestamptz,
    CHECK (amount IS NULL OR amount >= 0)
);

CREATE TABLE legalizations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id uuid NOT NULL UNIQUE REFERENCES invoices(id) ON DELETE CASCADE,
    legalization_document varchar(120) NOT NULL,
    confirmed_by_user_id uuid NOT NULL REFERENCES app_users(id),
    confirmed_at timestamptz NOT NULL DEFAULT now(),
    notes text
);

CREATE TABLE rejection_cases (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id uuid NOT NULL UNIQUE REFERENCES invoices(id) ON DELETE CASCADE,
    rejection_reason text NOT NULL,
    sent_to_dian_at timestamptz,
    certificate_file_id uuid REFERENCES document_files(id),
    completed_by_user_id uuid REFERENCES app_users(id),
    completed_at timestamptz,
    archived_at timestamptz
);

CREATE TABLE ingestion_messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    mailbox_id uuid NOT NULL REFERENCES mailboxes(id),
    provider_message_id varchar(255) NOT NULL,
    provider_attachment_id varchar(255) NOT NULL,
    subject text NOT NULL DEFAULT '',
    received_at timestamptz NOT NULL,
    attachment_name varchar(255) NOT NULL,
    status varchar(30) NOT NULL DEFAULT 'PROCESSING'
        CHECK (status IN ('PROCESSING', 'PROCESSED', 'REJECTED', 'SKIPPED', 'ERROR')),
    error_message text,
    rejection_reason text,
    invoice_id uuid REFERENCES invoices(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (provider_message_id, provider_attachment_id)
);

CREATE INDEX idx_ingestion_messages_status ON ingestion_messages (status, received_at);

CREATE TABLE dian_batches (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    file_name varchar(255) NOT NULL,
    period_year smallint,
    period_month smallint CHECK (period_month IS NULL OR period_month BETWEEN 1 AND 12),
    uploaded_by_user_id uuid NOT NULL REFERENCES app_users(id),
    uploaded_at timestamptz NOT NULL DEFAULT now(),
    total_rows integer NOT NULL DEFAULT 0,
    notes text
);

CREATE TABLE dian_rows (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id uuid NOT NULL REFERENCES dian_batches(id) ON DELETE CASCADE,
    row_number integer NOT NULL,
    document_type varchar(80),
    cufe varchar(150),
    cude varchar(150),
    prefix varchar(40) NOT NULL DEFAULT '',
    folio varchar(80) NOT NULL,
    supplier_nit varchar(30),
    supplier_name varchar(255),
    recipient_nit varchar(30),
    recipient_name varchar(255),
    total numeric(18,2),
    issue_date date,
    received_at timestamptz,
    dian_state varchar(120),
    dian_group varchar(120),
    reconciliation_result varchar(35) NOT NULL DEFAULT 'PENDIENTE'
        CHECK (reconciliation_result IN ('PENDIENTE', 'YA_RADICADA', 'FALTANTE', 'NIT_INVALIDO', 'REVISION_ESPECIAL', 'RADICADA_DESDE_DIAN')),
    match_method varchar(30),
    matched_invoice_id uuid REFERENCES invoices(id),
    xml_request_id uuid,
    authorized_by_user_id uuid REFERENCES app_users(id),
    authorized_at timestamptz,
    UNIQUE (batch_id, row_number)
);

CREATE INDEX idx_dian_rows_cufe ON dian_rows (cufe);
CREATE INDEX idx_dian_rows_result ON dian_rows (reconciliation_result);
CREATE INDEX idx_dian_rows_invoice ON dian_rows (matched_invoice_id);

CREATE TABLE dian_xml_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    dian_row_id uuid REFERENCES dian_rows(id) ON DELETE SET NULL,
    cufe varchar(150) NOT NULL,
    requested_by_user_id uuid NOT NULL REFERENCES app_users(id),
    requested_at timestamptz NOT NULL DEFAULT now(),
    status varchar(30) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'SUCCESS', 'ERROR', 'NOT_AVAILABLE')),
    response_at timestamptz,
    provider_reference varchar(255),
    error_message text,
    xml_file_id uuid REFERENCES document_files(id)
);

CREATE INDEX idx_dian_xml_requests_cufe ON dian_xml_requests (cufe, requested_at);

CREATE TABLE audit_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_user_id uuid REFERENCES app_users(id),
    entity_type varchar(60) NOT NULL,
    entity_id uuid,
    action_code varchar(80) NOT NULL,
    data jsonb NOT NULL DEFAULT '{}'::jsonb,
    ip_address inet,
    user_agent text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_log_entity ON audit_log (entity_type, entity_id, created_at);
CREATE INDEX idx_audit_log_actor ON audit_log (actor_user_id, created_at);

-- Catálogos iniciales del demo. TI debe asociar los IDs de usuario corporativos.
INSERT INTO app_roles (code, name, description) VALUES
    ('ADMINISTRADOR', 'Administrador', 'Consulta global, configuración y reinicio controlado del demo'),
    ('RADICADOR', 'Radicador', 'Revisa recepción, NIT y asigna al aprobador'),
    ('APROBADOR', 'Aprobador', 'Completa área/centro de costos y decide la ruta'),
    ('CONTABILIDAD', 'Contabilidad', 'Revisa soportes y registra la causación'),
    ('RECHAZOS_DIAN_MANUALES', 'Rechazos manuales DIAN', 'Gestiona manualmente el rechazo y adjunta certificado'),
    ('TESORERIA', 'Tesorería', 'Registra el pago, adjunta comprobante y archiva'),
    ('LEGALIZACIONES', 'Legalizaciones', 'Confirma el documento de legalización y archiva')
ON CONFLICT (code) DO NOTHING;

INSERT INTO areas (code, name) VALUES
    ('TIC', 'TIC'),
    ('COMPRAS', 'Compras'),
    ('CONTABILIDAD', 'Contabilidad'),
    ('GESTION_DOCUMENTAL', 'Gestión documental'),
    ('TESORERIA', 'Tesorería'),
    ('RECHAZOS_DIAN', 'Rechazos manuales DIAN'),
    ('LEGALIZACIONES', 'Legalizaciones')
ON CONFLICT (code) DO NOTHING;

INSERT INTO cost_centers (code, name) VALUES
    ('CC1', 'Centro de costos 1'),
    ('CC2', 'Centro de costos 2'),
    ('CC3', 'Centro de costos 3'),
    ('CC4', 'Centro de costos 4'),
    ('CC5', 'Centro de costos 5'),
    ('CC6', 'Centro de costos 6'),
    ('TIC', 'TIC'),
    ('CONTABILIDAD', 'Contabilidad'),
    ('TESORERIA', 'Tesorería'),
    ('SISTEMAS', 'Sistemas'),
    ('OFICINA_EEUU', 'Oficina EEUU'),
    ('OFICINA_UK', 'Oficina UK'),
    ('BENEFICIO', 'Beneficio'),
    ('PRODUCCION', 'Producción')
ON CONFLICT (code) DO NOTHING;

