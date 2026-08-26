import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { fetchBackgrounds, fetchCatalog } from "./api/client";
import { LegalGate } from "./components/LegalGate";
import { useStore } from "./mix/store";
import { LibraryPage } from "./pages/LibraryPage";
import { PlayPage } from "./pages/PlayPage";

export function App() {
  const setCatalog = useStore((s) => s.setCatalog);
  const setBackgrounds = useStore((s) => s.setBackgrounds);

  useEffect(() => {
    void fetchCatalog().then(setCatalog);
    void fetchBackgrounds().then(setBackgrounds);
  }, [setCatalog, setBackgrounds]);

  return (
    <LegalGate>
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
