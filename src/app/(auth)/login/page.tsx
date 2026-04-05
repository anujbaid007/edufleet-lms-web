"use client";

import { useState } from "react";
import { login } from "@/lib/actions/auth";
import { ClayInput } from "@/components/ui/clay-input";
import { ClayButton } from "@/components/ui/clay-button";
import { LogIn } from "lucide-react";
import Image from "next/image";

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const result = await login(formData);

    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      {/* Background decorations */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-orange-primary/5 rounded-full blur-3xl animate-float" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-orange-primary/4 rounded-full blur-3xl animate-float-slow" />
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Logo */}
        <div className="text-center mb-8">
          <Image
            src="/logo-icon.png"
            alt="EduFleet"
            width={72}
            height={72}
            className="mx-auto rounded-clay"
            priority
          />
          <Image
            src="/logo.png"
            alt="EduFleet"
            width={180}
            height={50}
            className="mx-auto mt-1.5"
          />
          <p className="text-muted text-sm mt-0.5">Learning Management System</p>
        </div>

        {/* Login Card */}
        <div className="clay-card !p-8">
          <h2 className="text-xl font-bold text-heading font-poppins mb-1">Welcome back</h2>
          <p className="text-muted text-sm mb-6">Sign in with your credentials</p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <ClayInput
              id="email"
              name="email"
              type="email"
              label="User ID (Email)"
              placeholder="Enter your user ID"
              required
              autoComplete="email"
            />

            <ClayInput
              id="password"
              name="password"
              type="password"
              label="Password"
              placeholder="Enter your password"
              required
              autoComplete="current-password"
            />

            {error && (
              <div className="px-4 py-3 rounded-clay-sm bg-red-50 border border-red-200 text-red-600 text-sm font-medium">
                {error}
              </div>
            )}

            <ClayButton type="submit" loading={loading} className="w-full" size="lg">
              <LogIn className="w-4 h-4" />
              Sign In
            </ClayButton>
          </form>

          <p className="text-xs text-muted text-center mt-6">
            Credentials are provided by your organization administrator.
          </p>
        </div>
      </div>
    </div>
  );
}
