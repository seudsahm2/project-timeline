import { NextResponse } from "next/server";
import {
  createProjectForUser,
  ensureUserProfile,
  listProjectsForUser,
} from "@/lib/data";
import { getSessionFromRequest } from "@/lib/session";

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureUserProfile(session.user.id, session.user.email);
  const projects = await listProjectsForUser(session.user.id);
  return NextResponse.json({ projects });
}

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureUserProfile(session.user.id, session.user.email);

  const body = (await request.json()) as {
    name?: string;
    description?: string;
    githubOwner?: string;
    githubRepo?: string;
    githubBranch?: string;
  };

  const name = (body.name || "").trim();
  if (!name) {
    return NextResponse.json(
      { error: "Project name is required" },
      { status: 400 },
    );
  }

  const projectId = await createProjectForUser(session.user.id, {
    name,
    description: body.description?.trim(),
    githubOwner: body.githubOwner?.trim(),
    githubRepo: body.githubRepo?.trim(),
    githubBranch: body.githubBranch?.trim() || "main",
  });

  return NextResponse.json({ projectId }, { status: 201 });
}
