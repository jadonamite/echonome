import { WalletButton } from "@/components/wallet-button";
import { AppFooter } from "@/components/site/app-footer";
import { NavBar } from "@/components/site/nav-bar";

/**
 * The chrome every signed-in surface shares. It lives in a route group rather than the
 * root layout so that `/` can be full-bleed: a landing page inside a max-width container
 * with a border-bottom header is a landing page that cannot use a photograph.
 */
const NAV = [
  { href: "/echo-rank", label: "Echo Rank" },
  { href: "/feed", label: "Feed" },
  { href: "/connect", label: "Connect" },
  { href: "/me", label: "My echoes" },
  { href: "/settings", label: "Settings" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      {/*
        Sticky, because these are working screens: on /me you check your account while reading
        your echoes, and a nav you can only reach by scrolling back to the top is a nav you
        stop using.

        `bg-plane` is required, not decorative: a transparent sticky header lets rows scroll
        through the text.

        Same NavBar the landing page uses — links left, mark centred, action right, collapsing
        to a hamburger below md. These screens previously carried their own arrangement, which
        is how the two drifted apart in the first place.
      */}
      <header className="sticky top-0 z-40 border-b border-rule bg-plane">
        <div className="mx-auto w-full max-w-5xl px-6 py-4">
          <NavBar links={NAV} surface="dark" action={<WalletButton />} logoHeight={26} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">{children}</main>

      <AppFooter />
    </div>
  );
}
