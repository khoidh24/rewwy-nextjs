"use client";

import { Toaster as Sonner } from "sonner";

export default function Toaster() {
  return (
    <Sonner
      richColors
      position="top-right"
      toastOptions={{
        duration: 3500,
      }}
    />
  );
}
