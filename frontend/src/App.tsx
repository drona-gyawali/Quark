import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { ProtectedRoute } from "./components/protected-route";

const Login = lazy(() =>
  import("./pages/Login").then((m) => ({ default: m.Login })),
);
const Sidebar = lazy(() => import("./pages/Sidebar"));
const Welcome = lazy(() =>
  import("./pages/Welcome").then((m) => ({ default: m.Welcome })),
);
const Processing = lazy(() =>
  import("./pages/Processing").then((m) => ({ default: m.Processing })),
);
const ChatPage = lazy(() => import("./pages/Chat"));
const ErrorPage = lazy(() => import("./pages/Error"));

export default function App() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-black text-white">
          <Loader2 className="animate-spin" />
        </div>
      }
    >
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/something-went-wrong" element={<ErrorPage />} />

        <Route
          path="/process/:ingestionId?"
          element={
            <ProtectedRoute>
              <Processing />
            </ProtectedRoute>
          }
        />
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <Sidebar>
                <Suspense
                  fallback={
                    <div className="flex h-full w-full items-center justify-center bg-black">
                      <Loader2 size={17} className="animate-spin text-white" />
                    </div>
                  }
                >
                  <Routes>
                    <Route path="/" element={<Welcome />} />
                    <Route
                      path="/settings"
                      element={
                        <div className="text-white">Settings Content</div>
                      }
                    />
                    <Route path="/c/:sessionId" element={<ChatPage />} />
                    <Route
                      path="*"
                      element={<Navigate to="/something-went-wrong" replace />}
                    />
                  </Routes>
                </Suspense>
              </Sidebar>
            </ProtectedRoute>
          }
        />
      </Routes>
    </Suspense>
  );
}
