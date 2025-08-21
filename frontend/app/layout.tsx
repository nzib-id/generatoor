import type { Metadata } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";
import { Toaster } from "react-hot-toast";
import localFont from "next/font/local";
import ClientInit from "@/components/ClientInit"; // <-- Tambahin ini

const bytesized = localFont({
  src: "../public/fonts/Bytesized-Regular.ttf",
  variable: "--font-bytesized",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Parodee",
  description: "",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={bytesized.variable}>
      <body className={`font-bytesized antialiased`}>
        <ClientInit /> {/* Tambahin ini */}
        <Navbar />
        <div className="md:px-50 md:py-10 px-10">{children}</div>
      </body>
    </html>
  );
}
