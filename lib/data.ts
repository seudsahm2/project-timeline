import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

const roadmap = [
  {
    week: "Week 1",
    title: "Project intake and scope lock",
    status: "Planning",
    progress: 15,
  },
  {
    week: "Week 2",
    title: "Plan generation and manual override",
    status: "In progress",
    progress: 32,
  },
  {
    week: "Week 3",
    title: "Daily progress and boss review",
    status: "In progress",
    progress: 56,
  },
  {
    week: "Week 4",
    title: "GitHub sync and reporting",
    status: "Queued",
    progress: 78,
  },
];

const defaultBossEmails = (process.env.BOSS_EMAILS || "")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

export type ProjectSummary = {
  id: string;
  name: string;
  status: string;
  overallProgress: number;
  selectedWeek: string;
  githubOwner: string | null;
  githubRepo: string | null;
  githubBranch: string | null;
  updatedAt: string;
};

export type ProjectDetails = ProjectSummary & {
  description: string | null;
  updates: {
    id: string;
    status: string;
    updateText: string;
    blockers: string;
    createdAt: string;
    authorName: string;
  }[];
  approvals: {
    id: string;
    comment: string;
    approved: boolean;
    createdAt: string;
    authorName: string;
  }[];
  activities: {
    id: string;
    source: string;
    message: string;
    createdAt: string;
  }[];
};

export async function ensureUserProfile(userId: string, email: string) {
  const isBoss = defaultBossEmails.includes(email.toLowerCase());

  return prisma.userProfile.upsert({
    where: { userId },
    update: isBoss ? { role: "BOSS" } : {},
    create: {
      userId,
      role: isBoss ? "BOSS" : "USER",
    },
  });
}

export async function listProjectsForUser(userId: string) {
  const projects = await prisma.project.findMany({
    where: {
      OR: [{ createdById: userId }, { members: { some: { userId } } }],
    },
    orderBy: { updatedAt: "desc" },
  });

  return projects.map((project) => ({
    id: project.id,
    name: project.name,
    status: project.status,
    overallProgress: project.overallProgress,
    selectedWeek: project.selectedWeek,
    githubOwner: project.githubOwner,
    githubRepo: project.githubRepo,
    githubBranch: project.githubBranch,
    updatedAt: project.updatedAt.toISOString(),
  })) satisfies ProjectSummary[];
}

function assertProjectAccess(projectId: string, userId: string) {
  return prisma.project.findFirst({
    where: {
      id: projectId,
      OR: [{ createdById: userId }, { members: { some: { userId } } }],
    },
  });
}

export async function getProjectForUser(projectId: string, userId: string) {
  const allowed = await assertProjectAccess(projectId, userId);
  if (!allowed) {
    return null;
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      updates: {
        orderBy: { createdAt: "desc" },
        include: { user: true },
        take: 20,
      },
      approvals: {
        orderBy: { createdAt: "desc" },
        include: { user: true },
        take: 20,
      },
      activities: {
        orderBy: { createdAt: "desc" },
        take: 20,
      },
    },
  });

  if (!project) {
    return null;
  }

  return {
    id: project.id,
    name: project.name,
    description: project.description,
    status: project.status,
    overallProgress: project.overallProgress,
    selectedWeek: project.selectedWeek,
    githubOwner: project.githubOwner,
    githubRepo: project.githubRepo,
    githubBranch: project.githubBranch,
    updatedAt: project.updatedAt.toISOString(),
    updates: project.updates.map((item) => ({
      id: item.id,
      status: item.status,
      updateText: item.updateText,
      blockers: item.blockers,
      createdAt: item.createdAt.toISOString(),
      authorName: item.user.name,
    })),
    approvals: project.approvals.map((item) => ({
      id: item.id,
      comment: item.comment,
      approved: item.approved,
      createdAt: item.createdAt.toISOString(),
      authorName: item.user.name,
    })),
    activities: project.activities.map((item) => ({
      id: item.id,
      source: item.source,
      message: item.message,
      createdAt: item.createdAt.toISOString(),
    })),
  } satisfies ProjectDetails;
}

export async function createProjectForUser(
  userId: string,
  input: {
    name: string;
    description?: string;
    githubOwner?: string;
    githubRepo?: string;
    githubBranch?: string;
  },
) {
  const created = await prisma.project.create({
    data: {
      name: input.name,
      description: input.description,
      githubOwner: input.githubOwner,
      githubRepo: input.githubRepo,
      githubBranch: input.githubBranch,
      createdById: userId,
      selectedWeek: roadmap[0].week,
      overallProgress: 0,
      activities: {
        create: {
          source: "system",
          message: `Project created: ${input.name}`,
        },
      },
      members: {
        create: {
          userId,
          role: "owner",
        },
      },
    },
  });

  return created.id;
}

export async function updateProjectForUser(
  projectId: string,
  userId: string,
  patch: {
    status?: string;
    overallProgress?: number;
    selectedWeek?: string;
    githubOwner?: string;
    githubRepo?: string;
    githubBranch?: string;
  },
) {
  const allowed = await assertProjectAccess(projectId, userId);
  if (!allowed) {
    return false;
  }

  const data: Prisma.ProjectUpdateInput = {};

  if (typeof patch.status === "string") {
    data.status = patch.status;
  }

  if (typeof patch.overallProgress === "number") {
    data.overallProgress = Math.max(0, Math.min(100, patch.overallProgress));
  }

  if (typeof patch.selectedWeek === "string") {
    data.selectedWeek = patch.selectedWeek;
  }

  if (typeof patch.githubOwner === "string") {
    data.githubOwner = patch.githubOwner;
  }

  if (typeof patch.githubRepo === "string") {
    data.githubRepo = patch.githubRepo;
  }

  if (typeof patch.githubBranch === "string") {
    data.githubBranch = patch.githubBranch;
  }

  await prisma.project.update({
    where: { id: projectId },
    data,
  });

  return true;
}

export async function createDailyUpdate(
  projectId: string,
  userId: string,
  input: { status: string; updateText: string; blockers: string },
) {
  const allowed = await assertProjectAccess(projectId, userId);
  if (!allowed) {
    return false;
  }

  await prisma.$transaction([
    prisma.dailyUpdate.create({
      data: {
        projectId,
        userId,
        status: input.status,
        updateText: input.updateText,
        blockers: input.blockers,
      },
    }),
    prisma.activityEvent.create({
      data: {
        projectId,
        source: "update",
        message: `Daily update posted: ${input.status}`,
      },
    }),
  ]);

  return true;
}

export async function createApprovalComment(
  projectId: string,
  userId: string,
  input: { comment: string; approved: boolean },
) {
  const allowed = await assertProjectAccess(projectId, userId);
  if (!allowed) {
    return false;
  }

  await prisma.$transaction([
    prisma.approvalComment.create({
      data: {
        projectId,
        userId,
        comment: input.comment,
        approved: input.approved,
      },
    }),
    prisma.activityEvent.create({
      data: {
        projectId,
        source: "boss",
        message: input.approved
          ? "Boss marked the update as approved"
          : "Boss requested changes",
      },
    }),
  ]);

  return true;
}

export async function createGitHubSyncPlaceholder(
  projectId: string,
  userId: string,
) {
  const allowed = await assertProjectAccess(projectId, userId);
  if (!allowed) {
    return false;
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      githubOwner: true,
      githubRepo: true,
      githubBranch: true,
    },
  });

  const repoLabel =
    project?.githubOwner && project?.githubRepo
      ? `${project.githubOwner}/${project.githubRepo}`
      : "(repo not set)";

  await prisma.activityEvent.create({
    data: {
      projectId,
      source: "github",
      message: `GitHub sync placeholder triggered for ${repoLabel} (${project?.githubBranch || "main"})`,
      metadata: JSON.stringify({
        owner: project?.githubOwner,
        repo: project?.githubRepo,
        branch: project?.githubBranch,
      }),
    },
  });

  return true;
}

export async function getBossProjects() {
  const projects = await prisma.project.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      updates: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { user: true },
      },
      approvals: {
        orderBy: { createdAt: "desc" },
        take: 3,
        include: { user: true },
      },
    },
  });

  return projects.map((project) => ({
    id: project.id,
    name: project.name,
    status: project.status,
    overallProgress: project.overallProgress,
    selectedWeek: project.selectedWeek,
    updatedAt: project.updatedAt.toISOString(),
    latestUpdate: project.updates[0]
      ? {
          status: project.updates[0].status,
          updateText: project.updates[0].updateText,
          blockers: project.updates[0].blockers,
          authorName: project.updates[0].user.name,
          createdAt: project.updates[0].createdAt.toISOString(),
        }
      : null,
    approvals: project.approvals.map((approval) => ({
      id: approval.id,
      comment: approval.comment,
      approved: approval.approved,
      authorName: approval.user.name,
      createdAt: approval.createdAt.toISOString(),
    })),
  }));
}
