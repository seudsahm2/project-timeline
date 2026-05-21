import Link from "next/link";
import { redirect } from "next/navigation";
import { ensureUserProfile, getBossProjects } from "@/lib/data";
import { requireSession } from "@/lib/session";

export default async function BossPage() {
  const session = await requireSession();
  const profile = await ensureUserProfile(session.user.id, session.user.email);

  if (profile.role !== "BOSS") {
    redirect("/dashboard");
  }

  const projects = await getBossProjects();

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-3xl border border-white/10 bg-white/5 p-6">
          <p className="text-xs uppercase tracking-[0.28em] text-cyan-200/70">
            Boss View
          </p>
          <h1 className="mt-3 text-3xl font-semibold">Project approvals and summaries</h1>
          <p className="mt-2 text-slate-300">
            Read-only summaries across all projects. To add comments or approvals,
            open a project in the dashboard.
          </p>
          <Link
            href="/dashboard"
            className="mt-4 inline-flex rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm"
          >
            Open dashboard
          </Link>
        </header>

        <section className="grid gap-4">
          {projects.length === 0 ? (
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-slate-300">
              No projects yet.
            </div>
          ) : (
            projects.map((project) => (
              <article
                key={project.id}
                className="rounded-3xl border border-white/10 bg-slate-900/50 p-6"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-2xl font-semibold">{project.name}</h2>
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-slate-200">
                    {project.status}
                  </span>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm">
                    Progress: <span className="font-semibold">{project.overallProgress}%</span>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm">
                    Week: <span className="font-semibold">{project.selectedWeek}</span>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm">
                    Updated: {new Date(project.updatedAt).toLocaleString()}
                  </div>
                </div>

                <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-sm font-medium">Latest daily update</p>
                  {project.latestUpdate ? (
                    <div className="mt-2 space-y-2 text-sm text-slate-300">
                      <p>
                        <span className="font-medium text-white">{project.latestUpdate.authorName}</span> - {project.latestUpdate.status}
                      </p>
                      <p>{project.latestUpdate.updateText}</p>
                      <p className="text-slate-400">Blockers: {project.latestUpdate.blockers || "None"}</p>
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-slate-400">No updates yet.</p>
                  )}
                </div>

                <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-sm font-medium">Recent approval comments</p>
                  <ul className="mt-3 space-y-2 text-sm text-slate-300">
                    {project.approvals.length === 0 ? (
                      <li className="text-slate-400">No approvals yet.</li>
                    ) : (
                      project.approvals.map((approval) => (
                        <li
                          key={approval.id}
                          className="rounded-xl border border-white/10 bg-slate-950/50 p-3"
                        >
                          <p>
                            <span className="font-medium text-white">{approval.authorName}</span>: {approval.comment}
                          </p>
                          <p className="text-xs text-slate-400">
                            {approval.approved ? "Approved" : "Needs changes"} - {new Date(approval.createdAt).toLocaleString()}
                          </p>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              </article>
            ))
          )}
        </section>
      </div>
    </main>
  );
}
