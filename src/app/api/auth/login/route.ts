import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { createSession } from "@/lib/auth";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let b: any;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
  const password = typeof b.password === "string" ? b.password : "";
  if (!email || !password || email.length > 254 || password.length > 128)
    return NextResponse.json({ error: "Invalid email or password." }, { status: 400 });
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash)))
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    await createSession(user.id, user.email);
    return NextResponse.json({ user: { id: user.id, email: user.email } });
  } catch {
    console.error("Login failed.");
    return NextResponse.json({ error: "Login failed; check server configuration." }, { status: 500 });
  }
}
