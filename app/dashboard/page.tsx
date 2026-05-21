import { DashboardScreen } from "@/components/dashboard-screen";
import {
  ensureUserProfile,
  getProjectForUser,
  listProjectsForUser,
} from "@/lib/data";
import { requireSession } from "@/lib/session";

export default async function DashboardPage() {
  const session = await requireSession();
  const profile = await ensureUserProfile(session.user.id, session.user.email);
  const projects = await listProjectsForUser(session.user.id);
  const initialProject = projects[0]
    ? await getProjectForUser(projects[0].id, session.user.id)
    : null;

  return (
    <DashboardScreen
      session={session}
      userRole={profile.role}
      initialProjects={projects}
      initialProject={initialProject}
    />
  );
}
