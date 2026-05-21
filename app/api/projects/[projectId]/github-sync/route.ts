import { NextResponse } from "next/server";
import { createGitHubSyncPlaceholder, ensureUserProfile } from "@/lib/data";
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
  const ok = await createGitHubSyncPlaceholder(projectId, session.user.id);

  if (!ok) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
