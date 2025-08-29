"use client";

import { useEffect } from "react";
import { useTraitStore } from "@/lib/useTraitStore";
import { Toaster } from "react-hot-toast";

export default function ClientInit() {
  const { fetchAll } = useTraitStore();
  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  return (
    <Toaster
      toastOptions={{
        style: {
          background: "#FFDF0F",
          color: "#262626",
          fontSize: "25px",
          borderRadius: "0",
          padding: "12px 16px",
          textAlign: "center",
          alignItems: "stretch",
        },
        success: {
          style: {
            background: "#10b981",
            color: "#ffffff",
          },
          iconTheme: {
            primary: " #ffffff",
            secondary: "#10b981",
          },
        },
        error: {
          style: { background: "#ef4444", color: "#ffffff" },
          iconTheme: {
            primary: "#ffffff",
            secondary: "#ef4444",
          },
        },
      }}
    />
  );
}
