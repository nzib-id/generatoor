import Link from "next/link";

export default function Navbar() {
  return (
    <nav className="grid border px-30 py-10">
      <Link href={"/"} className="font-extrabold text-5xl">
        Parodee
      </Link>
    </nav>
  );
}
