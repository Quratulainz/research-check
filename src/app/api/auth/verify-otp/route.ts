import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const { email, code } = await req.json();

    if (!email || !code) {
      return NextResponse.json({ error: "Email and code are required." }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    if (user.verificationCode !== code) {
      return NextResponse.json({ error: "Invalid verification code." }, { status: 400 });
    }

    await prisma.user.update({
      where: { email },
      data: {
        isVerified: true,
        verificationCode: null,
        verificationExpires: null,
      },
    });

    return NextResponse.json({ success: true, message: "Email verified successfully." });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to verify code." }, { status: 500 });
  }
}