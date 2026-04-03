import { Link, useLocation } from "@remix-run/react";

export function PersistentLink({ to, children, ...props }) {
  const location = useLocation();
  const currentUrl = new URL(`${location.pathname}${location.search}`, "http://localhost");
  const destinationUrl = new URL(to, "http://localhost");
  const currentParams = new URLSearchParams(currentUrl.search);
  const destinationParams = new URLSearchParams(destinationUrl.search);

  for (const [key, value] of currentParams.entries()) {
    if (!destinationParams.has(key)) {
      destinationParams.set(key, value);
    }
  }

  const finalSearch = destinationParams.toString();
  const finalTo = `${destinationUrl.pathname}${finalSearch ? `?${finalSearch}` : ""}`;

  return (
    <Link to={finalTo} {...props}>
      {children}
    </Link>
  );
}
