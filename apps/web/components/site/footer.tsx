import Link from "next/link";
import { ECHO_ACCOUNT_FACTORY, EXPLORER_URL, NETWORK_NAME } from "@/lib/somnia";

const COLUMNS = [
  {
    heading: "Product",
    links: [
      { href: "/leaderboard", label: "Leaderboard" },
      { href: "/#how", label: "How it works" },
      { href: "/#custody", label: "Custody" },
      { href: "/connect", label: "Deploy an account" },
    ],
  },
  {
    heading: "Proof",
    links: [
      { href: "/#calibration", label: "Why calibration" },
      { href: "/#risk", label: "Risk" },
      {
        href: "https://github.com/jadonamite/echonome",
        label: "Source",
        external: true,
      },
    ],
  },
  {
    heading: "Legal",
    links: [
      { href: "/terms", label: "Terms and Conditions" },
      { href: "/privacy", label: "Privacy Policy" },
      { href: "/cookies", label: "Cookie Policy" },
    ],
  },
];

/**
 * The bottom bar carries the network and the factory address rather than burying them on a
 * docs page. A follower deploying a contract should be able to check what they are about to
 * deploy from without leaving the page that is asking them to.
 */
export function SiteFooter() {
  return (
    <footer className="border-t border-rule">
      <div className="mx-auto w-full max-w-6xl px-6 py-14">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-1">
            <p className="text-base font-semibold tracking-tight">Echonome</p>
            <p className="mt-2 max-w-xs text-sm leading-relaxed text-ink-3">
              Every trade is a sound. Every copy is its echo.
            </p>
          </div>

          {COLUMNS.map((column) => (
            <div key={column.heading}>
              <p className="font-mono text-xs uppercase tracking-widest text-ink-3">
                {column.heading}
              </p>
              <ul className="mt-4 space-y-2.5">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-ink-2 transition-colors hover:text-ink"
                      {...("external" in link && link.external
                        ? { target: "_blank", rel: "noreferrer" }
                        : {})}
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 flex flex-col gap-3 border-t border-rule pt-6 text-xs text-ink-3 md:flex-row md:items-center md:justify-between">
          <p>Echonome {new Date().getFullYear()}. Running on {NETWORK_NAME}.</p>
          <p className="font-mono">
            Factory{" "}
            <a
              href={`${EXPLORER_URL}/address/${ECHO_ACCOUNT_FACTORY}`}
              target="_blank"
              rel="noreferrer"
              className="text-accent underline-offset-4 hover:underline"
            >
              {ECHO_ACCOUNT_FACTORY}
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
