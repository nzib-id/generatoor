import Image from "next/image";
import Link from "next/link";

export default function Navbar() {
  return (
    <nav className="flex justify-center md:text-3xl text-4xl md:gap-5 h-20 border-b-1 border-[#8E8E8E] items-center md:px-70">
      <Link
        href={"/"}
        className="w-6 flex gap-5 flex-none items-center justify-center"
      >
        <img src={"/logo.svg"} className="h-full object-contain" />
        Generatoor
      </Link>
      <div className="md:flex md:flex-row md:inline-blocked hidden md:flex-1 gap-25 justify-end">
        <Link href="/preview" className="active:translate-y-1">
          Preview
        </Link>
        <Link href="/traits" className="active:translate-y-1">
          Traits
        </Link>

        <Link href="/layers" className="active:translate-y-1">
          Layers
        </Link>
        <Link href="/rules" className="active:translate-y-1">
          Rules
        </Link>
      </div>
    </nav>
  );
}
