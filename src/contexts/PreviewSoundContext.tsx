import { createContext, useContext, useState, ReactNode } from "react";

interface PreviewSoundContextType {
  previewSoundEnabled: boolean;
  setPreviewSoundEnabled: (enabled: boolean) => void;
  togglePreviewSound: () => void;
}

const PreviewSoundContext = createContext<PreviewSoundContextType>({
  previewSoundEnabled: false,
  setPreviewSoundEnabled: () => {},
  togglePreviewSound: () => {},
});

export const usePreviewSound = () => useContext(PreviewSoundContext);

export const PreviewSoundProvider = ({ children }: { children: ReactNode }) => {
  const [previewSoundEnabled, setPreviewSoundEnabled] = useState(() => {
    try {
      return localStorage.getItem("preview-sound") === "true";
    } catch {
      return false;
    }
  });

  const togglePreviewSound = () => {
    setPreviewSoundEnabled((prev) => {
      const next = !prev;
      try { localStorage.setItem("preview-sound", String(next)); } catch {}
      return next;
    });
  };

  return (
    <PreviewSoundContext.Provider value={{ previewSoundEnabled, setPreviewSoundEnabled, togglePreviewSound }}>
      {children}
    </PreviewSoundContext.Provider>
  );
};
