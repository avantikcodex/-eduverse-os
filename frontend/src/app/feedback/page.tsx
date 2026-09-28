"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const API =
  process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

export default function FeedbackPage() {
  const router = useRouter();

  const [rating, setRating] = useState(5);
  const [type, setType] = useState("general");
  const [feature, setFeature] = useState("AI Tutor");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (!message.trim()) {
      setError("Please write your feedback.");
      return;
    }

    try {
      setSending(true);
      setError("");

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        router.replace("/login");
        return;
      }

      const response = await fetch(`${API}/feedback`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          rating,
          type,
          feature,
          title,
          message,
          page: window.location.pathname,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail || "Feedback submission failed.",
        );
      }

      setDone(true);
      setMessage("");
      setTitle("");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  if (done) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#050609] px-5 text-white">
        <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-center">
          <div className="text-5xl">✓</div>

          <h1 className="mt-5 text-3xl font-black">
            Thank you.
          </h1>

          <p className="mt-3 text-sm leading-7 text-zinc-600">
            Your feedback has been added to the EduVerse feedback
            system. We'll use it to improve the product.
          </p>

          <button
            onClick={() => router.back()}
            className="mt-6 rounded-xl bg-white px-5 py-3 font-bold text-black"
          >
            Back to EduVerse
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#050609] px-5 py-10 text-white">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8">
          <div className="text-xs uppercase tracking-[0.22em] text-cyan-300">
            Help us improve
          </div>

          <h1 className="mt-2 text-4xl font-black">
            Tell us what you think.
          </h1>

          <p className="mt-3 text-sm leading-7 text-zinc-600">
            Every useful report and idea becomes part of our product
            improvement process.
          </p>
        </div>

        <section className="rounded-3xl border border-white/10 bg-white/[0.035] p-6 sm:p-8">
          <div>
            <div className="text-sm font-semibold">
              Overall experience
            </div>

            <div className="mt-4 flex gap-2">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  onClick={() => setRating(value)}
                  className={`text-3xl ${
                    value <= rating
                      ? "text-cyan-300"
                      : "text-zinc-800"
                  }`}
                >
                  ★
                </button>
              ))}
            </div>
          </div>

          <div className="mt-7">
            <label className="text-sm text-zinc-400">
              Category
            </label>

            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="mt-2 w-full rounded-xl border border-white/10 bg-black px-4 py-3"
            >
              <option value="general">General</option>
              <option value="bug">Bug</option>
              <option value="feature">Feature Request</option>
              <option value="question">Question</option>
            </select>
          </div>

          <div className="mt-5">
            <label className="text-sm text-zinc-400">
              Feature
            </label>

            <select
              value={feature}
              onChange={(e) => setFeature(e.target.value)}
              className="mt-2 w-full rounded-xl border border-white/10 bg-black px-4 py-3"
            >
              <option>AI Tutor</option>
              <option>Quiz</option>
              <option>Study Plan</option>
              <option>Subjects</option>
              <option>Materials</option>
              <option>Teacher Portal</option>
              <option>Admin Portal</option>
              <option>Other</option>
            </select>
          </div>

          <div className="mt-5">
            <label className="text-sm text-zinc-400">
              Title
            </label>

            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Example: Quiz needs more questions"
              className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 outline-none"
            />
          </div>

          <div className="mt-5">
            <label className="text-sm text-zinc-400">
              Your feedback
            </label>

            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={7}
              placeholder="Tell us what happened, what you liked, or what should change..."
              className="mt-2 w-full resize-none rounded-xl border border-white/10 bg-black/30 p-4 leading-7 outline-none"
            />
          </div>

          {error && (
            <div className="mt-4 rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-300">
              {error}
            </div>
          )}

          <button
            onClick={submit}
            disabled={sending}
            className="mt-5 w-full rounded-xl bg-gradient-to-r from-cyan-300 to-violet-400 px-5 py-3.5 font-black text-black disabled:opacity-50"
          >
            {sending ? "Sending..." : "Submit Feedback →"}
          </button>
        </section>
      </div>
    </main>
  );
}
