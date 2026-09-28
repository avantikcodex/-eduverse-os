"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const API =
  process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

type Subject = {
  id: string;
  name: string;
  code?: string;
  description?: string;
  is_active: boolean;
};

type Feature = {
  id: string;
  feature_key: string;
  display_name: string;
  enabled: boolean;
  description?: string;
};

type User = {
  id: string;
  full_name: string;
  email: string;
  role: string;
  status: string;
};

type Feedback = {
  id: string;
  rating?: number;
  type: string;
  title?: string;
  message: string;
  feature?: string;
  status: string;
  created_at: string;
};

export default function AdminPage() {
  const router = useRouter();

  const [tab, setTab] = useState("overview");
  const [token, setToken] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [overview, setOverview] = useState<any>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [logs, setLogs] = useState<any[]>([]);

  const [newSubject, setNewSubject] = useState({
    name: "",
    code: "",
    description: "",
  });

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    init();
  }, []);

  async function init() {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        router.replace("/admin/login");
        return;
      }

      setToken(session.access_token);

      await loadAll(session.access_token);
    } catch (e: any) {
      setError(e.message || "Failed to initialize Admin.");
    } finally {
      setLoading(false);
    }
  }

  async function api(
    path: string,
    options: RequestInit = {},
    accessToken = token,
  ) {
    const response = await fetch(`${API}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        ...(options.headers || {}),
      },
    });

    if (response.status === 401) {
      await supabase.auth.signOut();
      router.replace("/admin/login");
      throw new Error("Session expired.");
    }

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.detail || "Request failed.");
    }

    return data;
  }

  async function loadAll(accessToken = token) {
    const [overviewData, subjectsData, featuresData] =
      await Promise.all([
        api("/control/overview", {}, accessToken),
        api("/control/subjects", {}, accessToken),
        api("/control/features", {}, accessToken),
      ]);

    setOverview(overviewData);
    setSubjects(subjectsData);
    setFeatures(featuresData);

    if (tab === "users" || tab === "overview") {
      setUsers(
        await api("/control/users", {}, accessToken),
      );
    }
  }

  async function openUsers() {
    setTab("users");

    try {
      setUsers(await api("/control/users"));
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function openFeedback() {
    setTab("feedback");

    try {
      setFeedback(await api("/control/feedback"));
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function openLogs() {
    setTab("logs");

    try {
      setLogs(await api("/control/logs"));
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function createSubject() {
    if (!newSubject.name.trim()) {
      setError("Subject name is required.");
      return;
    }

    try {
      setSaving(true);
      setError("");

      const created = await api("/control/subjects", {
        method: "POST",
        body: JSON.stringify(newSubject),
      });

      setSubjects((current) =>
        [...current, created].sort((a, b) =>
          a.name.localeCompare(b.name),
        ),
      );

      setNewSubject({
        name: "",
        code: "",
        description: "",
      });

      setOverview((current: any) =>
        current
          ? {
              ...current,
              counts: {
                ...current.counts,
                subjects:
                  Number(current.counts.subjects || 0) + 1,
              },
            }
          : current,
      );
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleSubject(subject: Subject) {
    try {
      const updated = await api(
        `/control/subjects/${subject.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            is_active: !subject.is_active,
          }),
        },
      );

      setSubjects((current) =>
        current.map((item) =>
          item.id === updated.id ? updated : item,
        ),
      );
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function toggleFeature(feature: Feature) {
    try {
      const updated = await api(
        `/control/features/${encodeURIComponent(
          feature.feature_key,
        )}?enabled=${!feature.enabled}`,
        {
          method: "PATCH",
        },
      );

      setFeatures((current) =>
        current.map((item) =>
          item.feature_key === updated.feature_key
            ? updated
            : item,
        ),
      );
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function toggleUser(user: User) {
    try {
      const status =
        user.status === "active" ? "suspended" : "active";

      const updated = await api(
        `/control/users/${user.id}/status`,
        {
          method: "PATCH",
          body: JSON.stringify({ status }),
        },
      );

      setUsers((current) =>
        current.map((item) =>
          item.id === updated.id ? updated : item,
        ),
      );
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function updateFeedback(
    item: Feedback,
    status: string,
  ) {
    try {
      const updated = await api(
        `/control/feedback/${item.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            status,
          }),
        },
      );

      setFeedback((current) =>
        current.map((f) =>
          f.id === updated.id ? updated : f,
        ),
      );
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function logout() {
    await supabase.auth.signOut();
    router.replace("/admin/login");
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#050609] text-white">
        <div className="text-center">
          <div className="mx-auto h-14 w-14 animate-pulse rounded-2xl bg-gradient-to-br from-cyan-300 to-violet-500" />
          <div className="mt-4 font-bold">
            Verifying Admin access...
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#050609] text-white">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#050609]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between px-5 py-4">
          <div>
            <div className="font-black">
              EduVerse Control Center
            </div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-700">
              Super Admin
            </div>
          </div>

          <div className="flex gap-2">
            <a
              href="/"
              className="hidden rounded-xl border border-white/10 px-4 py-2 text-sm text-zinc-400 sm:block"
            >
              Platform
            </a>

            <button
              onClick={logout}
              className="rounded-xl border border-red-400/10 bg-red-400/5 px-4 py-2 text-sm text-red-300"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1500px] lg:grid-cols-[230px_1fr]">
        <aside className="border-r border-white/10 p-4">
          {[
            ["overview", "Overview"],
            ["subjects", "Subjects"],
            ["users", "Users"],
            ["features", "Feature Flags"],
            ["feedback", "Feedback"],
            ["logs", "Audit Logs"],
          ].map(([id, label]) => (
            <button
              key={id}
              onClick={() => {
                if (id === "users") {
                  openUsers();
                  return;
                }

                if (id === "feedback") {
                  openFeedback();
                  return;
                }

                if (id === "logs") {
                  openLogs();
                  return;
                }

                setTab(id);
              }}
              className={`mb-1 w-full rounded-xl px-3 py-3 text-left text-sm ${
                tab === id
                  ? "bg-white text-black"
                  : "text-zinc-600 hover:bg-white/5 hover:text-white"
              }`}
            >
              {label}
            </button>
          ))}
        </aside>

        <section className="min-w-0 p-5 sm:p-8">
          <div className="mx-auto max-w-6xl">
            {error && (
              <div className="mb-5 rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-300">
                {error}
              </div>
            )}

            {tab === "overview" && (
              <Overview
                overview={overview}
                onSubjects={() => setTab("subjects")}
                onUsers={openUsers}
                onFeedback={openFeedback}
              />
            )}

            {tab === "subjects" && (
              <Subjects
                subjects={subjects}
                value={newSubject}
                setValue={setNewSubject}
                saving={saving}
                createSubject={createSubject}
                toggleSubject={toggleSubject}
              />
            )}

            {tab === "users" && (
              <Users
                users={users}
                toggleUser={toggleUser}
              />
            )}

            {tab === "features" && (
              <Features
                features={features}
                toggleFeature={toggleFeature}
              />
            )}

            {tab === "feedback" && (
              <Feedback
                feedback={feedback}
                updateFeedback={updateFeedback}
              />
            )}

            {tab === "logs" && (
              <Logs logs={logs} />
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function Overview({
  overview,
  onSubjects,
  onUsers,
  onFeedback,
}: any) {
  const counts = overview?.counts || {};

  return (
    <div className="space-y-7">
      <Header
        title="Control everything."
        subtitle="This panel now reads real platform data through FastAPI and PostgreSQL."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Stat label="Students" value={counts.students || 0} />
        <Stat label="Teachers" value={counts.teachers || 0} />
        <Stat label="Subjects" value={counts.subjects || 0} />
        <Stat label="Materials" value={counts.materials || 0} />
        <Stat label="Feedback" value={counts.feedback || 0} />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Action
          title="Manage Subjects"
          text="Create and enable subjects."
          onClick={onSubjects}
        />

        <Action
          title="Manage Users"
          text="Activate or suspend users."
          onClick={onUsers}
        />

        <Action
          title="Review Feedback"
          text="See what users want improved."
          onClick={onFeedback}
        />
      </div>

      <Panel>
        <h2 className="text-xl font-black">
          Backend status
        </h2>

        <div className="mt-5 space-y-3">
          <Health name="FastAPI" />
          <Health name="Supabase PostgreSQL" />
          <Health name="Supabase Auth" />
          <Health
            name="Gemini AI"
            status={
              overview?.ai_configured !== false
                ? "Configured"
                : "Missing"
            }
          />
        </div>
      </Panel>
    </div>
  );
}

function Subjects({
  subjects,
  value,
  setValue,
  saving,
  createSubject,
  toggleSubject,
}: any) {
  return (
    <div className="space-y-7">
      <Header
        title="Subjects"
        subtitle="These records are stored in PostgreSQL and can drive Student and Teacher dashboards."
      />

      <Panel>
        <h2 className="text-xl font-black">
          Add Subject
        </h2>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <input
            value={value.name}
            onChange={(e) =>
              setValue({
                ...value,
                name: e.target.value,
              })
            }
            placeholder="Subject name"
            className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 outline-none"
          />

          <input
            value={value.code}
            onChange={(e) =>
              setValue({
                ...value,
                code: e.target.value,
              })
            }
            placeholder="Code e.g. CSE-JAVA"
            className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 outline-none"
          />

          <input
            value={value.description}
            onChange={(e) =>
              setValue({
                ...value,
                description: e.target.value,
              })
            }
            placeholder="Description"
            className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 outline-none"
          />
        </div>

        <button
          onClick={createSubject}
          disabled={saving}
          className="mt-4 rounded-xl bg-white px-5 py-3 font-black text-black"
        >
          {saving ? "Creating..." : "+ Create Subject"}
        </button>
      </Panel>

      <Panel>
        <div className="space-y-3">
          {subjects.length === 0 && (
            <Empty text="No subjects yet. Create the first one above." />
          )}

          {subjects.map((subject: Subject) => (
            <div
              key={subject.id}
              className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <div className="font-bold">{subject.name}</div>

                <div className="mt-1 text-xs text-zinc-600">
                  {subject.code || "No code"} •{" "}
                  {subject.description || "No description"}
                </div>
              </div>

              <button
                onClick={() => toggleSubject(subject)}
                className={`rounded-lg px-3 py-2 text-xs ${
                  subject.is_active
                    ? "bg-emerald-400/10 text-emerald-300"
                    : "bg-red-400/10 text-red-300"
                }`}
              >
                {subject.is_active
                  ? "Active"
                  : "Archived"}
              </button>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function Users({
  users,
  toggleUser,
}: {
  users: User[];
  toggleUser: (user: User) => void;
}) {
  return (
    <div className="space-y-7">
      <Header
        title="Users"
        subtitle="Manage active and suspended Student and Teacher accounts."
      />

      <Panel>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left">
            <thead>
              <tr className="border-b border-white/10 text-xs text-zinc-700">
                <th className="px-3 py-3">Name</th>
                <th className="px-3 py-3">Email</th>
                <th className="px-3 py-3">Role</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Action</th>
              </tr>
            </thead>

            <tbody>
              {users.map((user) => (
                <tr
                  key={user.id}
                  className="border-b border-white/5"
                >
                  <td className="px-3 py-4 font-semibold">
                    {user.full_name}
                  </td>

                  <td className="px-3 py-4 text-sm text-zinc-600">
                    {user.email}
                  </td>

                  <td className="px-3 py-4 text-sm">
                    {user.role}
                  </td>

                  <td className="px-3 py-4">
                    <span className="rounded-full bg-white/5 px-3 py-1 text-xs">
                      {user.status}
                    </span>
                  </td>

                  <td className="px-3 py-4">
                    {!user.role.includes("admin") && (
                      <button
                        onClick={() => toggleUser(user)}
                        className="rounded-lg border border-white/10 px-3 py-2 text-xs"
                      >
                        {user.status === "active"
                          ? "Suspend"
                          : "Activate"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function Features({
  features,
  toggleFeature,
}: {
  features: Feature[];
  toggleFeature: (feature: Feature) => void;
}) {
  return (
    <div className="space-y-7">
      <Header
        title="Feature Flags"
        subtitle="These switches are stored in PostgreSQL instead of browser memory."
      />

      <Panel>
        <div className="grid gap-3 md:grid-cols-2">
          {features.map((feature) => (
            <div
              key={feature.feature_key}
              className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 p-5"
            >
              <div>
                <div className="font-semibold">
                  {feature.display_name}
                </div>

                <div className="mt-1 text-xs text-zinc-700">
                  {feature.description}
                </div>
              </div>

              <button
                onClick={() => toggleFeature(feature)}
                className={`relative h-8 w-14 rounded-full ${
                  feature.enabled
                    ? "bg-cyan-300"
                    : "bg-white/10"
                }`}
              >
                <span
                  className={`absolute top-1 h-6 w-6 rounded-full ${
                    feature.enabled
                      ? "left-7 bg-black"
                      : "left-1 bg-zinc-600"
                  }`}
                />
              </button>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function Feedback({
  feedback,
  updateFeedback,
}: {
  feedback: Feedback[];
  updateFeedback: (
    item: Feedback,
    status: string,
  ) => void;
}) {
  return (
    <div className="space-y-7">
      <Header
        title="Feedback Center"
        subtitle="Read real user feedback and move issues/features through the workflow."
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Stat
          label="Total"
          value={feedback.length}
        />

        <Stat
          label="New"
          value={
            feedback.filter(
              (item) => item.status === "new",
            ).length
          }
        />

        <Stat
          label="Features"
          value={
            feedback.filter(
              (item) => item.type === "feature",
            ).length
          }
        />
      </div>

      <Panel>
        <div className="space-y-4">
          {feedback.length === 0 && (
            <Empty text="No feedback submitted yet." />
          )}

          {feedback.map((item) => (
            <div
              key={item.id}
              className="rounded-2xl border border-white/10 bg-black/20 p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-bold">
                    {item.title || "Feedback"}
                  </div>

                  <div className="mt-1 text-xs text-zinc-600">
                    {item.type}
                    {item.feature
                      ? ` • ${item.feature}`
                      : ""}
                    {item.rating
                      ? ` • ${"★".repeat(item.rating)}`
                      : ""}
                  </div>
                </div>

                <select
                  value={item.status}
                  onChange={(e) =>
                    updateFeedback(
                      item,
                      e.target.value,
                    )
                  }
                  className="rounded-lg border border-white/10 bg-black px-3 py-2 text-xs"
                >
                  <option value="new">New</option>
                  <option value="reviewing">
                    Reviewing
                  </option>
                  <option value="planned">
                    Planned
                  </option>
                  <option value="resolved">
                    Resolved
                  </option>
                  <option value="closed">Closed</option>
                </select>
              </div>

              <p className="mt-4 text-sm leading-7 text-zinc-400">
                {item.message}
              </p>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function Logs({ logs }: { logs: any[] }) {
  return (
    <div className="space-y-7">
      <Header
        title="Audit Logs"
        subtitle="Important Admin actions are recorded server-side."
      />

      <Panel>
        <div className="space-y-3">
          {logs.length === 0 && (
            <Empty text="No audit events yet." />
          )}

          {logs.map((log) => (
            <div
              key={log.id}
              className="rounded-xl border border-white/10 bg-black/20 p-4"
            >
              <div className="flex flex-wrap gap-3 text-xs">
                <span className="rounded-full bg-cyan-400/10 px-2 py-1 text-cyan-300">
                  {log.action}
                </span>

                <span className="text-zinc-700">
                  {new Date(log.created_at).toLocaleString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function Header({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div>
      <h1 className="text-4xl font-black tracking-tight">
        {title}
      </h1>

      <p className="mt-3 max-w-2xl text-sm leading-7 text-zinc-600">
        {subtitle}
      </p>
    </div>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.035] p-5 shadow-xl sm:p-6">
      {children}
    </section>
  );
}

function Stat({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-700">
        {label}
      </div>

      <div className="mt-2 text-3xl font-black">
        {value}
      </div>
    </div>
  );
}

function Health({
  name,
  status = "Healthy",
}: {
  name: string;
  status?: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 p-4">
      <span className="text-sm text-zinc-400">
        {name}
      </span>

      <span className="text-sm text-emerald-300">
        ● {status}
      </span>
    </div>
  );
}

function Action({
  title,
  text,
  onClick,
}: {
  title: string;
  text: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-left hover:bg-white/[0.05]"
    >
      <div className="font-bold">{title} →</div>
      <div className="mt-2 text-sm leading-6 text-zinc-600">
        {text}
      </div>
    </button>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="py-12 text-center text-sm text-zinc-700">
      {text}
    </div>
  );
}