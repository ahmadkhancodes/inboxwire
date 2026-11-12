"use client";
import { ButtonLink } from "@/components/ui/button";
import { useSignedIn } from "@/lib/auth/use-signed-in";
import { sessionCta } from "@/lib/marketing-session";
import type { ComponentProps } from "react";

/** Hero / closing / compare button: signup label for visitors, "Open dashboard" once a session exists. */
export function SessionCta({ href, label, ...rest }: { href: string; label: string } & Omit<ComponentProps<typeof ButtonLink>, "href" | "children">) {
  const t = sessionCta({ href, label }, useSignedIn());
  return <ButtonLink href={t.href} {...rest}>{t.label}</ButtonLink>;
}
