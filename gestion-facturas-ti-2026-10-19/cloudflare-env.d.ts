declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    INVOICE_MAILBOX_ADDRESS?: string;
    GRAPH_TENANT_ID?: string;
    GRAPH_CLIENT_ID?: string;
    GRAPH_CLIENT_SECRET?: string;
  }
}
