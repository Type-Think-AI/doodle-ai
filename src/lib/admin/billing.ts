/**
 * Admin billing queries — ledger, invoices, credit totals, orgs, subscriptions.
 */
import { and, count, desc, eq, gte, lt, sql, sum } from "drizzle-orm";
import type { Db } from "../../db/client";
import { member, organization, user } from "../../db/schema/auth";
import {
  creditBalanceOrg,
  creditLedger,
  orgLimits,
  purchase,
  subscription,
} from "../../db/schema/billing";
import { generation, project } from "../../db/schema/product";
import { num } from "./shared";

/* ------------------------------------------------------------------ *
 * Credits
 * ------------------------------------------------------------------ */

export interface AdminLedgerRow {
  id: string;
  delta: number;
  reason: string;
  balanceAfter: number;
  createdAt: Date;
  actorName: string;
  actorEmail: string;
  orgName: string | null;
}

export async function listLedger(
  db: Db,
  limit = 50,
  offset = 0,
  q?: string,
): Promise<AdminLedgerRow[]> {
  const filters = [];
  if (q) {
    const like = `%${q.toLowerCase()}%`;
    filters.push(sql`(LOWER(${user.name}) LIKE ${like} OR LOWER(${user.email}) LIKE ${like})`);
  }

  const rows = await db
    .select({
      id: creditLedger.id,
      delta: creditLedger.delta,
      reason: creditLedger.reason,
      balanceAfter: creditLedger.balanceAfter,
      createdAt: creditLedger.createdAt,
      actorName: user.name,
      actorEmail: user.email,
      orgName: organization.name,
    })
    .from(creditLedger)
    .innerJoin(user, eq(creditLedger.userId, user.id))
    .leftJoin(organization, eq(creditLedger.organizationId, organization.id))
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(desc(creditLedger.createdAt))
    .limit(limit)
    .offset(offset);

  return rows.map((r) => ({ ...r, orgName: r.orgName ?? null }));
}

export interface CreditTotals {
  issued: number;
  used: number;
  outstanding: number;
  utilisationPct: number;
}

export async function getCreditTotals(db: Db): Promise<CreditTotals> {
  const [issuedRows, usedRows, balanceRows] = await db.batch([
    db.select({ total: sum(creditLedger.delta) }).from(creditLedger).where(gte(creditLedger.delta, 1)),
    db.select({ total: sum(creditLedger.delta) }).from(creditLedger).where(lt(creditLedger.delta, 0)),
    db.select({ total: sum(creditBalanceOrg.balance) }).from(creditBalanceOrg),
  ]);

  const issued = num(issuedRows[0]?.total);
  const used = Math.abs(num(usedRows[0]?.total));

  return {
    issued,
    used,
    outstanding: num(balanceRows[0]?.total),
    utilisationPct: issued === 0 ? 0 : Math.round((used / issued) * 100),
  };
}

/** Resolve a user's personal org id — the pool an admin credit grant targets. */
export async function resolvePersonalOrgId(db: Db, userId: string): Promise<string | null> {
  const rows = await db
    .select({ id: organization.id })
    .from(member)
    .innerJoin(organization, eq(member.organizationId, organization.id))
    .where(and(eq(member.userId, userId), eq(organization.isPersonal, true)))
    .limit(1);
  return rows[0]?.id ?? null;
}

/* ------------------------------------------------------------------ *
 * Organizations
 * ------------------------------------------------------------------ */

export interface AdminOrgRow {
  id: string;
  name: string;
  slug: string;
  isPersonal: boolean;
  members: number;
  balance: number;
  projects: number;
  generations: number;
  monthlyCreditCap: number | null;
  createdAt: Date;
}

export async function listOrgs(db: Db, limit = 50, offset = 0): Promise<AdminOrgRow[]> {
  const members = sql<number>`(
    SELECT COUNT(*) FROM ${member} WHERE ${member.organizationId} = ${organization.id}
  )`;
  const projects = sql<number>`(
    SELECT COUNT(*) FROM ${project} WHERE ${project.organizationId} = ${organization.id}
  )`;
  const generations = sql<number>`(
    SELECT COUNT(*) FROM ${generation}
    WHERE ${generation.organizationId} = ${organization.id} AND ${generation.status} = 'ok'
  )`;

  const rows = await db
    .select({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      isPersonal: organization.isPersonal,
      createdAt: organization.createdAt,
      balance: creditBalanceOrg.balance,
      monthlyCreditCap: orgLimits.monthlyCreditCap,
      members: members.as("members"),
      projects: projects.as("projects"),
      generations: generations.as("generations"),
    })
    .from(organization)
    .leftJoin(creditBalanceOrg, eq(creditBalanceOrg.organizationId, organization.id))
    .leftJoin(orgLimits, eq(orgLimits.organizationId, organization.id))
    .orderBy(desc(organization.createdAt))
    .limit(limit)
    .offset(offset);

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    isPersonal: r.isPersonal,
    createdAt: r.createdAt,
    balance: num(r.balance),
    monthlyCreditCap: r.monthlyCreditCap ?? null,
    members: num(r.members),
    projects: num(r.projects),
    generations: num(r.generations),
  }));
}

/* ------------------------------------------------------------------ *
 * Invoices & Billing Totals
 * ------------------------------------------------------------------ */

export interface AdminInvoiceRow {
  id: string;
  customerName: string;
  customerEmail: string;
  packId: string;
  credits: number;
  amountCents: number;
  currency: string;
  status: string;
  createdAt: Date;
}

export async function listInvoices(db: Db, limit = 50, offset = 0): Promise<AdminInvoiceRow[]> {
  return db
    .select({
      id: purchase.id,
      customerName: user.name,
      customerEmail: user.email,
      packId: purchase.packId,
      credits: purchase.credits,
      amountCents: purchase.amountCents,
      currency: purchase.currency,
      status: purchase.status,
      createdAt: purchase.createdAt,
    })
    .from(purchase)
    .innerJoin(user, eq(purchase.userId, user.id))
    .orderBy(desc(purchase.createdAt))
    .limit(limit)
    .offset(offset);
}

export interface BillingTotals {
  payingSeats: number;
  newSeatsThisMonth: number;
  conversionPct: number;
  grossCents: number;
  paidCount: number;
  failedCount: number;
  refundedCount: number;
  committedMonthlyCredits: number;
}

export async function getBillingTotals(db: Db): Promise<BillingTotals> {
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [seatRows, newSeatRows, userRows, grossRows, paidRows, failedRows, refundedRows, creditRows] =
    await db.batch([
      db.select({ n: count() }).from(subscription).where(eq(subscription.status, "active")),
      db
        .select({ n: count() })
        .from(subscription)
        .where(and(eq(subscription.status, "active"), gte(subscription.currentPeriodEnd, monthAgo))),
      db.select({ n: count() }).from(user),
      db.select({ total: sum(purchase.amountCents) }).from(purchase).where(eq(purchase.status, "paid")),
      db.select({ n: count() }).from(purchase).where(eq(purchase.status, "paid")),
      db.select({ n: count() }).from(purchase).where(eq(purchase.status, "failed")),
      db.select({ n: count() }).from(purchase).where(eq(purchase.status, "refunded")),
      db
        .select({ total: sum(subscription.monthlyCredits) })
        .from(subscription)
        .where(eq(subscription.status, "active")),
    ]);

  const seats = num(seatRows[0]?.n);
  const users = num(userRows[0]?.n);

  return {
    payingSeats: seats,
    newSeatsThisMonth: num(newSeatRows[0]?.n),
    conversionPct: users === 0 ? 0 : Math.round((seats / users) * 1000) / 10,
    grossCents: num(grossRows[0]?.total),
    paidCount: num(paidRows[0]?.n),
    failedCount: num(failedRows[0]?.n),
    refundedCount: num(refundedRows[0]?.n),
    committedMonthlyCredits: num(creditRows[0]?.total),
  };
}
