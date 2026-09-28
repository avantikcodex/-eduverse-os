"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function AdminLogin() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function login() {
    if (!email || !password) {
      setError("Enter your email and password.");
      return;
    }

    setLoading(true);
    setError("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.replace("/admin");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#050609] px-5 text-white">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.04] p-7 shadow-2xl">
        <div className="mb-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-300 to-violet-500 text-xl font-black text-black">
            E
          </div>

          <h1 className="mt-5 text-2xl font-black">
            EduVerse Admin
          </h1>

          <p className="mt-2 text-sm text-zinc-600">
            Authorized administrators only.
          </p>
        </div>

        <div className="space-y-4">
          <input
            type="email"
            placeholder="Admin email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 outline-none"
          />

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 outline-none"
          />

          {error && (
            <div className="rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-300">
              {error}
            </div>
          )}

          <button
            onClick={login}
            disabled={loading}
            className="w-full rounded-xl bg-gradient-to-r from-cyan-300 to-violet-400 px-5 py-3.5 font-black text-black disabled:opacity-50"
          >
            {loading ? "Verifying..." : "Enter Admin Center →"}
          </button>
        </div>
      </div>
    </main>
  );
}