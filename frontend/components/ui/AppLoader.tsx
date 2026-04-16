// frontend/components/ui/AppLoader.tsx
"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

const MESSAGES = [
  "Iniciando sesión segura...",
  "Cargando tu cartera...",
  "Verificando permisos...",
  "Sincronizando datos de ruta...",
  "Preparando el panel...",
  "Casi listo..."
];

interface AppLoaderProps {
  visible: boolean;
}

const AppLoader = ({ visible }: AppLoaderProps): JSX.Element | null => {
  const [messageIndex, setMessageIndex] = useState(0);
  const [fade, setFade] = useState(true);
  const [hiding, setHiding] = useState(false);

  // Rotate messages every 1.8 s
  useEffect(() => {
    if (!visible) return;
    const interval = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setMessageIndex((prev) => (prev + 1) % MESSAGES.length);
        setFade(true);
      }, 300);
    }, 1800);
    return () => clearInterval(interval);
  }, [visible]);

  // Fade-out when visibility turns off
  useEffect(() => {
    if (!visible) {
      setHiding(true);
    }
  }, [visible]);

  if (!visible && hiding) return null;

  return (
    <div
      className="app-loader-overlay"
      style={{ opacity: hiding ? 0 : 1 }}
      aria-live="polite"
      aria-label="Cargando aplicación"
    >
      {/* Logo */}
      <div className="app-loader-logo">
        <Image
          src="/brand/ruut_logo_1.svg"
          alt="RutaPay"
          width={120}
          height={40}
          priority
        />
      </div>

      {/* Spinner */}
      <div className="app-loader-spinner-wrap">
        <div className="app-loader-spinner" />
      </div>

      {/* Rotating message */}
      <p
        className="app-loader-message"
        style={{ opacity: fade ? 1 : 0 }}
      >
        {MESSAGES[messageIndex]}
      </p>

      {/* Subtle version tag */}
      <span className="app-loader-brand">RutaPay</span>
    </div>
  );
};

export default AppLoader;
