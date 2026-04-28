import { useState } from "react";
import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useHashLocation } from "wouter/use-hash-location";
import familyImg from "@assets/family.jpeg";
import { sbUsers } from "@/lib/supabaseClient";
import type { UserRole } from "@/lib/store";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { login, setCurrentUser, setRole } = useAppStore();
  const { toast } = useToast();
  const [, navigate] = useHashLocation();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Try Supabase-backed auth first (production)
      const user = await sbUsers.verifyLogin(username, password);
      if (user) {
        login();
        setCurrentUser(user.display_name);
        setRole(user.role as UserRole);
        toast({
          title: `Welcome back, ${user.display_name}`,
          description: user.role === "admin"
            ? "Full admin access granted."
            : "Family dashboard ready.",
        });
        navigate("/dashboard");
      } else {
        toast({
          title: "Access Denied",
          description: "Invalid credentials. Please try again.",
          variant: "destructive",
        });
      }
    } catch (err) {
      // Supabase unavailable — deny access
      toast({
        title: "Login Error",
        description: "Cannot connect to auth server. Please try again.",
        variant: "destructive",
      });
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden login-bg">
      {/* Background gold orbs */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div
          className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] rounded-full opacity-5"
          style={{ background: "radial-gradient(circle, hsl(43,85%,55%), transparent)" }}
        />
        <div
          className="absolute bottom-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full opacity-5"
          style={{ background: "radial-gradient(circle, hsl(43,85%,55%), transparent)" }}
        />
      </div>

      <div
        className="w-full max-w-5xl mx-4 grid lg:grid-cols-2 gap-0 overflow-hidden rounded-2xl shadow-2xl animate-fade-up"
        style={{ border: "1px solid rgba(196,165,90,0.15)" }}
      >
        {/* Left — Family Image */}
        <div className="relative hidden lg:block">
          <img
            src={familyImg}
            alt="Shahrokh Family"
            className="w-full h-full object-cover object-center"
            style={{ minHeight: "580px" }}
          />
          {/* Overlay gradient */}
          <div
            className="absolute inset-0"
            style={{ background: "linear-gradient(135deg, rgba(10,12,24,0.1) 0%, rgba(10,12,24,0.4) 100%)" }}
          />
          {/* Bottom caption */}
          <div
            className="absolute bottom-0 left-0 right-0 p-8"
            style={{ background: "linear-gradient(to top, rgba(10,12,24,0.9), transparent)" }}
          >
            <div className="flex items-center gap-2 mb-2">
              <div className="w-1 h-6 rounded-full" style={{ background: "hsl(43,85%,55%)" }} />
              <span className="text-xs font-semibold tracking-[0.2em] uppercase text-white/70">
                Family Office
              </span>
            </div>
            <p className="text-white/90 text-sm">Roham · Fara · Yara · Jana</p>
            <p className="text-white/60 text-xs mt-1">Brisbane, Queensland · Australia</p>
          </div>
        </div>

        {/* Right — Login Form */}
        <div
          className="flex flex-col justify-center p-10 lg:p-12"
          style={{ background: "rgba(12,14,28,0.95)", backdropFilter: "blur(24px)" }}
        >
          {/* Logo */}
          <div className="flex items-center gap-3 mb-10">
            <svg width="36" height="36" viewBox="0 0 36 36" fill="none" aria-label="SFFP Logo">
              <rect width="36" height="36" rx="8" fill="hsl(43,85%,55%)" />
              <path
                d="M10 24 L18 12 L26 24"
                stroke="hsl(224,40%,12%)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
              <path d="M10 24 L26 24" stroke="hsl(224,40%,12%)" strokeWidth="2.5" strokeLinecap="round" />
              <circle cx="18" cy="12" r="2" fill="hsl(224,40%,12%)" />
            </svg>
            <div>
              <p
                className="text-xs font-semibold tracking-[0.15em] uppercase"
                style={{ color: "hsl(43,85%,55%)" }}
              >
                Private
              </p>
              <p className="text-xs text-white/40 font-medium">Wealth Platform</p>
            </div>
          </div>

          <div className="mb-8">
            <h1 className="text-2xl font-bold text-white mb-2 leading-tight">
              Shahrokh Family
              <br />
              <span className="gold-shimmer">Financial Planner</span>
            </h1>
            <p className="text-white/50 text-sm mt-3">Secure Wealth Planning Dashboard</p>
            <div className="flex gap-2 mt-3 flex-wrap">
              {["Property", "Stocks", "Crypto", "Budget", "Future Planning"].map((tag) => (
                <span
                  key={tag}
                  className="text-xs px-2 py-0.5 rounded-full border font-medium"
                  style={{
                    borderColor: "rgba(196,165,90,0.3)",
                    color: "hsl(43,85%,65%)",
                    background: "rgba(196,165,90,0.05)",
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>

          {/* Enter key submits via form onSubmit */}
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-white/40 mb-2">
                Username
              </label>
              <Input
                data-testid="input-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Roham or Fara"
                className="h-12 text-sm"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  color: "white",
                }}
                autoComplete="username"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-white/40 mb-2">
                Password
              </label>
              <Input
                data-testid="input-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                className="h-12 text-sm"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  color: "white",
                }}
                autoComplete="current-password"
              />
            </div>

            <Button
              data-testid="button-access-dashboard"
              type="submit"
              className="w-full h-12 text-sm font-semibold tracking-wide mt-2"
              disabled={loading}
              style={{
                background: loading
                  ? "rgba(196,165,90,0.4)"
                  : "linear-gradient(135deg, hsl(43,85%,55%), hsl(43,70%,42%))",
                color: "hsl(224,40%,8%)",
                border: "none",
              }}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Authenticating...
                </span>
              ) : (
                "Access Dashboard"
              )}
            </Button>
          </form>

          <div className="mt-8 pt-6 border-t border-white/5">
            <p className="text-white/20 text-xs text-center">
              256-bit encrypted · Private &amp; Secure · Family Office Platform
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
