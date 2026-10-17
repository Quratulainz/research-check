import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
export const runtime = "nodejs";
const STATUSES = ["SUBMITTED", "UNDER_REVIEW", "REVISION", "ACCEPTED", "PUBLISHED"] as const;
type Status = typeof STATUSES[number];
const str = (v: unknown) => typeof v === "string" ? v.trim() : "";
const validStatus = (v: unknown): v is Status => typeof v === "string" && STATUSES.includes(v as Status);
function dateValue(v: unknown): Date | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  if (typeof v !== "string") return undefined;
  const d = new Date(v); return Number.isNaN(d.getTime()) ? undefined : d;
}
export async function GET(req: NextRequest) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const status = req.nextUrl.searchParams.get("status");
  if (status && !validStatus(status)) return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  try {
    const submissions = await prisma.submission.findMany({
      where: { ownerEmail: s.email, ...(status ? { status } : {}) }, orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json({ submissions });
  } catch { return NextResponse.json({ error: "Could not load records." }, { status: 500 }); }
}
export async function POST(req: NextRequest) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const title = str(b.title), journal = str(b.journal), status = b.status ?? "SUBMITTED";
  if (!title || !journal) return NextResponse.json({ error: "title and journal are required." }, { status: 400 });
  if (!validStatus(status)) return NextResponse.json({ error: `status must be one of ${STATUSES.join(", ")}` }, { status: 400 });
  const submittedAt = dateValue(b.submittedAt);
  if (submittedAt === undefined) return NextResponse.json({ error: "Invalid submittedAt date." }, { status: 400 });
  try {
    const submission = await prisma.submission.create({ data: {
      title, journal, ownerEmail: s.email, status,
      manuscriptId: str(b.manuscriptId) || null, trackingUrl: str(b.trackingUrl) || null,
      notes: str(b.notes) || null, source: "USER_PROVIDED",
      submittedAt: submittedAt ?? new Date(), statusUpdatedAt: new Date(),
    }});
    return NextResponse.json({ submission }, { status: 201 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      return NextResponse.json({ error: "This manuscript ID already exists." }, { status: 409 });
    return NextResponse.json({ error: "Could not create record." }, { status: 500 });
  }
}
export async function PATCH(req: NextRequest) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const id = str(req.nextUrl.searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "Submission id is required." }, { status: 400 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const data: Prisma.SubmissionUpdateInput = {};
  for (const field of ["title", "journal", "manuscriptId", "trackingUrl", "notes"] as const) {
    if (b[field] === undefined) continue;
    const value = str(b[field]);
    if ((field === "title" || field === "journal") && !value)
      return NextResponse.json({ error: `${field} cannot be empty.` }, { status: 400 });
    if (field === "title") data.title = value;
    if (field === "journal") data.journal = value;
    if (field === "manuscriptId") data.manuscriptId = value || null;
    if (field === "trackingUrl") data.trackingUrl = value || null;
    if (field === "notes") data.notes = value || null;
  }
  if (b.status !== undefined) {
    if (!validStatus(b.status)) return NextResponse.json({ error: `status must be one of ${STATUSES.join(", ")}` }, { status: 400 });
    data.status = b.status; data.statusUpdatedAt = new Date();
  }
  try {
    const owned = await prisma.submission.findFirst({ where: { id, ownerEmail: s.email }, select: { id: true } });
    if (!owned) return NextResponse.json({ error: "Record not found." }, { status: 404 });
    return NextResponse.json({ submission: await prisma.submission.update({ where: { id }, data }) });
  } catch { return NextResponse.json({ error: "Could not update record." }, { status: 500 }); }
}
