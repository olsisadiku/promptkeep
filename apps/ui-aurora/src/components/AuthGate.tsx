import { useState } from "react";
import { communityEnabled, sendLoginCode, verifyLoginCode } from "@spl/shared-ui";
import { Button, IconLibrary, Spinner } from "../ui";
import { useApp } from "../store";

// Shown only on the website, when no Supabase session exists yet. The desktop
// app never renders this — it reads/writes the local filesystem with no login.
export function AuthGate() {
  const { signedIn, toast } = useApp();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);

  const configured = communityEnabled();

  const send = async () => {
    setBusy(true);
    try {
      await sendLoginCode(email.trim());
      setStage("code");
      toast("Check your email for a 6-digit code", "info");
    } catch (e) {
      toast(String(e), "error");
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    try {
      await verifyLoginCode(email.trim(), code.trim());
      await signedIn();
    } catch (e) {
      toast(String(e), "error");
      setBusy(false);
    }
  };

  return (
    <div className="flex h-screen items-center justify-center px-6" style={{ background: "var(--bg)" }}>
      <div
        className="w-full max-w-sm rounded-2xl border p-7"
        style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }}
      >
        <div className="mb-5 flex items-center gap-2.5">
          <span style={{ color: "var(--accent)" }}>
            <IconLibrary size={26} />
          </span>
          <div>
            <h1 className="text-[18px] font-semibold" style={{ fontFamily: "var(--font-sans)" }}>
              PromptKeep
            </h1>
            <p className="text-[12px] text-[var(--text-soft)]">Your prompts, in the cloud.</p>
          </div>
        </div>

        {!configured ? (
          <p className="text-[13px] text-[var(--danger)]">
            This site isn’t configured yet — the deployment is missing its Supabase credentials
            (<code>VITE_SUPABASE_URL</code> / <code>VITE_SUPABASE_ANON_KEY</code>).
          </p>
        ) : stage === "email" ? (
          <div className="space-y-3">
            <p className="text-[12.5px] text-[var(--text-soft)]">
              Sign in with your email — we’ll send a one-time code, no password needed.
            </p>
            <input
              type="email"
              value={email}
              autoFocus
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && email.includes("@") && send()}
              placeholder="you@example.com"
              className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
              style={{ borderColor: "var(--border-strong)" }}
            />
            <Button variant="primary" onClick={send} disabled={busy || !email.includes("@")}>
              {busy ? <Spinner /> : "Send code"}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-[12.5px] text-[var(--text-soft)]">
              Enter the 6-digit code we emailed to <span className="font-medium">{email}</span>.
            </p>
            <input
              value={code}
              autoFocus
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && code.length >= 6 && verify()}
              placeholder="123456"
              inputMode="numeric"
              className="w-full rounded-lg border bg-transparent px-3 py-2 text-center text-lg tracking-widest outline-none focus:border-[var(--accent)]"
              style={{ borderColor: "var(--border-strong)" }}
            />
            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStage("email")} disabled={busy}>
                Back
              </Button>
              <Button variant="primary" onClick={verify} disabled={busy || code.length < 6}>
                {busy ? <Spinner /> : "Verify & sign in"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
