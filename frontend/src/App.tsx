import { Routes, Route } from "react-router-dom";
import { ProtectedRoute } from "./components/protected-route";
import { Login } from "./pages/Login";
import Sidebar from "./pages/Sidebar";
import { Welcome } from "./pages/Welcome";
import { Processing } from "./pages/Processing";
import ChatPage from "./pages/Chat";
import ErrorPage from "./pages/Error";
import { Navigate } from "react-router-dom";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/something-went-wrong" element={<ErrorPage />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <Sidebar>
              <Routes>
                <Route path="/" element={<Welcome />} />
                <Route path="/settings" element={<div>Settings Content</div>} />
                <Route path="/c/:sessionId" element={<ChatPage />} />
                <Route path="/process/:ingestionId?" element={<Processing />} />
                <Route
                  path="*"
                  element={<Navigate to="/something-went-wrong" replace />}
                />
              </Routes>
            </Sidebar>
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<ErrorPage />} />
    </Routes>
  );
}
