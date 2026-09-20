"use client";
import * as React from "react";

/**
 * The shell renders links through this component so the app can inject `next/link`
 * without making the presentational components depend on the router:
 *
 *   import Link from "next/link";
 *   <ShellLinkProvider component={Link}> … </ShellLinkProvider>
 *
 * Without a provider it renders a plain <a>.
 */
export type ShellLinkComponent = React.ComponentType<
  React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children?: React.ReactNode }
>;

const DefaultLink: ShellLinkComponent = React.forwardRef<HTMLAnchorElement, React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }>(
  function DefaultLink(props, ref) {
    return <a ref={ref} {...props} />;
  },
) as unknown as ShellLinkComponent;

const LinkContext = React.createContext<ShellLinkComponent>(DefaultLink);

export function ShellLinkProvider({ component, children }: { component: ShellLinkComponent; children: React.ReactNode }) {
  return <LinkContext.Provider value={component}>{children}</LinkContext.Provider>;
}

export function ShellLink(props: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const Comp = React.useContext(LinkContext);
  return <Comp {...props} />;
}
