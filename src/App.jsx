import { useState } from "react";

export default function App() {
  const [jd, setJd] = useState("");
  const [resume, setResume] = useState("");
  const [errors, setErrors] = useState({ jd: "", resume: "" });
  const [loading, setLoading] = useState(false);

  const validate = () => {
    const next = { jd: "", resume: "" };
    if (!jd.trim()) next.jd = "Please paste the Job Description.";
    if (!resume.trim()) next.resume = "Please paste your resume.";
    setErrors(next);
    return !next.jd && !next.resume;
  };

  const handleOptimise = async () => {
    if (!validate()) return;

    try {
      setLoading(true);
      // TODO: replace this with your real API call
      console.log("Optimising resume...");
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const onChangeJd = (value) => {
    setJd(value);
    if (errors.jd && value.trim()) setErrors((prev) => ({ ...prev, jd: "" }));
  };

  const onChangeResume = (value) => {
    setResume(value);
    if (errors.resume && value.trim()) setErrors((prev) => ({ ...prev, resume: "" }));
  };

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="text-2xl font-semibold">Resume Tailor</h1>

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          {/* JD */}
          <div>
            <label htmlFor="jd" className="mb-2 block text-sm font-medium">
              Job Description
            </label>
            <textarea
              id="jd"
              className={`h-[360px] w-full resize-vertical rounded-xl border p-3 text-sm outline-none focus:ring-2 ${
                errors.jd ? "border-red-500 ring-red-200" : "border-neutral-300 focus:ring-indigo-200"
              }`}
              placeholder="Paste JD…"
              value={jd}
              onChange={(e) => onChangeJd(e.target.value)}
            />
            {errors.jd ? (
              <p className="mt-1 text-xs text-red-600">{errors.jd}</p>
            ) : (
              <p className="mt-1 text-xs text-neutral-500">
                Tip: include responsibilities and requirements.
              </p>
            )}
          </div>

          {/* Resume */}
          <div>
            <label htmlFor="resume" className="mb-2 block text-sm font-medium">
              Resume
            </label>
            <textarea
              id="resume"
              className={`h-[360px] w-full resize-vertical rounded-xl border p-3 text-sm outline-none focus:ring-2 ${
                errors.resume ? "border-red-500 ring-red-200" : "border-neutral-300 focus:ring-indigo-200"
              }`}
              placeholder="Paste your resume…"
              value={resume}
              onChange={(e) => onChangeResume(e.target.value)}
            />
            {errors.resume ? (
              <p className="mt-1 text-xs text-red-600">{errors.resume}</p>
            ) : (
              <p className="mt-1 text-xs text-neutral-500">Plain text works best.</p>
            )}
          </div>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <button
            type="button"
            onClick={handleOptimise}
            disabled={loading}
            className={`rounded-xl px-4 py-2 text-sm font-medium shadow-sm transition
              ${loading
                ? "cursor-not-allowed bg-neutral-300 text-neutral-600"
                : "bg-indigo-600 text-white hover:bg-indigo-700 active:scale-[0.99]"}
            `}
          >
            {loading ? "Optimising…" : "Optimise resume"}
          </button>
        </div>
      </div>
    </div>
  );
}
