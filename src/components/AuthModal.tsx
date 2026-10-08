import React, { useState } from "react";
import { Mail, Lock, User, AlertCircle, ArrowRight, ArrowLeft, RefreshCw, Trophy, Smartphone } from "lucide-react";
import { supabase, parseSupabaseError } from "../lib/supabase.ts";
import { validateDisplayNameFormat } from "../lib/authHelpers.ts";
import { ensureProfile } from "../lib/leaderboard.ts";

type AuthModalMode = "choice" | "signup" | "login";

interface AuthModalProps {
  currentDisplayName: string;
  onResolved: (opts: { isAnonymous: boolean; displayName?: string }) => void;
}

/**
 * Mandatory first-run modal (once per browser session): play as a guest on
 * this device, or create a free account / log in to appear on the daily
 * leaderboard and keep your name across devices. An anonymous session
 * already exists by the time this renders (GamePage establishes it first),
 * so "Continue as guest" is just a dismiss, and "Create a free account"
 * upgrades that same anonymous session in place via supabase.auth.updateUser.
 */
export const AuthModal: React.FC<AuthModalProps> = ({ currentDisplayName, onResolved }) => {
  const [mode, setMode] = useState<AuthModalMode>("choice");
  const [displayName, setDisplayName] = useState(
    currentDisplayName && !/^player$/i.test(currentDisplayName) ? currentDisplayName : ""
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [confirmationPending, setConfirmationPending] = useState(false);

  const handleGuest = () => onResolved({ isAnonymous: true });

  const handleSignUpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const trimmedName = displayName.trim();
    const trimmedEmail = email.trim();
    const nameFormat = validateDisplayNameFormat(trimmedName);
    if (!nameFormat.valid) {
      setErrorMsg(nameFormat.error || "Display name must be between 2 and 20 characters");
      return;
    }
    if (!trimmedEmail || !trimmedEmail.includes("@")) {
      setErrorMsg("Please enter a valid email address");
      return;
    }
    if (!password || password.length < 6) {
      setErrorMsg("Please choose a password (at least 6 characters)");
      return;
    }

    setIsSubmitting(true);
    try {
      const { error: profileError } = await supabase.rpc("wordezy_scramble_update_profile", {
        p_display_name: trimmedName,
      });
      if (profileError) throw profileError;

      const { error: authError } = await supabase.auth.updateUser({ email: trimmedEmail, password });
      if (authError) throw authError;

      setConfirmationPending(true);
    } catch (err) {
      console.error("Error creating account:", err);
      const msg = (err as { message?: string })?.message || "Failed to create account. Please try again.";
      if (/already registered|email exists/i.test(msg)) {
        setErrorMsg("An account with this email already exists. Try logging in instead.");
      } else {
        setErrorMsg(msg);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !trimmedEmail.includes("@")) {
      setErrorMsg("Please enter your email");
      return;
    }
    if (!password) {
      setErrorMsg("Please enter your password");
      return;
    }

    setIsSubmitting(true);
    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email: trimmedEmail, password });
      if (signInError) throw signInError;

      if (data.user) {
        // An account from Wordezy or Wordezy Search works here too — this
        // copies its name over the first time instead of showing "Player".
        const name = await ensureProfile().catch(() => null);
        onResolved({ isAnonymous: false, displayName: name || "Player" });
      }
    } catch (err) {
      console.error("Sign in error:", err);
      setErrorMsg(await parseSupabaseError(err).catch(() => (err as { message?: string })?.message || "Invalid email or password"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
      <div
        className="w-full max-w-lg bg-surface border border-rule rounded-2xl p-6 sm:p-8 shadow-xl shadow-black/50 relative space-y-6 max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {confirmationPending ? (
          <div className="space-y-5 py-3">
            <div className="bg-correct-soft border border-correct-dim/40 rounded-xl p-6 text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-ink border border-correct-dim/50 flex items-center justify-center text-correct mx-auto">
                <Mail className="w-6 h-6" />
              </div>
              <p className="text-sm font-medium text-paper leading-relaxed">
                Almost there — check your email to confirm your account. Your progress is already saved and will
                stay with you.
              </p>
              <p className="text-xs text-muted">
                We sent a confirmation link to <span className="text-paper font-mono font-medium">{email}</span>.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onResolved({ isAnonymous: true, displayName: displayName.trim() || undefined })}
              className="w-full py-3 px-4 rounded-lg bg-correct hover:bg-correct-dim text-paper font-medium text-sm transition-colors cursor-pointer"
            >
              Continue to game
            </button>
          </div>
        ) : mode === "choice" ? (
          <div className="space-y-6">
            <div className="text-center space-y-2 pt-1">
              <h2 className="text-2xl sm:text-[28px] font-display font-semibold text-paper">How do you want to play?</h2>
              <p className="text-sm text-muted max-w-sm mx-auto leading-relaxed">
                Choose how you'd like to experience Wordezy Scramble. You can create an account anytime.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                onClick={handleGuest}
                className="group relative p-5 rounded-xl bg-ink hover:bg-surface-high border border-rule transition-colors text-left flex flex-col justify-between gap-4 cursor-pointer active:scale-[0.99]"
              >
                <div className="space-y-2">
                  <div className="w-10 h-10 rounded-lg bg-surface-high border border-rule flex items-center justify-center text-muted group-hover:text-paper transition-colors">
                    <Smartphone className="w-5 h-5" />
                  </div>
                  <h3 className="text-base font-semibold text-paper font-display">Continue as guest</h3>
                  <p className="text-xs text-muted leading-relaxed">
                    Play right away. Your progress stays on this device and won't appear on the leaderboard.
                  </p>
                </div>
                <div className="flex items-center gap-1.5 text-xs font-medium text-paper">
                  <span>Play as guest</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </div>
              </button>

              <button
                type="button"
                onClick={() => setMode("signup")}
                className="group relative p-5 rounded-xl bg-correct-soft hover:bg-correct-soft/70 border border-correct-dim/50 hover:border-correct-dim transition-colors text-left flex flex-col justify-between gap-4 cursor-pointer active:scale-[0.99]"
              >
                <div className="space-y-2">
                  <div className="w-10 h-10 rounded-lg bg-ink border border-correct-dim/50 flex items-center justify-center text-correct">
                    <Trophy className="w-5 h-5" />
                  </div>
                  <h3 className="text-base font-semibold text-correct font-display">Create a free account</h3>
                  <p className="text-xs text-paper/80 leading-relaxed">
                    Keep your name and compete on the daily leaderboard.
                  </p>
                </div>
                <div className="flex items-center gap-1.5 text-xs font-medium text-correct">
                  <span>Sign up free</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </div>
              </button>
            </div>

            <div className="pt-3 border-t border-rule text-center">
              <p className="text-xs text-muted">
                Already registered?{" "}
                <button
                  type="button"
                  onClick={() => setMode("login")}
                  className="text-correct hover:text-correct/80 font-medium underline underline-offset-4 cursor-pointer"
                >
                  Log in to your account
                </button>
              </p>
            </div>
          </div>
        ) : mode === "signup" ? (
          <div className="space-y-5">
            <div className="flex items-center justify-between border-b border-rule pb-3">
              <button
                type="button"
                onClick={() => setMode("choice")}
                className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-paper transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to options</span>
              </button>
              <span className="text-[11px] font-mono text-correct">Free registration</span>
            </div>

            <div className="text-center space-y-1">
              <h2 className="text-2xl font-display font-semibold text-paper">Create a free account</h2>
              <p className="text-xs text-muted">Save your name and join the daily leaderboard.</p>
            </div>

            <form onSubmit={handleSignUpSubmit} className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-muted font-mono">
                    Display name <span className="text-correct">*</span>
                  </label>
                  <span className="text-[10px] font-mono text-muted">{displayName.length}/20</span>
                </div>
                <div className="relative">
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => { setDisplayName(e.target.value); setErrorMsg(null); }}
                    maxLength={20}
                    minLength={2}
                    required
                    placeholder="e.g. WordWizard"
                    className="w-full px-3.5 py-2.5 rounded-lg bg-ink border border-rule text-paper text-sm focus:outline-none focus:border-correct pl-10"
                  />
                  <User className="w-4 h-4 text-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-muted mb-1.5 font-mono">
                  Email address <span className="text-correct">*</span>
                </label>
                <div className="relative">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setErrorMsg(null); }}
                    required
                    placeholder="you@example.com"
                    className="w-full px-3.5 py-2.5 rounded-lg bg-ink border border-rule text-paper text-sm focus:outline-none focus:border-correct pl-10"
                  />
                  <Mail className="w-4 h-4 text-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-muted mb-1.5 font-mono">
                  Choose a password <span className="text-correct">*</span>
                </label>
                <div className="relative">
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setErrorMsg(null); }}
                    minLength={6}
                    required
                    placeholder="At least 6 characters"
                    className="w-full px-3.5 py-2.5 rounded-lg bg-ink border border-rule text-paper text-sm focus:outline-none focus:border-correct pl-10"
                  />
                  <Lock className="w-4 h-4 text-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              {errorMsg && (
                <p className="text-xs text-danger bg-danger/10 border border-danger/40 p-2.5 rounded-lg flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{errorMsg}</span>
                </p>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 px-4 rounded-lg bg-correct hover:bg-correct-dim active:scale-[0.99] text-paper font-medium text-sm transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 mt-2"
              >
                {isSubmitting ? (
                  <><RefreshCw className="w-4 h-4 animate-spin" /><span>Creating account…</span></>
                ) : (
                  <span>Create account &amp; join leaderboard</span>
                )}
              </button>
            </form>

            <div className="pt-2 text-center text-xs border-t border-rule">
              <p className="text-muted">
                Already registered?{" "}
                <button type="button" onClick={() => setMode("login")} className="text-correct hover:text-correct/80 font-medium underline underline-offset-4 cursor-pointer">
                  Log in
                </button>
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex items-center justify-between border-b border-rule pb-3">
              <button
                type="button"
                onClick={() => setMode("choice")}
                className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-paper transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to options</span>
              </button>
              <span className="text-[11px] font-mono text-correct">Member sign in</span>
            </div>

            <div className="text-center space-y-1">
              <h2 className="text-2xl font-display font-semibold text-paper">Log in to Wordezy Scramble</h2>
              <p className="text-xs text-muted">Access your saved name and leaderboard rank.</p>
            </div>

            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-muted mb-1.5 font-mono">
                  Email address <span className="text-correct">*</span>
                </label>
                <div className="relative">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setErrorMsg(null); }}
                    required
                    placeholder="you@example.com"
                    className="w-full px-3.5 py-2.5 rounded-lg bg-ink border border-rule text-paper text-sm focus:outline-none focus:border-correct pl-10"
                  />
                  <Mail className="w-4 h-4 text-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-muted mb-1.5 font-mono">
                  Password <span className="text-correct">*</span>
                </label>
                <div className="relative">
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setErrorMsg(null); }}
                    required
                    placeholder="Your password"
                    className="w-full px-3.5 py-2.5 rounded-lg bg-ink border border-rule text-paper text-sm focus:outline-none focus:border-correct pl-10"
                  />
                  <Lock className="w-4 h-4 text-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              {errorMsg && (
                <p className="text-xs text-danger bg-danger/10 border border-danger/40 p-2.5 rounded-lg flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{errorMsg}</span>
                </p>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 px-4 rounded-lg bg-correct hover:bg-correct-dim active:scale-[0.99] text-paper font-medium text-sm transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 mt-2"
              >
                {isSubmitting ? (
                  <><RefreshCw className="w-4 h-4 animate-spin" /><span>Signing in…</span></>
                ) : (
                  <span>Log in</span>
                )}
              </button>
            </form>

            <div className="pt-2 text-center text-xs border-t border-rule">
              <p className="text-muted">
                Don't have an account?{" "}
                <button type="button" onClick={() => setMode("signup")} className="text-correct hover:text-correct/80 font-medium underline underline-offset-4 cursor-pointer">
                  Create free account
                </button>
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
