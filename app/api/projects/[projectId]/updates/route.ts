import { NextResponse } from "next/server";
import { createDailyUpdate, ensureUserProfile } from "@/lib/data";
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
    status?: string;
    updateText?: string;
    blockers?: string;
  };

  if (!body.status || !body.updateText) {
    return NextResponse.json(
      { error: "Status and update text are required" },
      { status: 400 },
    );
  }

  const ok = await createDailyUpdate(projectId, session.user.id, {
    status: body.status,
    updateText: body.updateText,
    blockers: body.blockers || "",
  });

  if (!ok) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
