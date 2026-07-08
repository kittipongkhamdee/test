import { HashRouter, Route, Routes } from "react-router-dom";
import { StoreProvider } from "./data/store";
import AppShell from "./components/AppShell";
import Dashboard from "./pages/Dashboard";
import TeacherForm from "./pages/TeacherForm";
import Submissions from "./pages/Submissions";
import Scheduler from "./pages/Scheduler";
import Publish from "./pages/Publish";
import AdminSettings from "./pages/AdminSettings";

export default function App() {
  return (
    <StoreProvider>
      <HashRouter>
        <Routes>
          {/* Teacher-facing survey form stands alone, no admin sidebar */}
          <Route path="form" element={<TeacherForm />} />
          <Route element={<AppShell />}>
            <Route index element={<Dashboard />} />
            <Route path="submissions" element={<Submissions />} />
            <Route path="scheduler" element={<Scheduler />} />
            <Route path="publish" element={<Publish />} />
            <Route path="admin" element={<AdminSettings />} />
          </Route>
        </Routes>
      </HashRouter>
    </StoreProvider>
  );
}
