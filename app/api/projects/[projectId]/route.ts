import { NextResponse } from "next/server";
import {
  ensureUserProfile,
  getProjectForUser,
  updateProjectForUser,
} from "@/lib/data";
import { getSessionFromRequest } from "@/lib/session";

type Params = {
  params: Promise<{ projectId: string }>;
};

export async function GET(request: Request, context: Params) {
  const session = await getSessionFromRequest(request);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureUserProfile(session.user.id, session.user.email);
  const { projectId } = await context.params;
  const project = await getProjectForUser(projectId, session.user.id);

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  return NextResponse.json({ project });
}

export async function PATCH(request: Request, context: Params) {
  const session = await getSessionFromRequest(request);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureUserProfile(session.user.id, session.user.email);
  const { projectId } = await context.params;
  const body = (await request.json()) as {
    status?: string;
    overallProgress?: number;
    selectedWeek?: string;
    githubOwner?: string;
    githubRepo?: string;
    githubBranch?: string;
  };

  const ok = await updateProjectForUser(projectId, session.user.id, body);
  if (!ok) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
