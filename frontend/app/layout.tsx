import type { Metadata, Viewport } from "next";
import "./globals.css";
import Navbar from "@/components/layout/Navbar";
import { courierPrime } from "./fonts";
import ClientInit from "@/components/ClientInit"; // <-- Tambahin ini

export const metadata: Metadata = {
  title: "Parodee",
  description: "",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={courierPrime.variable}>
      <body className={`font-courier tracking-tight`}>
        <ClientInit />
        <Navbar />
        <div className="md:px-80 md:py-10 px-10">{children}</div>
      </body>
    </html>
  );
}
