import { and, eq } from "drizzle-orm";
import { roleAssignments } from "@/auth";
import { getDb } from "@/db";
import { requireApiUser } from "@/lib/api-auth";
import type { AppRole } from "@/lib/api-auth";
import { invoiceFiles, invoiceRecords } from "@/db/schema";

const workflowFieldsByRole: Record<AppRole, Set<string>> = {
  Administrador: new Set([
    "stage", "currentRole", "assignedTo", "area", "costCenter", "relatedDocumentReference",
    "documentReason", "documentType", "sourceSubject", "documentReference", "routingHint",
    "description", "paymentTerm", "internalReturnReason", "accountingReturnReason",
    "treasuryReturnReason", "rejectionReason", "legalizationDocument", "causationDocument",
    "returnReasonCategory", "comments", "lastMovement",
  ]),
  Radicador: new Set([
    "stage", "currentRole", "assignedTo", "internalReturnReason", "returnReasonCategory", "comments",
    "lastMovement",
  ]),
  Aprobador: new Set([
    "stage", "currentRole", "area", "costCenter", "relatedDocumentReference",
    "documentReason", "internalReturnReason", "rejectionReason", "returnReasonCategory", "comments",
    "lastMovement",
  ]),
  Contabilidad: new Set([
    "stage", "currentRole", "relatedDocumentReference", "documentReason",
    "accountingReturnReason", "rejectionReason", "causationDocument", "returnReasonCategory", "comments",
    "lastMovement",
  ]),
  Tesorería: new Set([
    "stage", "currentRole", "treasuryReturnReason", "returnReasonCategory", "comments", "lastMovement",
  ]),
  Legalizaciones: new Set([
    "stage", "assignedTo", "legalizationDocument", "comments", "lastMovement",
  ]),
  "Rechazos DIAN manuales": new Set([
    "stage", "comments", "lastMovement",
  ]),
};

const validRoles = new Set<AppRole>([
  "Administrador", "Radicador", "Aprobador", "Contabilidad", "Rechazos DIAN manuales", "Tesorería", "Legalizaciones",
]);
const validStages = new Set(["Nueva", "En revisión", "Devuelta", "Por rechazar", "En pago", "Archivada"]);
const validReturnCategories = new Set([
  "Falta de documentos o soportes", "Mala asignación", "Datos incompletos o incorrectos",
  "Centro de costos o área", "Corrección solicitada al proveedor", "Diferencia de valor o concepto", "Otro",
]);
const allowedTransitions: Record<AppRole, Set<AppRole>> = {
  Administrador: new Set(validRoles),
  Radicador: new Set(["Aprobador"]),
  Aprobador: new Set(["Radicador", "Contabilidad", "Rechazos DIAN manuales"]),
  Contabilidad: new Set(["Aprobador", "Tesorería", "Legalizaciones"]),
  Tesorería: new Set(["Contabilidad"]),
  Legalizaciones: new Set(),
  "Rechazos DIAN manuales": new Set(),
};
const stagesByRole: Record<AppRole, Set<string>> = {
  Administrador: validStages,
  Radicador: new Set(["Nueva", "Devuelta"]),
  Aprobador: new Set(["En revisión"]),
  Contabilidad: new Set(["En revisión"]),
  Tesorería: new Set(["En pago", "Archivada"]),
  Legalizaciones: new Set(["En revisión", "Archivada"]),
  "Rechazos DIAN manuales": new Set(["Por rechazar", "Archivada"]),
};

function parseHistory(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ invoiceId: string }> },
) {
  const user = await requireApiUser(undefined, request);
  if (user instanceof Response) return user;

  try {
    const { invoiceId } = await params;
    const payload = (await request.json()) as { updates?: Record<string, unknown> };
    const updates = payload.updates;
    if (!updates || typeof updates !== "object" || Array.isArray(updates)) {
      return Response.json({ error: "Actualización inválida." }, { status: 400 });
    }
    if (Object.keys(updates).some((field) => !workflowFieldsByRole[user.role].has(field))) {
      return Response.json({ error: "La actualización incluye campos no permitidos." }, { status: 400 });
    }

    const db = getDb();
    const [invoice] = await db.select().from(invoiceRecords).where(eq(invoiceRecords.id, invoiceId)).limit(1);
    if (!invoice) return Response.json({ error: "Factura no encontrada." }, { status: 404 });
    if (user.role !== "Administrador" && invoice.currentRole !== user.role) {
      return Response.json({ error: "Esta factura no está en tu bandeja." }, { status: 403 });
    }
    if (user.role === "Aprobador" && invoice.assignedTo?.toLowerCase() !== user.email.toLowerCase()) {
      return Response.json({ error: "Esta factura está asignada a otro aprobador." }, { status: 403 });
    }

    const targetRole = typeof updates.currentRole === "string" ? updates.currentRole : invoice.currentRole;
    const targetStage = typeof updates.stage === "string" ? updates.stage : invoice.stage;
    if (!validRoles.has(targetRole as AppRole) || !validStages.has(targetStage)) {
      return Response.json({ error: "La bandeja o el estado solicitado no es válido." }, { status: 400 });
    }
    if (targetRole !== invoice.currentRole && !allowedTransitions[user.role].has(targetRole as AppRole)) {
      return Response.json({ error: "La transición entre bandejas no está permitida para tu rol." }, { status: 403 });
    }
    if (!stagesByRole[targetRole as AppRole].has(targetStage)) {
      return Response.json({ error: "El estado no corresponde a la bandeja seleccionada." }, { status: 400 });
    }

    const now = new Date().toISOString();
    const {
      comments: requestedComments,
      lastMovement: requestedMovement,
      returnReasonCategory: requestedReturnCategory,
      ...stateUpdates
    } = updates;
    const requestedAssignee = typeof updates.assignedTo === "string" ? updates.assignedTo.trim().toLowerCase() : "";
    const priorVisits = Array.isArray(invoice.workflowState.workflowVisits)
      ? invoice.workflowState.workflowVisits.filter((visit): visit is Record<string, unknown> => Boolean(visit) && typeof visit === "object")
      : [];
    const previousApprover = [...priorVisits].reverse().find((visit) => visit.role === "Aprobador");
    const previousApproverEmail = typeof previousApprover?.user === "string" ? previousApprover.user.toLowerCase() : "";
    let assignedTo = invoice.assignedTo;
    if (targetRole !== invoice.currentRole) {
      assignedTo = null;
      if (targetRole === "Aprobador") {
        const approverEmail = requestedAssignee || previousApproverEmail;
        if (roleAssignments()[approverEmail] !== "Aprobador") {
          return Response.json({ error: "Selecciona un aprobador corporativo configurado." }, { status: 400 });
        }
        assignedTo = approverEmail;
      }
    }
    if (user.role === "Administrador" && targetRole === "Aprobador" && requestedAssignee) {
      if (roleAssignments()[requestedAssignee] !== "Aprobador") {
        return Response.json({ error: "La asignación debe corresponder a un aprobador configurado." }, { status: 400 });
      }
      assignedTo = requestedAssignee;
    }
    if (updates.assignedTo !== undefined && targetRole !== "Aprobador" && targetRole === invoice.currentRole) {
      return Response.json({ error: "La asignación solo puede cambiar al asignar un Aprobador." }, { status: 400 });
    }
    if (invoice.currentRole === "Radicador" && targetRole === "Aprobador" && invoice.recipientNit.replace(/\D/g, "").slice(0, 9) !== "901373083") {
      return Response.json({ error: "No se puede radicar: el NIT destinatario no coincide." }, { status: 400 });
    }

    const previousState = invoice.workflowState;
    const workflowState = { ...previousState, ...stateUpdates };
    const movement = typeof requestedMovement === "string" ? requestedMovement.trim().slice(0, 1000) : "Actualización del expediente";
    const moved = targetRole !== invoice.currentRole || targetStage !== invoice.stage;
    const existingVisits = priorVisits;
    let workflowVisits = existingVisits;
    if (moved) {
      const visits = [...existingVisits];
      let openVisit = visits[visits.length - 1];
      if (!openVisit || typeof openVisit.endedAt === "string") {
        openVisit = {
          role: invoice.currentRole,
          user: invoice.assignedTo ?? "Sin asignar",
          startedAt: previousState.stageEnteredAt ?? invoice.receivedAt,
        };
        visits.push(openVisit);
      }
      if (openVisit && typeof openVisit.endedAt !== "string") {
        const startedAt = typeof openVisit.startedAt === "string" ? new Date(openVisit.startedAt).getTime() : Date.now();
        visits[visits.length - 1] = {
          ...openVisit,
          endedAt: now,
          durationSeconds: Math.max(0, Math.floor((Date.now() - startedAt) / 1000)),
        };
      }
      if (targetStage !== "Archivada") {
        visits.push({
          role: targetRole,
          user: targetRole === "Aprobador" ? assignedTo ?? "Sin asignar" : "Sin asignar",
          startedAt: now,
        });
      }
      workflowVisits = visits;
    }
    const currentComments = Array.isArray(previousState.comments)
      ? previousState.comments.filter((comment): comment is Record<string, unknown> => Boolean(comment) && typeof comment === "object")
      : [];
    const existingCommentIds = new Set(currentComments.map((comment) => comment.id));
    const newComments = Array.isArray(requestedComments)
      ? requestedComments
          .filter((comment): comment is Record<string, unknown> => Boolean(comment) && typeof comment === "object")
          .filter((comment) => !existingCommentIds.has(comment.id) && typeof comment.text === "string" && comment.text.trim())
          .slice(0, 20)
          .map((comment) => ({
            id: crypto.randomUUID(),
            author: user.name,
            role: user.role,
            text: (comment.text as string).trim().slice(0, 5000),
            date: now,
          }))
      : [];
    const comments = [...newComments, ...currentComments].slice(0, 500);
    const history = [
      `${now} · ${user.name} (${user.role}) · ${movement}`,
      ...parseHistory(invoice.history),
    ].slice(0, 2000);
    Object.assign(workflowState, {
      comments,
      workflowVisits,
      lastMovement: movement,
      ...(moved ? { stageEnteredAt: now } : {}),
    });

    const returnRoute =
      (invoice.currentRole === "Aprobador" && (targetRole === "Radicador" || targetRole === "Rechazos DIAN manuales")) ||
      (invoice.currentRole === "Contabilidad" && targetRole === "Aprobador") ||
      (invoice.currentRole === "Tesorería" && targetRole === "Contabilidad");
    if (returnRoute) {
      const category = typeof requestedReturnCategory === "string" ? requestedReturnCategory.trim() : "";
      const detail = String(
        stateUpdates.internalReturnReason ?? stateUpdates.accountingReturnReason ??
        stateUpdates.treasuryReturnReason ?? stateUpdates.rejectionReason ?? "",
      ).trim();
      if (!validReturnCategories.has(category) || !detail) {
        return Response.json({ error: "La devolución requiere categoría y motivo." }, { status: 400 });
      }
      const returnEvents = Array.isArray(previousState.returnEvents)
        ? previousState.returnEvents.filter((event): event is Record<string, unknown> => Boolean(event) && typeof event === "object")
        : [];
      workflowState.returnEvents = [
        ...returnEvents,
        { category, detail: detail.slice(0, 5000), route: targetRole, at: now, user: user.email, role: user.role },
      ].slice(-500);
    }

    if (targetRole === "Tesorería" && !String(workflowState.causationDocument ?? "").trim()) {
      return Response.json({ error: "Registra la causación antes de enviar a Tesorería." }, { status: 400 });
    }
    if (targetStage === "Archivada" && targetRole === "Tesorería") {
      const proofId = workflowState.paymentProof;
      const [proof] = typeof proofId === "string"
        ? await db.select().from(invoiceFiles).where(eq(invoiceFiles.id, proofId)).limit(1)
        : [];
      if (!proof || proof.invoiceId !== invoice.id || proof.fileKind !== "payment_proof") {
        return Response.json({ error: "Adjunta el comprobante de pago antes de archivar." }, { status: 400 });
      }
    }
    if (targetStage === "Archivada" && targetRole === "Rechazos DIAN manuales") {
      const certificateId = workflowState.rejectionCertificate;
      const [certificate] = typeof certificateId === "string"
        ? await db.select().from(invoiceFiles).where(eq(invoiceFiles.id, certificateId)).limit(1)
        : [];
      if (!certificate || certificate.invoiceId !== invoice.id || certificate.fileKind !== "rejection_certificate") {
        return Response.json({ error: "Adjunta el certificado de rechazo antes de archivar." }, { status: 400 });
      }
    }
    if (targetStage === "Archivada" && targetRole === "Legalizaciones" && !String(workflowState.legalizationDocument ?? "").trim()) {
      return Response.json({ error: "Registra el documento de legalización antes de archivar." }, { status: 400 });
    }

    const [updated] = await db.update(invoiceRecords)
      .set({
        stage: targetStage,
        currentRole: targetRole,
        assignedTo,
        area: typeof updates.area === "string" ? updates.area : invoice.area,
        costCenter: typeof updates.costCenter === "string" ? updates.costCenter : invoice.costCenter,
        relatedDocumentReference: typeof updates.relatedDocumentReference === "string" ? updates.relatedDocumentReference : invoice.relatedDocumentReference,
        documentReason: typeof updates.documentReason === "string" ? updates.documentReason : invoice.documentReason,
        workflowState,
        history: JSON.stringify(history),
        updatedAt: now,
      })
      .where(and(eq(invoiceRecords.id, invoiceId), eq(invoiceRecords.updatedAt, invoice.updatedAt)))
      .returning({ id: invoiceRecords.id });

    if (!updated) return Response.json({ error: "El expediente cambió en otra sesión. Actualiza la bandeja e inténtalo de nuevo." }, { status: 409 });

    return Response.json({ id: updated.id, workflowState, history });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No fue posible actualizar la factura.";
    return Response.json({ error: message }, { status: 400 });
  }
}