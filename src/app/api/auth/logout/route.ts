import { NextResponse } from "next/server";
import { writeAudit } from "@/lib/audit";
import { getSession, SESSION_COOKIE } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST(request: Request) {
  const session = await getSession();
  if (session) {
    await writeAudit(db, {
      userId: session.userId,
      module: "AUTH",
      action: "LOGOUT",
      recordId: session.userId,
      request,
    }).catch(() => undefined);
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(0),
    maxAge: 0,
  });
  return response;
}
