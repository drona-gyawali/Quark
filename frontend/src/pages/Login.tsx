import { dbClient } from "../lib/supabase";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { GoogleIcon } from "../components/google-Icon";
import { Link } from "react-router-dom";
import { Footer } from "@/components/footer";

export function Login() {
  const handleGoogleLogin = async () => {
    const { error } = await dbClient.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}`,
        queryParams: {
          prompt: "select_account",
        },
      },
    });

    if (error) console.error("Supabase Auth Error:", error.message);
  };

  return (
    <>
      <div className="flex flex-col min-h-screen bg-zinc-950">
        <div className="relative flex flex-1 flex-col items-center justify-center p-4 pt-9 text-zinc-50 overflow-hidden">
          <div className="absolute top-[-10%] left-[-10%] h-[50%] w-[50%] rounded-full bg-zinc-500/5 blur-[120px]" />
          <div className="absolute bottom-[-10%] right-[-10%] h-[50%] w-[50%] rounded-full bg-zinc-500/5 blur-[120px]" />

          <Card className="z-10 w-full max-w-sm border-zinc-800 bg-zinc-900/50 shadow-2xl backdrop-blur-md">
            <CardHeader className="space-y-1 text-center">
              <CardTitle className="text-2xl font-semibold tracking-tight">
                Welcome back
              </CardTitle>
              <CardDescription className="text-zinc-400">
                Continue to your Quark account
              </CardDescription>
            </CardHeader>

            <CardContent className="grid gap-6">
              <Button
                variant="outline"
                className="w-full cursor-pointer py-6 text-base font-medium border-zinc-700 bg-zinc-900 transition-all hover:bg-zinc-800 hover:text-white"
                onClick={handleGoogleLogin}
              >
                <GoogleIcon />
                Continue with Google
              </Button>

              <div className="text-center text-xs text-zinc-500 leading-relaxed">
                By continuing, you agree to our{" "}
                <Link
                  to="/terms"
                  className="underline underline-offset-4 text-zinc-500 hover:text-zinc-200"
                >
                  Terms of Service
                </Link>{" "}
                and{" "}
                <Link
                  to="/privacy"
                  className="underline underline-offset-4 text-zinc-500 hover:text-zinc-200"
                >
                  Privacy Policy
                </Link>
                .
              </div>
            </CardContent>
          </Card>
        </div>
        <Footer />
      </div>
    </>
  );
}
