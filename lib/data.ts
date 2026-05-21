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

type GitHubCommit = {
  sha: string;
  html_url: string;
  commit: {
    message: string;
    author?: {
      name?: string;
      date?: string;
    };
  };
  author?: {
    login?: string;
  } | null;
};

type GitHubPullRequest = {
  id: number;
  number: number;
  state: string;
  title: string;
  html_url: string;
  created_at: string;
  updated_at: string;
  merged_at: string | null;
  user?: {
    login?: string;
  } | null;
};

type GitHubIssue = {
  id: number;
  number: number;
  state: string;
  title: string;
  html_url: string;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  user?: {
    login?: string;
  } | null;
  pull_request?: unknown;
};

type GitHubSyncSummary = {
  commits: number;
  pullRequests: number;
  issues: number;
  activities: number;
  weeklyOverview: WeeklyOverviewItem[];
  syncedAt: string;
};

type GitHubActivityPayload = {
  type: "commit" | "pull_request" | "issue";
  author?: string | null;
  title?: string;
  state?: string;
  sha?: string;
  number?: number;
  branch?: string | null;
  repository: string;
  message?: string;
};

const githubApiBaseUrl = "https://api.github.com";

function getGitHubHeaders() {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "project-timeline",
  };

  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  return headers;
}

async function fetchGitHubPage<T>(path: string) {
  const url = `${githubApiBaseUrl}${path}`;
  console.log(
    `[API] GET ${path.substring(0, 80)}... (token: ${process.env.GITHUB_TOKEN ? "yes" : "NO"})`,
  );

  const response = await fetch(url, {
    headers: getGitHubHeaders(),
    cache: "no-store",
  });

  console.log(
    `[API] Status: ${response.status} - X-RateLimit-Remaining: ${response.headers.get("X-RateLimit-Remaining")}`,
  );

  if (!response.ok) {
    const body = await response.text();
    console.error(`[API] Error body: ${body.substring(0, 200)}`);
    throw new Error(
      `GitHub API request failed for ${path}: ${response.status}`,
    );
  }

  const data = (await response.json()) as T[];
  console.log(`[API] Got ${data.length} items`);
  return data;
}

async function fetchGitHubCollection<T>(pathFactory: (page: number) => string) {
  const items: T[] = [];

  for (let page = 1; page <= 3; page += 1) {
    const path = pathFactory(page);
    console.log(`[COLLECTION] Page ${page}...`);
    const pageItems = await fetchGitHubPage<T>(path);
    items.push(...pageItems);

    if (pageItems.length < 100) {
      console.log(`[COLLECTION] Got ${pageItems.length} items; breaking early`);
      break;
    }
  }

  console.log(`[COLLECTION] Total: ${items.length} items`);
  return items;
}

function getProjectWeekNumber(projectCreatedAt: Date, activityDate: Date) {
  const diffInMs = activityDate.getTime() - projectCreatedAt.getTime();
  const diffInDays = Math.max(0, Math.floor(diffInMs / (1000 * 60 * 60 * 24)));
  return Math.floor(diffInDays / 7) + 1;
}

function formatWeekLabel(weekNumber: number) {
  return `Week ${weekNumber}`;
}

function buildWeeklyOverview(project: {
  createdAt: Date;
  updates: { createdAt: Date }[];
  approvals: { createdAt: Date }[];
  activities: {
    weekNumber: number | null;
    kind: string;
    createdAt: Date;
  }[];
}) {
  const weekNumbers = new Set<number>([1]);

  for (const item of project.updates) {
    weekNumbers.add(getProjectWeekNumber(project.createdAt, item.createdAt));
  }

  for (const item of project.approvals) {
    weekNumbers.add(getProjectWeekNumber(project.createdAt, item.createdAt));
  }

  for (const item of project.activities) {
    weekNumbers.add(
      item.weekNumber ??
        getProjectWeekNumber(project.createdAt, item.createdAt),
    );
  }

  const maxWeek = Math.max(4, ...Array.from(weekNumbers));

  return Array.from({ length: maxWeek }, (_, index) => {
    const weekNumber = index + 1;
    const updates = project.updates.filter(
      (item) =>
        getProjectWeekNumber(project.createdAt, item.createdAt) === weekNumber,
    ).length;
    const approvals = project.approvals.filter(
      (item) =>
        getProjectWeekNumber(project.createdAt, item.createdAt) === weekNumber,
    ).length;
    const weekActivities = project.activities.filter((item) => {
      const calculatedWeek =
        item.weekNumber ??
        getProjectWeekNumber(project.createdAt, item.createdAt);
      return calculatedWeek === weekNumber;
    });

    const commitCount = weekActivities.filter(
      (item) => item.kind === "commit",
    ).length;
    const pullRequestCount = weekActivities.filter(
      (item) => item.kind === "pull_request",
    ).length;
    const issueCount = weekActivities.filter(
      (item) => item.kind === "issue",
    ).length;
    const latestAt = weekActivities
      .map((item) => item.createdAt)
      .sort((a, b) => b.getTime() - a.getTime())[0];

    const totalActivities = weekActivities.length + updates + approvals;

    return {
      weekNumber,
      label: formatWeekLabel(weekNumber),
      commitCount,
      pullRequestCount,
      issueCount,
      dailyUpdateCount: updates,
      approvalCount: approvals,
      activityCount: totalActivities,
      latestAt: latestAt ? latestAt.toISOString() : null,
      summary: `${commitCount} commits, ${pullRequestCount} pull requests, ${issueCount} issues, ${updates} updates, ${approvals} approvals`,
    } satisfies WeeklyOverviewItem;
  });
}

export type ProjectSummary = {
  id: string;
  name: string;
  status: string;
  overallProgress: number;
  selectedWeek: string;
  createdById: string;
  githubOwner: string | null;
  githubRepo: string | null;
  githubBranch: string | null;
  githubSyncedAt: string | null;
  updatedAt: string;
};

export type WeeklyOverviewItem = {
  weekNumber: number;
  label: string;
  commitCount: number;
  pullRequestCount: number;
  issueCount: number;
  dailyUpdateCount: number;
  approvalCount: number;
  activityCount: number;
  latestAt: string | null;
  summary: string;
};

export type ProjectDetails = ProjectSummary & {
  description: string | null;
  githubSyncedAt: string | null;
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
    kind: string;
    weekNumber: number | null;
    source: string;
    message: string;
    referenceUrl: string | null;
    payload: string | null;
    createdAt: string;
  }[];
  weeklyOverview: WeeklyOverviewItem[];
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
    createdById: project.createdById,
    githubOwner: project.githubOwner,
    githubRepo: project.githubRepo,
    githubBranch: project.githubBranch,
    githubSyncedAt: project.githubSyncedAt?.toISOString() ?? null,
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

  const weeklyActivityRecords = await prisma.activityEvent.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
    select: {
      createdAt: true,
      weekNumber: true,
      kind: true,
    },
  });

  return {
    id: project.id,
    name: project.name,
    description: project.description,
    createdById: project.createdById,
    githubSyncedAt: project.githubSyncedAt?.toISOString() ?? null,
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
      kind: item.kind,
      weekNumber: item.weekNumber,
      source: item.source,
      message: item.message,
      referenceUrl: item.referenceUrl,
      payload: item.payload,
      createdAt: item.createdAt.toISOString(),
    })),
    weeklyOverview: buildWeeklyOverview({
      createdAt: project.createdAt,
      updates: project.updates.map((item) => ({ createdAt: item.createdAt })),
      approvals: project.approvals.map((item) => ({
        createdAt: item.createdAt,
      })),
      activities: weeklyActivityRecords.map((item) => ({
        weekNumber: item.weekNumber,
        kind: item.kind,
        createdAt: item.createdAt,
      })),
    }),
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

export async function deleteProjectForUser(projectId: string, userId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      createdById: true,
      name: true,
    },
  });

  if (!project) {
    return { ok: false, reason: "not_found" as const };
  }

  if (project.createdById !== userId) {
    return { ok: false, reason: "forbidden" as const };
  }

  await prisma.project.delete({
    where: { id: projectId },
  });

  return { ok: true, projectName: project.name };
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

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { createdAt: true },
  });

  const weekNumber = project
    ? getProjectWeekNumber(project.createdAt, new Date())
    : null;

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
        kind: "daily_update",
        weekNumber,
        message: `Daily update posted: ${input.status}`,
        payload: JSON.stringify({
          status: input.status,
          updateText: input.updateText,
          blockers: input.blockers,
        }),
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

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { createdAt: true },
  });

  const weekNumber = project
    ? getProjectWeekNumber(project.createdAt, new Date())
    : null;

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
        kind: "approval",
        weekNumber,
        message: input.approved
          ? "Boss marked the update as approved"
          : "Boss requested changes",
        payload: JSON.stringify({
          comment: input.comment,
          approved: input.approved,
        }),
      },
    }),
  ]);

  return true;
}

export async function syncGitHubProjectData(projectId: string, userId: string) {
  try {
    const allowed = await assertProjectAccess(projectId, userId);
    if (!allowed) {
      console.error(`[SYNC] Access denied for project ${projectId}`);
      return false;
    }

    if (!process.env.GITHUB_TOKEN) {
      console.error(`[SYNC] GITHUB_TOKEN not set in environment`);
      return false;
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        createdAt: true,
        githubOwner: true,
        githubRepo: true,
        githubBranch: true,
        githubSyncedAt: true,
      },
    });

    if (!project) {
      console.error(`[SYNC] Project ${projectId} not found`);
      return false;
    }

    if (!project.githubOwner || !project.githubRepo) {
      console.error(
        `[SYNC] Project missing GitHub config - owner: "${project.githubOwner}", repo: "${project.githubRepo}"`,
      );
      return false;
    }

    // Parse repo name from full URL or simple name
    let repoName = project.githubRepo.trim();
    if (repoName.includes("://")) {
      // Handle full URL: https://github.com/owner/repo or https://github.com/owner/repo.git
      const parts = repoName.replace(/\.git$/, "").split("/");
      repoName = parts[parts.length - 1];
    } else if (repoName.includes(":")) {
      // Handle SSH: git@github.com:owner/repo.git
      const parts = repoName.replace(/\.git$/, "").split("/");
      repoName = parts[parts.length - 1];
    }

    if (!repoName || repoName.length === 0) {
      console.error(
        `[SYNC] Could not parse repo name from "${project.githubRepo}"`,
      );
      return false;
    }

    const repoLabel = `${project.githubOwner}/${repoName}`;
    const branch = (project.githubBranch || "main").trim();
    const syncStartTime = new Date();

    // First sync: fetch full history. Later syncs: only new items since last sync
    const isFirstSync = !project.githubSyncedAt;
    const sinceDate = isFirstSync ? new Date(0) : project.githubSyncedAt!;

    console.log(
      `[SYNC] ========== Starting sync for ${repoLabel} (${branch}) ==========`,
    );
    console.log(
      `[SYNC] isFirstSync: ${isFirstSync}, since: ${sinceDate.toISOString()}`,
    );

    // Validate repo exists first with a simple API call
    console.log(`[SYNC] Validating repo access...`);
    const repoCheckResponse = await fetch(
      `https://api.github.com/repos/${project.githubOwner}/${repoName}`,
      { headers: getGitHubHeaders(), cache: "no-store" },
    );
    if (!repoCheckResponse.ok) {
      console.error(
        `[SYNC] Repo validation failed: ${repoCheckResponse.status} - ${repoCheckResponse.statusText}`,
      );
      if (repoCheckResponse.status === 404) {
        console.error(`[SYNC] Repo not found or you don't have access`);
      } else if (repoCheckResponse.status === 401) {
        console.error(`[SYNC] Unauthorized - check GITHUB_TOKEN`);
      }
      return false;
    }
    console.log(`[SYNC] Repo validated successfully`);

    const commitPath = (page: number) =>
      `/repos/${project.githubOwner}/${repoName}/commits?sha=${encodeURIComponent(branch)}${isFirstSync ? "" : `&since=${sinceDate.toISOString()}`}&per_page=100&page=${page}`;

    console.log(`[SYNC] Fetching commits...`);
    const commits = await fetchGitHubCollection<GitHubCommit>((page) =>
      commitPath(page),
    );
    console.log(`[SYNC] ✓ Fetched ${commits.length} commits`);

    const prPath = (page: number) =>
      `/repos/${project.githubOwner}/${repoName}/pulls?state=all&sort=updated&direction=desc&per_page=100&page=${page}`;
    console.log(`[SYNC] Fetching pull requests...`);
    const pullRequests = await fetchGitHubCollection<GitHubPullRequest>(
      (page) => prPath(page),
    );
    console.log(`[SYNC] ✓ Fetched ${pullRequests.length} pull requests`);

    const issuePath = (page: number) =>
      `/repos/${project.githubOwner}/${repoName}/issues?state=all${isFirstSync ? "" : `&since=${sinceDate.toISOString()}`}&per_page=100&page=${page}`;
    console.log(`[SYNC] Fetching issues...`);
    const issues = await fetchGitHubCollection<GitHubIssue>((page) =>
      issuePath(page),
    );
    console.log(
      `[SYNC] ✓ Fetched ${issues.length} issues (before filtering PRs)`,
    );

    const totalFetched = commits.length + pullRequests.length + issues.length;

    // Only update sync timestamp if we got at least some results OR it's the first sync
    // (don't mark as synced if nothing found on first sync - try again next time)
    if (totalFetched === 0) {
      console.warn(
        `[SYNC] ⚠ No commits, PRs, or issues found. Not marking as synced (will retry next time)`,
      );
      return {
        commits: 0,
        pullRequests: 0,
        issues: 0,
        activities: 0,
        syncedAt: new Date().toISOString(),
        weeklyOverview: [],
      } satisfies GitHubSyncSummary;
    }

    console.log(`[SYNC] Processing activities (${totalFetched} items)...`);
    const activityWrites: Promise<unknown>[] = [];

    // Process commits
    for (const commit of commits) {
      const createdAt = new Date(commit.commit.author?.date || syncStartTime);
      const weekNumber = getProjectWeekNumber(project.createdAt, createdAt);
      const authorName =
        commit.author?.login || commit.commit.author?.name || "Unknown author";
      const message =
        commit.commit.message.split("\n")[0] ||
        `Commit ${commit.sha.slice(0, 7)}`;

      activityWrites.push(
        prisma.activityEvent.upsert({
          where: { syncKey: `github:commit:${commit.sha}` },
          create: {
            projectId,
            source: "github",
            kind: "commit",
            syncKey: `github:commit:${commit.sha}`,
            weekNumber,
            message: `Commit ${commit.sha.slice(0, 7)} by ${authorName}: ${message}`,
            referenceUrl: commit.html_url,
            payload: JSON.stringify({
              type: "commit",
              repository: repoLabel,
              sha: commit.sha,
              author: authorName,
              message,
            } satisfies GitHubActivityPayload),
            createdAt,
          },
          update: {
            weekNumber,
            message: `Commit ${commit.sha.slice(0, 7)} by ${authorName}: ${message}`,
            referenceUrl: commit.html_url,
            payload: JSON.stringify({
              type: "commit",
              repository: repoLabel,
              sha: commit.sha,
              author: authorName,
              message,
            } satisfies GitHubActivityPayload),
          },
        }),
      );
    }

    // Process pull requests - filter out PRs older than sinceDate (use created_at for consistency)
    const recentPRs = pullRequests.filter((pr) => {
      const createdAt = new Date(pr.created_at);
      return createdAt >= sinceDate;
    });

    for (const pullRequest of recentPRs) {
      const createdAt = new Date(pullRequest.created_at);
      const weekNumber = getProjectWeekNumber(project.createdAt, createdAt);
      const authorName = pullRequest.user?.login || "Unknown author";
      const stateLabel = pullRequest.merged_at ? "merged" : pullRequest.state;

      activityWrites.push(
        prisma.activityEvent.upsert({
          where: { syncKey: `github:pull_request:${pullRequest.id}` },
          create: {
            projectId,
            source: "github",
            kind: "pull_request",
            syncKey: `github:pull_request:${pullRequest.id}`,
            weekNumber,
            message: `Pull request #${pullRequest.number} ${stateLabel} by ${authorName}: ${pullRequest.title}`,
            referenceUrl: pullRequest.html_url,
            payload: JSON.stringify({
              type: "pull_request",
              repository: repoLabel,
              number: pullRequest.number,
              author: authorName,
              title: pullRequest.title,
              state: stateLabel,
            } satisfies GitHubActivityPayload),
            createdAt,
          },
          update: {
            weekNumber,
            message: `Pull request #${pullRequest.number} ${stateLabel} by ${authorName}: ${pullRequest.title}`,
            referenceUrl: pullRequest.html_url,
            payload: JSON.stringify({
              type: "pull_request",
              repository: repoLabel,
              number: pullRequest.number,
              author: authorName,
              title: pullRequest.title,
              state: stateLabel,
            } satisfies GitHubActivityPayload),
          },
        }),
      );
    }

    // Process issues - skip pull requests, filter by created_at
    const recentIssues = issues.filter((issue) => {
      if (issue.pull_request) return false; // Skip PRs reported as issues
      const createdAt = new Date(issue.created_at);
      return createdAt >= sinceDate;
    });

    for (const issue of recentIssues) {
      const createdAt = new Date(issue.created_at);
      const weekNumber = getProjectWeekNumber(project.createdAt, createdAt);
      const authorName = issue.user?.login || "Unknown author";
      const stateLabel = issue.closed_at ? "closed" : issue.state;

      activityWrites.push(
        prisma.activityEvent.upsert({
          where: { syncKey: `github:issue:${issue.id}` },
          create: {
            projectId,
            source: "github",
            kind: "issue",
            syncKey: `github:issue:${issue.id}`,
            weekNumber,
            message: `Issue #${issue.number} ${stateLabel} by ${authorName}: ${issue.title}`,
            referenceUrl: issue.html_url,
            payload: JSON.stringify({
              type: "issue",
              repository: repoLabel,
              number: issue.number,
              author: authorName,
              title: issue.title,
              state: stateLabel,
            } satisfies GitHubActivityPayload),
            createdAt,
          },
          update: {
            weekNumber,
            message: `Issue #${issue.number} ${stateLabel} by ${authorName}: ${issue.title}`,
            referenceUrl: issue.html_url,
            payload: JSON.stringify({
              type: "issue",
              repository: repoLabel,
              number: issue.number,
              author: authorName,
              title: issue.title,
              state: stateLabel,
            } satisfies GitHubActivityPayload),
          },
        }),
      );
    }

    console.log(
      `[SYNC] Writing ${activityWrites.length} activities to database...`,
    );
    await Promise.all(activityWrites);
    console.log(`[SYNC] ✓ Activities written`);

    const syncCompleteTime = new Date();
    console.log(`[SYNC] Marking sync complete...`);
    await prisma.project.update({
      where: { id: projectId },
      data: { githubSyncedAt: syncCompleteTime },
    });

    const result = {
      commits: commits.length,
      pullRequests: recentPRs.length,
      issues: recentIssues.length,
      activities: activityWrites.length,
      syncedAt: syncCompleteTime.toISOString(),
      weeklyOverview: buildWeeklyOverview({
        createdAt: project.createdAt,
        updates: [],
        approvals: [],
        activities: [],
      }),
    } satisfies GitHubSyncSummary;

    console.log(
      `[SYNC] ========== Sync complete: ${result.commits} commits, ${result.pullRequests} PRs, ${result.issues} issues ==========`,
    );
    return result;
  } catch (error) {
    console.error(
      `[SYNC] ERROR:`,
      error instanceof Error ? error.message : String(error),
    );
    if (error instanceof Error && error.stack) {
      console.error(`[SYNC] Stack:`, error.stack);
    }
    return false;
  }
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
      activities: {
        orderBy: { createdAt: "desc" },
        take: 50,
      },
    },
  });

  const allActivityRecords = await prisma.activityEvent.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      projectId: true,
      createdAt: true,
      weekNumber: true,
      kind: true,
    },
  });

  return projects.map((project) => ({
    id: project.id,
    name: project.name,
    status: project.status,
    overallProgress: project.overallProgress,
    selectedWeek: project.selectedWeek,
    githubSyncedAt: project.githubSyncedAt?.toISOString() ?? null,
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
    weeklyOverview: buildWeeklyOverview({
      createdAt: project.createdAt,
      updates: project.updates.map((item) => ({ createdAt: item.createdAt })),
      approvals: project.approvals.map((item) => ({
        createdAt: item.createdAt,
      })),
      activities: allActivityRecords
        .filter((item) => item.projectId === project.id)
        .map((item) => ({
          weekNumber: item.weekNumber,
          kind: item.kind,
          createdAt: item.createdAt,
        })),
    }),
  }));
}
