"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

type Mode = "signIn" | "signUp";

const highlights = [
  "AI-assisted plan intake from docs and design files",
  "Weekly review summaries for your boss",
  "Daily progress logging with missed-item tracking",
  "GitHub-linked activity feed and delivery snapshots",
];

export function AuthScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signIn");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const title = useMemo(
    () =>
      mode === "signIn"
        ? "Sign in to Project Timeline"
        : "Create your tracker account",
    [mode],
  );

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      try {
        if (mode === "signIn") {
          await authClient.signIn.email(
            {
              email,
              password,
              callbackURL: "/dashboard",
            },
            {
              onSuccess: () => router.push("/dashboard"),
              onError: (context) => setError(context.error.message),
            },
          );
        } else {
          await authClient.signUp.email(
            {
              name,
              email,
              password,
              callbackURL: "/dashboard",
            },
            {
              onSuccess: () => router.push("/dashboard"),
              onError: (context) => setError(context.error.message),
            },
          );
        }
      } catch (submitError) {
        setError(
          submitError instanceof Error
            ? submitError.message
            : "Authentication failed",
        );
      }
    });
  };

  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.2),transparent_25%),radial-gradient(circle_at_top_right,rgba(16,185,129,0.14),transparent_22%),linear-gradient(180deg,#07111f_0%,#0a1628_46%,#09101c_100%)]" />
      <div className="relative mx-auto grid min-h-screen w-full max-w-7xl gap-8 px-4 py-8 lg:grid-cols-[1.08fr_0.92fr] lg:px-8">
        <section className="flex items-center">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-400/10 px-4 py-2 text-xs font-medium text-emerald-100">
              Better Auth powered
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
              Built for weekly boss reviews
            </div>

            <h1 className="mt-6 text-4xl font-semibold tracking-tight text-white sm:text-6xl">
              A polished tracker for your school ERP delivery
            </h1>
            <p className="mt-4 max-w-xl text-base leading-7 text-slate-300 sm:text-lg">
              Upload project docs, shape a 3-month plan, report daily progress,
              and show your boss a clean view of what changed, what is blocked,
              and what is next.
            </p>

            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {highlights.map((item) => (
                <div
                  key={item}
                  className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-200 backdrop-blur-xl"
                >
                  {item}
                </div>
              ))}
            </div>

            <div className="mt-8 grid gap-3 text-sm text-slate-300 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                <div className="text-xs uppercase tracking-[0.28em] text-cyan-200/70">
                  Weekly cadence
                </div>
                <div className="mt-2 text-lg font-semibold text-white">
                  1-2 reviews
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                <div className="text-xs uppercase tracking-[0.28em] text-cyan-200/70">
                  Delivery window
                </div>
                <div className="mt-2 text-lg font-semibold text-white">
                  3 months
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                <div className="text-xs uppercase tracking-[0.28em] text-cyan-200/70">
                  Core signal
                </div>
                <div className="mt-2 text-lg font-semibold text-white">
                  Progress + GitHub
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="flex items-center justify-center">
          <div className="w-full max-w-xl rounded-[2rem] border border-white/10 bg-slate-950/60 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.32)] backdrop-blur-xl sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-sky-200/70">
                  Private workspace
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-white">
                  {title}
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  Use Better Auth email/password now. GitHub is reserved for
                  project syncing, not login.
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300">
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-300 align-middle" />
                <span className="ml-2">Auth ready</span>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 rounded-2xl border border-white/10 bg-white/5 p-1 text-sm">
              <button
                type="button"
                onClick={() => setMode("signIn")}
                className={`rounded-xl px-4 py-3 transition ${
                  mode === "signIn"
                    ? "bg-sky-400/15 text-white"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={() => setMode("signUp")}
                className={`rounded-xl px-4 py-3 transition ${
                  mode === "signUp"
                    ? "bg-sky-400/15 text-white"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Create account
              </button>
            </div>

            <form className="mt-6 space-y-4" onSubmit={submit}>
              {mode === "signUp" && (
                <label className="block">
                  <span className="mb-2 block text-sm text-slate-200">
                    Full name
                  </span>
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-sky-300/60"
                    placeholder="Your name"
                    autoComplete="name"
                  />
                </label>
              )}

              <label className="block">
                <span className="mb-2 block text-sm text-slate-200">Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-sky-300/60"
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm text-slate-200">
                  Password
                </span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-sky-300/60"
                  placeholder="At least 8 characters"
                  autoComplete={
                    mode === "signIn" ? "current-password" : "new-password"
                  }
                />
              </label>

              {error && (
                <div className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isPending}
                className="inline-flex w-full items-center justify-center rounded-2xl bg-gradient-to-r from-sky-400 to-emerald-300 px-4 py-3 font-medium text-slate-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isPending
                  ? "Working..."
                  : mode === "signIn"
                    ? "Sign in"
                    : "Create account"}
              </button>

              <p className="text-center text-xs leading-5 text-slate-400">
                This uses Better Auth email/password so you can learn the real
                client and server flow now.
              </p>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}
