// app/fonts.ts
import { Courier_Prime } from "next/font/google";

export const courierPrime = Courier_Prime({
  weight: ["400", "700"], // regular & bold
  subsets: ["latin"],
  variable: "--font-courier", // biar bisa dipanggil di Tailwind
  display: "swap",
});
