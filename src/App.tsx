import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { fetchBackgrounds, fetchCatalog } from "./api/client";
import { LegalGate } from "./components/LegalGate";
import { ToastHost } from "./components/Toast";
import { useStore } from "./mix/store";
import { LibraryPage } from "./pages/LibraryPage";
import { PlayPage } from "./pages/PlayPage";

function ThemeSync() {
  const location = useLocation();
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-product", "lingjian");
    root.setAttribute("data-density", "comfortable");
    root.setAttribute("data-theme", location.pathname.startsWith("/play") ? "ink" : "dark");
  }, [location.pathname]);
  return null;
}

export function App() {
  const setCatalog = useStore((s) => s.setCatalog);
  const failCatalog = useStore((s) => s.failCatalog);
  const setBackgrounds = useStore((s) => s.setBackgrounds);

  useEffect(() => {
    void fetchCatalog().then(setCatalog).catch(failCatalog);
    void fetchBackgrounds().then(setBackgrounds).catch(() => undefined);
  }, [setCatalog, failCatalog, setBackgrounds]);

  return (
    <LegalGate>
      <ThemeSync />
      <ToastHost />
      <Routes>
        <Route path="/" element={<LibraryPage />} />
        <Route path="/play/file/:fileId" element={<PlayPage />} />
        <Route path="/play/category/:categoryId" element={<PlayPage />} />
        <Route path="/play/mix/:mixId" element={<PlayPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </LegalGate>
  );
}
