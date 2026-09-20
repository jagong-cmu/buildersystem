import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { DomainSwitch } from "@/ui/DomainSwitch";
import { NarrationToggle } from "@/ui/NarrationToggle";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Reality Compiler",
  description: "Instructions generated from the parts you actually have.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <header className="flex items-center gap-4 px-5 py-3 border-b" style={{ borderColor: "var(--line)" }}>
          <Link href="/" className="font-semibold tracking-tight">
            Reality Compiler
          </Link>
          <nav className="flex gap-3 text-sm muted">
            <Link href="/scan">Scan</Link>
            <Link href="/builds">Builds</Link>
            <Link href="/live">Live</Link>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <DomainSwitch />
            <NarrationToggle />
          </div>
        </header>
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
