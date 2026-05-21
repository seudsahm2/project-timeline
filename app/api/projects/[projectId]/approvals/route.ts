import { NextResponse } from "next/server";
import { createApprovalComment, ensureUserProfile } from "@/lib/data";
import { getSessionFromRequest } from "@/lib/session";

type Params = {
  params: Promise<{ projectId: string }>;
};

export async function POST(request: Request, context: Params) {
  const session = await getSessionFromRequest(request);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureUserProfile(session.user.id, session.user.email);
  const { projectId } = await context.params;
  const body = (await request.json()) as {
    comment?: string;
    approved?: boolean;
  };

  const comment = (body.comment || "").trim();
  if (!comment) {
    return NextResponse.json({ error: "Comment is required" }, { status: 400 });
  }

  const ok = await createApprovalComment(projectId, session.user.id, {
    comment,
    approved: Boolean(body.approved),
  });

  if (!ok) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
