import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendVerificationEmail(email: string, code: string) {
  try {
    await resend.emails.send({
      from: "ResearchCheck <onboarding@resend.dev>",
      to: email,
      subject: "Your ResearchCheck Verification Code",
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
          <h2 style="color: #2563eb;">Verify Your ResearchCheck Account</h2>
          <p>Thank you for registering! Please use the 6-digit code below to verify your email address:</p>
          <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; font-size: 24px; font-weight: bold; letter-spacing: 5px; text-align: center; width: 200px; margin: 20px 0; color: #1e293b;">
            ${code}
          </div>
          <p>This code will expire in 15 minutes.</p>
        </div>
      `,
    });
    return { success: true };
  } catch (error) {
    console.error("Failed to send email via Resend:", error);
    return { success: false, error };
  }
}