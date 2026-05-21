"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import type { Session } from "@/lib/auth";
import type { ProjectDetails, ProjectSummary } from "@/lib/data";

type Props = {
  session: Session;
  userRole: "USER" | "BOSS";
  initialProjects: ProjectSummary[];
  initialProject: ProjectDetails | null;
};

type ProjectFormState = {
  name: string;
  description: string;
  githubOwner: string;
  githubRepo: string;
  githubBranch: string;
};

const emptyProjectForm: ProjectFormState = {
  name: "",
  description: "",
  githubOwner: "",
  githubRepo: "",
  githubBranch: "main",
};

const roadmapWeeks = ["Week 1", "Week 2", "Week 3", "Week 4"];
const statusOptions = ["On track", "At risk", "Blocked"];

function SectionCard({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[2rem] border border-white/10 bg-slate-950/55 p-6 shadow-[0_20px_80px_rgba(0,0,0,0.3)] backdrop-blur-xl">
      <div className="mb-5">
        <p className="text-xs uppercase tracking-[0.3em] text-cyan-200/70">
          {eyebrow}
        </p>
        <h2 className="mt-2 text-xl font-semibold text-white">{title}</h2>
      </div>
      {children}
    </section>
  );
}

export function DashboardScreen({
  session,
  userRole,
  initialProjects,
  initialProject,
}: Props) {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [projects, setProjects] = useState<ProjectSummary[]>(initialProjects);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    initialProject?.id ?? initialProjects[0]?.id ?? null,
  );
  const [projectDetails, setProjectDetails] = useState<ProjectDetails | null>(
    initialProject,
  );
  const [createForm, setCreateForm] =
    useState<ProjectFormState>(emptyProjectForm);
  const [dailyStatus, setDailyStatus] = useState("On track");
  const [dailyUpdate, setDailyUpdate] = useState("");
  const [dailyBlockers, setDailyBlockers] = useState("");
  const [approvalComment, setApprovalComment] = useState("");
  const [approvalDecision, setApprovalDecision] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const currentUserId = session?.user?.id ?? null;

  const selectedProject = useMemo(
    () => projects.find((item) => item.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );

  const refreshProjects = useCallback(async () => {
    const response = await fetch("/api/projects", { cache: "no-store" });
    if (!response.ok) {
      return;
    }

    const payload = (await response.json()) as { projects: ProjectSummary[] };
    setProjects(payload.projects);

    if (!selectedProjectId && payload.projects[0]) {
      setSelectedProjectId(payload.projects[0].id);
    }
  }, [selectedProjectId]);

  const refreshProjectDetails = useCallback(async (projectId: string) => {
    const response = await fetch(`/api/projects/${projectId}`, {
      cache: "no-store",
    });
    if (!response.ok) {
      return;
    }

    const payload = (await response.json()) as { project: ProjectDetails };
    setProjectDetails(payload.project);
  }, []);

  const syncGitHubProject = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!selectedProjectId) {
        return;
      }

      const response = await fetch(
        `/api/projects/${selectedProjectId}/github-sync`,
        {
          method: "POST",
        },
      );

      if (!response.ok) {
        if (!options?.silent) {
          setNotice("GitHub sync failed.");
        }
        return;
      }

      await refreshProjectDetails(selectedProjectId);
      await refreshProjects();

      if (!options?.silent) {
        const payload = (await response.json()) as {
          result: {
            commits: number;
            pullRequests: number;
            issues: number;
            activities: number;
            syncedAt: string;
          };
        };

        setNotice(
          `GitHub synced: ${payload.result.commits} commits, ${payload.result.pullRequests} PRs, ${payload.result.issues} issues.`,
        );
      }
    },
    [refreshProjectDetails, refreshProjects, selectedProjectId],
  );

  useEffect(() => {
    if (!selectedProjectId) {
      return;
    }

    let cancelled = false;

    const loadProject = async () => {
      const response = await fetch(`/api/projects/${selectedProjectId}`, {
        cache: "no-store",
      });

      if (!response.ok || cancelled) {
        return;
      }

      const payload = (await response.json()) as { project: ProjectDetails };
      if (!cancelled) {
        setProjectDetails(payload.project);
      }
    };

    void loadProject();

    const timer = window.setInterval(() => {
      void loadProject();
      void refreshProjects();
    }, 15000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [selectedProjectId, refreshProjects]);

  useEffect(() => {
    if (
      !selectedProjectId ||
      !projectDetails?.githubOwner ||
      !projectDetails.githubRepo
    ) {
      return;
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    void syncGitHubProject({ silent: true });

    const timer = window.setInterval(
      () => {
        void syncGitHubProject({ silent: true });
      },
      5 * 60 * 1000,
    );

    return () => window.clearInterval(timer);
  }, [
    projectDetails?.githubOwner,
    projectDetails?.githubRepo,
    selectedProjectId,
    syncGitHubProject,
  ]);

  const handleSignOut = async () => {
    setIsSigningOut(true);
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => router.push("/"),
      },
    });
    setIsSigningOut(false);
  };

  const handleCreateProject = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    const response = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(createForm),
    });

    if (!response.ok) {
      setNotice("Could not create project. Please check your inputs.");
      return;
    }

    const payload = (await response.json()) as { projectId: string };
    setCreateForm(emptyProjectForm);
    setSelectedProjectId(payload.projectId);
    await refreshProjects();
    await refreshProjectDetails(payload.projectId);
    setNotice("Project created and saved to database.");
  };

  const patchProject = async (patch: Record<string, unknown>) => {
    if (!selectedProjectId) {
      return;
    }

    const response = await fetch(`/api/projects/${selectedProjectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });

    if (!response.ok) {
      setNotice("Failed to save project changes.");
      return;
    }

    await refreshProjects();
    await refreshProjectDetails(selectedProjectId);
  };

  const handleDeleteProject = useCallback(async () => {
    if (!selectedProjectId || !projectDetails) return;

    // Only allow owner to delete (createdById available on projectDetails)
    if (!currentUserId || projectDetails.createdById !== currentUserId) {
      setNotice("You are not allowed to delete this project.");
      return;
    }

    // confirm
    // eslint-disable-next-line no-alert
    const ok = window.confirm(
      `Delete project \"${projectDetails.name}\" and all its data? This cannot be undone.`,
    );
    if (!ok) return;

    const response = await fetch(`/api/projects/${selectedProjectId}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      setNotice("Could not delete project.");
      return;
    }

    const payload = (await response.json()) as {
      ok?: boolean;
      projectName?: string;
    };
    await refreshProjects();

    // choose next project or null
    const remaining = projects.filter((p) => p.id !== selectedProjectId);
    const nextId = remaining[0]?.id ?? null;
    setSelectedProjectId(nextId);
    if (nextId) {
      await refreshProjectDetails(nextId);
    } else {
      setProjectDetails(null);
    }

    setNotice(
      payload.projectName
        ? `Deleted project: ${payload.projectName}`
        : "Project deleted.",
    );
  }, [
    currentUserId,
    selectedProjectId,
    projectDetails,
    projects,
    refreshProjects,
    refreshProjectDetails,
  ]);

  const handleDailyUpdateSubmit = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    if (!selectedProjectId) {
      return;
    }

    const response = await fetch(`/api/projects/${selectedProjectId}/updates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: dailyStatus,
        updateText: dailyUpdate,
        blockers: dailyBlockers,
      }),
    });

    if (!response.ok) {
      setNotice("Could not save daily update.");
      return;
    }

    setDailyUpdate("");
    setDailyBlockers("");
    await refreshProjectDetails(selectedProjectId);
    setNotice("Daily update saved to database.");
  };

  const handleApprovalSubmit = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    if (!selectedProjectId) {
      return;
    }

    const response = await fetch(
      `/api/projects/${selectedProjectId}/approvals`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          comment: approvalComment,
          approved: approvalDecision,
        }),
      },
    );

    if (!response.ok) {
      setNotice("Could not save approval comment.");
      return;
    }

    setApprovalComment("");
    setApprovalDecision(false);
    await refreshProjectDetails(selectedProjectId);
    setNotice("Approval comment saved.");
  };

  const handleGitHubSync = async () => {
    await syncGitHubProject();
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-slate-950">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-24 top-16 h-72 w-72 rounded-full bg-sky-500/20 blur-3xl" />
        <div className="absolute right-0 top-8 h-80 w-80 rounded-full bg-emerald-400/15 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-96 w-96 rounded-full bg-indigo-500/10 blur-3xl" />
      </div>

      <div className="relative mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <header className="rounded-[2rem] border border-white/10 bg-white/5 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.28)] backdrop-blur-xl">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-400/10 px-4 py-2 text-xs font-medium text-emerald-100">
                Signed in as {session?.user?.name || session?.user?.email}
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
                Role: {userRole}
              </div>
              <h1 className="mt-5 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                Project Timeline - real database mode
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
                Manage multiple projects, persist daily updates, track
                approvals, and sync GitHub placeholders in one live dashboard.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {userRole === "BOSS" && (
                <Link
                  href="/boss"
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white transition hover:bg-white/10"
                >
                  Open boss view
                </Link>
              )}
              <button
                type="button"
                onClick={handleSignOut}
                className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-900/80"
              >
                {isSigningOut ? "Signing out..." : "Sign out"}
              </button>
            </div>
          </div>
        </header>

        {notice && (
          <div className="rounded-2xl border border-sky-300/30 bg-sky-400/10 px-4 py-3 text-sm text-sky-100">
            {notice}
          </div>
        )}

        <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <SectionCard title="Create and switch projects" eyebrow="Projects">
            <form className="grid gap-3" onSubmit={handleCreateProject}>
              <input
                value={createForm.name}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-sky-300/60"
                placeholder="Project name"
                required
              />
              <textarea
                value={createForm.description}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                className="min-h-24 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-sky-300/60"
                placeholder="Project setup notes"
              />
              <div className="grid gap-3 md:grid-cols-3">
                <input
                  value={createForm.githubOwner}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      githubOwner: event.target.value,
                    }))
                  }
                  className="rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-3 text-sm text-white outline-none placeholder:text-slate-500"
                  placeholder="GitHub owner"
                />
                <input
                  value={createForm.githubRepo}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      githubRepo: event.target.value,
                    }))
                  }
                  className="rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-3 text-sm text-white outline-none placeholder:text-slate-500"
                  placeholder="GitHub repo"
                />
                <input
                  value={createForm.githubBranch}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      githubBranch: event.target.value,
                    }))
                  }
                  className="rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-3 text-sm text-white outline-none placeholder:text-slate-500"
                  placeholder="Branch"
                />
              </div>
              <button
                type="submit"
                className="rounded-2xl bg-gradient-to-r from-sky-400 to-emerald-300 px-4 py-3 text-sm font-semibold text-slate-950"
              >
                Create project
              </button>
            </form>

            <div className="mt-5 grid gap-2">
              {projects.length === 0 ? (
                <p className="text-sm text-slate-400">
                  Create your first project.
                </p>
              ) : (
                projects.map((project) => (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() => setSelectedProjectId(project.id)}
                    className={`rounded-2xl border px-4 py-3 text-left transition ${
                      selectedProjectId === project.id
                        ? "border-sky-300/40 bg-sky-400/10"
                        : "border-white/10 bg-white/5 hover:bg-white/10"
                    }`}
                  >
                    <p className="font-medium text-white">{project.name}</p>
                    <p className="mt-1 text-xs text-slate-300">
                      {project.status} - {project.overallProgress}% -{" "}
                      {project.selectedWeek}
                    </p>
                  </button>
                ))
              )}
            </div>
          </SectionCard>

          <SectionCard title="Project health" eyebrow="Live">
            {!projectDetails ? (
              <p className="text-sm text-slate-400">
                Select or create a project.
              </p>
            ) : (
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between text-sm text-slate-300">
                    <span>Overall completion</span>
                    <span>{projectDetails.overallProgress}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={projectDetails.overallProgress}
                    onChange={(event) =>
                      void patchProject({
                        overallProgress: Number(event.target.value),
                      })
                    }
                    className="mt-3 h-2 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-sky-400"
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <select
                    value={projectDetails.selectedWeek}
                    onChange={(event) =>
                      void patchProject({ selectedWeek: event.target.value })
                    }
                    className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-3 text-sm text-white"
                  >
                    {roadmapWeeks.map((week) => (
                      <option key={week} value={week}>
                        {week}
                      </option>
                    ))}
                  </select>

                  <select
                    value={projectDetails.status}
                    onChange={(event) =>
                      void patchProject({ status: event.target.value })
                    }
                    className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-3 text-sm text-white"
                  >
                    {statusOptions.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </SectionCard>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          <SectionCard title="Daily updates" eyebrow="Execution">
            {!selectedProject ? (
              <p className="text-sm text-slate-400">Pick a project first.</p>
            ) : (
              <form className="space-y-3" onSubmit={handleDailyUpdateSubmit}>
                <select
                  value={dailyStatus}
                  onChange={(event) => setDailyStatus(event.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-3 text-sm text-white"
                >
                  {statusOptions.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
                <input
                  value={dailyUpdate}
                  onChange={(event) => setDailyUpdate(event.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-3 text-sm text-white"
                  placeholder="What did you complete today?"
                  required
                />
                <textarea
                  value={dailyBlockers}
                  onChange={(event) => setDailyBlockers(event.target.value)}
                  className="min-h-24 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-3 text-sm text-white"
                  placeholder="Blockers and risks"
                />
                <button
                  type="submit"
                  className="rounded-2xl bg-gradient-to-r from-sky-400 to-emerald-300 px-4 py-3 text-sm font-semibold text-slate-950"
                >
                  Save daily update
                </button>
              </form>
            )}

            <div className="mt-5 space-y-2 text-sm text-slate-300">
              {(projectDetails?.updates || []).map((item) => (
                <div
                  key={item.id}
                  className="rounded-2xl border border-white/10 bg-white/5 p-3"
                >
                  <p>
                    <span className="font-medium text-white">
                      {item.authorName}
                    </span>{" "}
                    - {item.status}
                  </p>
                  <p className="mt-1">{item.updateText}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {new Date(item.createdAt).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Boss approvals" eyebrow="Review">
            {!selectedProject ? (
              <p className="text-sm text-slate-400">Pick a project first.</p>
            ) : (
              <form className="space-y-3" onSubmit={handleApprovalSubmit}>
                <textarea
                  value={approvalComment}
                  onChange={(event) => setApprovalComment(event.target.value)}
                  className="min-h-24 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-3 text-sm text-white"
                  placeholder="Approval note or requested changes"
                  required
                />
                <label className="inline-flex items-center gap-2 text-sm text-slate-200">
                  <input
                    type="checkbox"
                    checked={approvalDecision}
                    onChange={(event) =>
                      setApprovalDecision(event.target.checked)
                    }
                    className="h-4 w-4 accent-emerald-400"
                  />
                  Mark as approved
                </label>
                <button
                  type="submit"
                  className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-medium text-white"
                >
                  Save approval comment
                </button>
              </form>
            )}

            <div className="mt-5 space-y-2 text-sm text-slate-300">
              {(projectDetails?.approvals || []).map((item) => (
                <div
                  key={item.id}
                  className="rounded-2xl border border-white/10 bg-white/5 p-3"
                >
                  <p>
                    <span className="font-medium text-white">
                      {item.authorName}
                    </span>
                    : {item.comment}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    {item.approved ? "Approved" : "Needs changes"} -{" "}
                    {new Date(item.createdAt).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          </SectionCard>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          <SectionCard title="GitHub integration" eyebrow="Sync">
            {!projectDetails ? (
              <p className="text-sm text-slate-400">Pick a project first.</p>
            ) : (
              <div className="space-y-3">
                <input
                  value={projectDetails.githubOwner || ""}
                  onChange={(event) =>
                    void patchProject({ githubOwner: event.target.value })
                  }
                  className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-3 text-sm text-white"
                  placeholder="GitHub owner"
                />
                <input
                  value={projectDetails.githubRepo || ""}
                  onChange={(event) =>
                    void patchProject({ githubRepo: event.target.value })
                  }
                  className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-3 text-sm text-white"
                  placeholder="GitHub repository"
                />
                <input
                  value={projectDetails.githubBranch || ""}
                  onChange={(event) =>
                    void patchProject({ githubBranch: event.target.value })
                  }
                  className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-3 text-sm text-white"
                  placeholder="Branch"
                />
                <button
                  type="button"
                  onClick={handleGitHubSync}
                  className="rounded-2xl border border-cyan-300/40 bg-cyan-400/10 px-4 py-3 text-sm font-medium text-cyan-100"
                >
                  Sync GitHub now
                </button>
                {currentUserId &&
                  projectDetails.createdById === currentUserId && (
                    <button
                      type="button"
                      onClick={handleDeleteProject}
                      className="ml-3 rounded-2xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm font-medium text-red-200"
                    >
                      Delete project
                    </button>
                  )}
                <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm font-medium text-white">
                      Weekly GitHub alignment
                    </p>
                    <p className="text-xs text-slate-400">
                      Last sync:{" "}
                      {projectDetails.githubSyncedAt
                        ? new Date(
                            projectDetails.githubSyncedAt,
                          ).toLocaleString()
                        : "not synced yet"}
                    </p>
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    {projectDetails.weeklyOverview.map((week) => (
                      <div
                        key={week.weekNumber}
                        className="rounded-2xl border border-white/10 bg-white/5 p-3"
                      >
                        <p className="text-sm font-medium text-white">
                          {week.label}
                        </p>
                        <p className="mt-1 text-xs text-slate-300">
                          {week.summary}
                        </p>
                        <p className="mt-2 text-xs text-slate-400">
                          Total timeline items: {week.activityCount}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
                <p className="text-xs text-slate-400">
                  This imports real commits, pull requests, and issues from the
                  selected GitHub repo and aligns them to the weekly schedule.
                </p>
              </div>
            )}
          </SectionCard>

          <SectionCard title="Activity feed" eyebrow="Timeline">
            <ul className="space-y-2 text-sm text-slate-300">
              {(projectDetails?.activities || []).map((item) => (
                <li
                  key={item.id}
                  className="rounded-2xl border border-white/10 bg-white/5 p-3"
                >
                  <p className="text-white">{item.message}</p>
                  <p className="mt-1 text-xs text-cyan-100/80">
                    {item.kind}
                    {item.weekNumber ? ` · ${"Week " + item.weekNumber}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    {item.source} - {new Date(item.createdAt).toLocaleString()}
                    {item.referenceUrl ? (
                      <a
                        href={item.referenceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="ml-2 underline decoration-slate-500 underline-offset-2"
                      >
                        open
                      </a>
                    ) : null}
                  </p>
                </li>
              ))}
            </ul>
          </SectionCard>
        </section>
      </div>
    </main>
  );
}
