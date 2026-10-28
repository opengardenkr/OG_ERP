import Link from "next/link";
import { OpenEventButton } from "@/components/event-composer";

import type { PortalEvent } from "@/lib/calendar/types";

export function EventLink({
  event,
  className,
}: {
  event: PortalEvent;
  className?: string;
}) {
  if (event.source === "google") return <OpenEventButton event={event} className={className} />;
  if (event.href?.startsWith("/")) return <Link href={event.href} title={event.title} className={className}>{event.title}</Link>;
  return <span className={className}>{event.title}</span>;
}
