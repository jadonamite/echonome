import Link from "next/link";
import { SiteFooter } from "@/components/site/footer";
import { LogoLockup } from "@/components/site/logo";

const PAGES = [
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
  { href: "/cookies", label: "Cookies" },
];

/**
 * Legal pages get the same voice and the same typography as everything else. A policy set in
 * grey 12px inside a scroll box is a policy written to be skipped, and on a product that asks
 * people to put money into a contract, these are the pages most worth reading.
 */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-rule">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-6 px-6 py-5">
          <Link href="/" aria-label="Echonome home">
            <LogoLockup variant="white" height={24} />
          </Link>
          <nav className="flex gap-5">
            {PAGES.map((page) => (
              <Link
                key={page.href}
                href={page.href}
                className="text-sm text-ink-3 transition-colors hover:text-ink"
              >
                {page.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16 sm:py-20">
        <article
          className="
            [&_h1]:text-display-sm [&_h1]:font-semibold [&_h1]:tracking-tight
            [&_h2]:mt-14 [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:tracking-tight
            [&_p]:mt-5 [&_p]:text-base [&_p]:leading-relaxed [&_p]:text-ink-2
            [&_li]:mt-3 [&_li]:text-base [&_li]:leading-relaxed [&_li]:text-ink-2
            [&_ul]:mt-5 [&_ul]:list-disc [&_ul]:pl-6
            [&_a]:text-accent [&_a]:underline [&_a]:underline-offset-4
            [&_code]:font-mono [&_code]:text-sm [&_code]:text-ink
          "
        >
          {children}
        </article>
      </main>

      <SiteFooter />
    </div>
  );
}
