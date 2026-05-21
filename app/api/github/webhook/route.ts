import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

function timingSafeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);

  if (left.length !== right.length) {
    return false;
  }

  return crypto.timingSafeEqual(left, right);
}

function verifySignature(rawBody: string, signature: string | null) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;

  if (!secret) {
    return true;
  }

  if (!signature?.startsWith("sha256=")) {
    return false;
  }

  const expected = `sha256=${crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex")}`;

  return timingSafeEqual(signature, expected);
}

async function findMatchingProject(repositoryFullName: string) {
  const [owner, repo] = repositoryFullName.split("/");

  if (!owner || !repo) {
    return null;
  }

  return prisma.project.findFirst({
    where: {
      githubOwner: owner,
      githubRepo: repo,
    },
    select: {
      id: true,
      name: true,
      githubBranch: true,
    },
  });
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");
  const deliveryId = request.headers.get("x-github-delivery") || "unknown";

  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const eventName = request.headers.get("x-github-event") || "unknown";
  const payload = rawBody
    ? (JSON.parse(rawBody) as Record<string, unknown>)
    : {};
  const repository = payload.repository as
    | { full_name?: string; html_url?: string }
    | undefined;

  if (!repository?.full_name) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const project = await findMatchingProject(repository.full_name);
  if (!project) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const message =
    eventName === "push"
      ? `GitHub push event received for ${repository.full_name}`
      : eventName === "pull_request"
        ? `Pull request event received for ${repository.full_name}`
        : eventName === "issues"
          ? `Issue event received for ${repository.full_name}`
          : `GitHub ${eventName} event received for ${repository.full_name}`;

  await prisma.activityEvent.create({
    data: {
      projectId: project.id,
      source: "github-webhook",
      kind: "webhook",
      syncKey: `github:webhook:${deliveryId}:${repository.full_name}:${eventName}`,
      message,
      payload: JSON.stringify({
        event: eventName,
        repository: repository.full_name,
        htmlUrl: repository.html_url,
        branch: project.githubBranch,
        deliveryId,
      }),
    },
  });

  return NextResponse.json({
    ok: true,
    projectId: project.id,
    event: eventName,
  });
}
