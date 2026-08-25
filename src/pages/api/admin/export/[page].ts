/*
 * Admin CSV exports backed by the real D1 query layer. Every request has an
 * in-route admin-read gate as defence in depth, while the audit export has an
 * additional full-admin gate because it contains privileged action history.
 */
import type { APIContext } from "astro";
import { getDb } from "../../../../db/client";
import { listAudit, describeAudit } from "../../../../lib/admin/audit";
import {
  listFeedback,
  listInvoices,
  listLedger,
  listProjects,
  listUsers,
  type UserSegment,
  type UserSort,
} from "../../../../lib/admin/queries";
import { requireAdmin, requireAdminRead } from "../../../../lib/auth/admin-guard";
import { apiError } from "../../../../lib/auth/guards";

export const prerender = false;

type CsvField = string | number | null;

/**
 * Serialize RFC 4180 CSV, including a formula-injection guard for spreadsheet
 * applications. User-supplied names, email addresses, and feedback can begin
 * with =, +, -, @, TAB, or CR; prefixing those fields with a single quote keeps
 * Excel from interpreting them as formulas when the export is opened.
 */
function toCsv(headers: string[], rows: CsvField[][]): string {
  const encode = (value: CsvField): string => {
    if (value === null || value === undefined) return "";

    let field = String(value);
    if (/^[=+\-@\t\r]/.test(field)) field = `'${field}`;

    if (/[\",\n\r]/.test(field)) return `"${field.replace(/"/g, '""')}"`;
    return field;
  };

  return `\uFEFF${[headers, ...rows].map((row) => row.map(encode).join(",")).join("\r\n")}`;
}

function isoDate(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function userSegment(value: string | null): UserSegment | undefined {
  if (
    value === "all" ||
    value === "pro" ||
    value === "free" ||
    value === "power" ||
    value === "low_credits" ||
    value === "admins"
  ) {
    return value;
  }
  return undefined;
}

function userSort(value: string | null): UserSort | undefined {
  if (value === "doodles" || value === "credits" || value === "newest") return value;
  return undefined;
}

export async function GET(context: APIContext): Promise<Response> {
  const result = await requireAdminRead(context);
  if (result instanceof Response) return result;

  const page = context.params.page;
  const url = new URL(context.request.url);
  const db = getDb(context);

  let headers: string[];
  let rows: CsvField[][];

  switch (page) {
    case "users": {
      const users = await listUsers(db, {
        segment: userSegment(url.searchParams.get("segment")),
        sort: userSort(url.searchParams.get("sort")),
        q: url.searchParams.get("q") ?? undefined,
        limit: 5000,
      });
      headers = [
        "id",
        "name",
        "email",
        "image",
        "platformRole",
        "createdAt",
        "plan",
        "doodles",
        "projects",
        "credits",
        "lastSeen",
        "topSkill",
      ];
      rows = users.rows.map((user) => [
        user.id,
        user.name,
        user.email,
        user.image,
        user.platformRole,
        isoDate(user.createdAt),
        user.plan,
        user.doodles,
        user.projects,
        user.credits,
        isoDate(user.lastSeen),
        user.topSkill,
      ]);
      break;
    }

    case "projects": {
      const projects = await listProjects(db, 5000, 0);
      headers = [
        "id",
        "name",
        "status",
        "ownerName",
        "ownerEmail",
        "orgName",
        "type",
        "doodles",
        "assets",
        "createdAt",
      ];
      rows = projects.map((project) => [
        project.id,
        project.name,
        project.status,
        project.ownerName,
        project.ownerEmail,
        project.orgName,
        project.type,
        project.doodles,
        project.assets,
        isoDate(project.createdAt),
      ]);
      break;
    }

    case "credits": {
      const ledger = await listLedger(db, 5000, 0);
      headers = ["id", "delta", "reason", "balanceAfter", "createdAt", "actorName", "actorEmail", "orgName"];
      rows = ledger.map((entry) => [
        entry.id,
        entry.delta,
        entry.reason,
        entry.balanceAfter,
        isoDate(entry.createdAt),
        entry.actorName,
        entry.actorEmail,
        entry.orgName,
      ]);
      break;
    }

    case "billing": {
      const invoices = await listInvoices(db, 5000, 0);
      headers = [
        "id",
        "customerName",
        "customerEmail",
        "packId",
        "credits",
        "amountCents",
        "currency",
        "status",
        "createdAt",
      ];
      rows = invoices.map((invoice) => [
        invoice.id,
        invoice.customerName,
        invoice.customerEmail,
        invoice.packId,
        invoice.credits,
        invoice.amountCents,
        invoice.currency,
        invoice.status,
        isoDate(invoice.createdAt),
      ]);
      break;
    }

    case "feedback": {
      const feedback = await listFeedback(db, {
        status: url.searchParams.get("status") ?? undefined,
        limit: 5000,
      });
      headers = [
        "id",
        "text",
        "status",
        "createdAt",
        "triagedAt",
        "userName",
        "userEmail",
        "userImage",
        "orgName",
        "triagedByName",
      ];
      rows = feedback.rows.map((entry) => [
        entry.id,
        entry.text,
        entry.status,
        isoDate(entry.createdAt),
        isoDate(entry.triagedAt),
        entry.userName,
        entry.userEmail,
        entry.userImage,
        entry.orgName,
        entry.triagedByName,
      ]);
      break;
    }

    case "audit": {
      // Audit records include privileged actions such as credit grants, so a
      // support reader may view admin pages but must not download this export.
      const adminResult = await requireAdmin(context);
      if (adminResult instanceof Response) return adminResult;

      const audit = await listAudit(db, 5000, 0);
      headers = [
        "id",
        "action",
        "description",
        "targetType",
        "targetId",
        "detail",
        "ipAddress",
        "createdAt",
        "actorName",
        "actorEmail",
      ];
      rows = audit.map((entry) => [
        entry.id,
        entry.action,
        describeAudit(entry),
        entry.targetType,
        entry.targetId,
        entry.detail === null ? null : JSON.stringify(entry.detail),
        entry.ipAddress,
        isoDate(entry.createdAt),
        entry.actorName,
        entry.actorEmail,
      ]);
      break;
    }

    default:
      return apiError("unknown_export", "That admin export does not exist.", 404);
  }

  const date = new Date().toISOString().slice(0, 10);
  const csv = toCsv(headers, rows);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="doodleai-${page}-${date}.csv"`,
      // These files contain full customer tables and must not be cached by an
      // intermediary or retained in a browser cache.
      "Cache-Control": "no-store",
    },
  });
}
