"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { signupSchema, type SignupFormValues } from "@/lib/validations/auth";

export default function SignupPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      displayName: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  const onSubmit = async (values: SignupFormValues) => {
    setError(null);
    const normalizedEmail = values.email.trim().toLowerCase();
    const normalizedPassword = values.password.trim();

    const signupResponse = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName: values.displayName,
        email: normalizedEmail,
        password: normalizedPassword,
      }),
    });

    if (!signupResponse.ok) {
      const signupData = (await signupResponse.json()) as {
        message?: string;
        error?: string;
      };
      setError(signupData.message ?? signupData.error ?? "Signup failed");
      return;
    }

    // Retry a few times in case backend/session propagation is briefly delayed.
    let signInResult:
      | Awaited<ReturnType<typeof signIn>>
      | null = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      signInResult = await signIn("credentials", {
        email: normalizedEmail,
        password: normalizedPassword,
        autoFromSignup: "1",
        redirect: false,
      });

      if (signInResult && !signInResult.error) {
        break;
      }

      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
    }

    if (!signInResult || signInResult.error) {
      setError(
        signInResult?.error
          ? `Signup successful, but automatic login failed (${signInResult.error})`
          : "Signup successful, but automatic login failed",
      );
      router.push(`/login?email=${encodeURIComponent(normalizedEmail)}`);
      return;
    }

    router.push("/");
    router.refresh();
  };

  return (
    <div className="bg-background flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6 rounded-2xl border p-6 shadow-sm">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Create your account</h1>
          <p className="text-muted-foreground text-sm">
            Sign up to start chatting with your AI assistant.
          </p>
        </div>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="displayName">
              Display name
            </label>
            <Input
              id="displayName"
              placeholder="Your name"
              {...form.register("displayName")}
            />
            {form.formState.errors.displayName && (
              <p className="text-destructive text-sm">
                {form.formState.errors.displayName.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="email">
              Email
            </label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              {...form.register("email")}
            />
            {form.formState.errors.email && (
              <p className="text-destructive text-sm">
                {form.formState.errors.email.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="password">
              Password
            </label>
            <Input
              id="password"
              type="password"
              placeholder="At least 8 characters"
              {...form.register("password")}
            />
            {form.formState.errors.password && (
              <p className="text-destructive text-sm">
                {form.formState.errors.password.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="confirmPassword">
              Confirm password
            </label>
            <Input
              id="confirmPassword"
              type="password"
              placeholder="Re-enter your password"
              {...form.register("confirmPassword")}
            />
            {form.formState.errors.confirmPassword && (
              <p className="text-destructive text-sm">
                {form.formState.errors.confirmPassword.message}
              </p>
            )}
          </div>

          {error && <p className="text-destructive text-sm">{error}</p>}

          <Button
            type="submit"
            className="w-full"
            disabled={form.formState.isSubmitting}
          >
            {form.formState.isSubmitting ? "Creating account..." : "Sign up"}
          </Button>
        </form>

        <p className="text-muted-foreground text-sm">
          Already have an account?{" "}
          <Link href="/login" className="text-foreground font-medium underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
