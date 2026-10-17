import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { createSession } from "@/lib/auth";
import { Resend } from "resend";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    let b: any;
    try { 
      b = await req.json(); 
    } catch { 
      return NextResponse.json({ error: "Invalid JSON format." }, { status: 400 }); 
    }

    const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
    const password = typeof b.password === "string" ? b.password : "";

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }

    if (password.length < 12 || password.length > 128) {
      return NextResponse.json({ error: "Password must be 12–128 characters." }, { status: 400 });
    }

    const exists = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (exists) {
      return NextResponse.json({ error: "An account with this email already exists. Please log in." }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    
    // Generate 6-digit OTP code (Valid for 15 minutes)
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    const user = await prisma.user.create({
      data: { 
        email, 
        passwordHash,
        verificationCode: otpCode,
        verificationExpires: expiresAt
      },
      select: { id: true, email: true },
    });

    // Safe Resend Email Sending inside function block
    try {
      if (process.env.RESEND_API_KEY) {
        const resend = new Resend(process.env.RESEND_API_KEY);
        const emailResponse = await resend.emails.send({
          from: "ResearchCheck <onboarding@resend.dev>",
          to: email,
          subject: "Your ResearchCheck Verification Code",
          html: `
            <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px;">
              <h2 style="color: #2563eb; margin-top: 0;">Verify Your ResearchCheck Account</h2>
              <p>Thank you for signing up! Please use the 6-digit verification code below to verify your email address:</p>
              <div style="background: #f8fafc; padding: 20px; border-radius: 6px; font-size: 28px; font-weight: bold; letter-spacing: 6px; text-align: center; color: #1e293b; margin: 20px 0; border: 1px dashed #cbd5e1;">
                ${otpCode}
              </div>
              <p style="color: #64748b; font-size: 14px;">This code will expire in 15 minutes.</p>
            </div>
          `,
        });
        console.log("Resend Email Sent Successfully:", emailResponse);
      } else {
        console.log(`[FALLBACK OTP FOR ${email}]: ${otpCode}`);
      }
    } catch (emailErr) {
      console.error("Resend Email sending failed:", emailErr);
      console.log(`[FALLBACK OTP FOR ${email}]: ${otpCode}`);
    }

    await createSession(user.id, user.email);
    return NextResponse.json({ user, requiresVerification: true }, { status: 201 });

  } catch (err: any) {
    console.error("SIGNUP CRITICAL ERROR:", err);
    return NextResponse.json(
      { error: err?.message || "Internal server error during signup." },
      { status: 500 }
    );
  }
}