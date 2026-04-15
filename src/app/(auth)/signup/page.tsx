import Link from "next/link";
import AuthForm from "@/components/AuthForm";

export default function SignupPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-primary p-4">
      {/* Background gradient orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-accent/5 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-accent/3 blur-3xl" />
      </div>

      <div className="w-full max-w-md animate-scale-in relative">
        {/* Logo / Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-accent/10 border border-accent/20 mb-4">
            <span className="text-3xl">🍳</span>
          </div>
          <h1 className="text-2xl font-bold text-text-primary">
            Create your account
          </h1>
          <p className="text-text-secondary mt-1">
            Start organizing your recipes
          </p>
        </div>

        {/* Form Card */}
        <div className="glass rounded-2xl p-8">
          <AuthForm mode="signup" />
        </div>

        {/* Footer */}
        <p className="text-center mt-6 text-sm text-text-secondary">
          Already have an account?{" "}
          <Link
            href="/login"
            className="text-accent hover:text-accent-hover transition-colors font-medium"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
