"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { t as tFn, type Lang } from "@/lib/i18n";
import { updateLanguage } from "@/lib/actions/language";

interface LanguageContextValue {
  lang: Lang;
  t: (key: string, vars?: Record<string, string | number>) => string;
  setLang: (lang: Lang) => void;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({
  initialLang,
  children,
}: {
  initialLang: Lang;
  children: React.ReactNode;
}) {
  const [lang, setLangState] = useState<Lang>(initialLang);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((newLang: Lang) => {
    setLangState(newLang);
    updateLanguage(newLang);
  }, []);

  const tClient = useCallback(
    (key: string, vars?: Record<string, string | number>) =>
      tFn(lang, key, vars),
    [lang]
  );

  return (
    <LanguageContext.Provider value={{ lang, t: tClient, setLang }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used inside <LanguageProvider>");
  return ctx;
}
