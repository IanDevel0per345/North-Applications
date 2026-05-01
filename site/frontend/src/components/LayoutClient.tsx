"use client";

import { usePathname } from "next/navigation";
import clsx from "clsx";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";

export default function LayoutClient({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const hideLayout = pathname?.startsWith("/dashboard/app/");

  return (
    <div className="relative flex flex-col h-screen">
      {!hideLayout && <Navbar />}
      <main className={clsx("flex-grow", !hideLayout && "container mx-auto max-w-7xl mt-40 mb-10 px-6")}>
        {children}
      </main>
      {!hideLayout && <Footer />}
    </div>
  );
}
