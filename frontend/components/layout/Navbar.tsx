// components/Navbar.tsx
import Link from "next/link";
import UploadTraits from "../modal/UploadModal"; // <— tambahin ini

const navLinks = [
  { href: "/preview", label: "Preview" },
  { href: "/traits", label: "Traits" },
  { href: "/layers", label: "Layers" },
  { href: "/rules", label: "Rules" },
];

export default function Navbar() {
  return (
    <nav
      aria-label="Main navigation"
      className="flex justify-center md:text-2xl text-2xl h-20 border-b border-[#8E8E8E] items-center md:px-50"
    >
      <Link
        href="/"
        aria-label="Go to homepage"
        className="w-6 flex gap-5 flex-none items-center justify-center"
      >
        <img src="/logo.svg" className="h-full object-contain" alt="Parodee" />
        <span>Generatoor</span>
      </Link>

      <div className="md:flex md:flex-row hidden md:flex-1 gap-25 justify-end items-center">
        {navLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="active:translate-y-1"
          >
            {link.label}
          </Link>
        ))}
        {/* Tombol + Modal Upload */}
        <UploadTraits />
      </div>
    </nav>
  );
}
