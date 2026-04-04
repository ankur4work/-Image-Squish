export const BRAND = {
  name: "PixelMint Studio",
  shortName: "PixelMint",
  tagline: "Storefront image polish for modern brands",
  overviewLabel: "Overview",
  plansLabel: "Plans",
  studioLabel: "Studio",
};

export function getAppReturnUrl({ request, shopDomain, path = "/app" }) {
  const appUrl = (process.env.SHOPIFY_APP_URL || "").replace(/\/$/, "");
  const requestUrl = request ? new URL(request.url) : null;
  const host = requestUrl?.searchParams.get("host");

  if (!appUrl) {
    const params = new URLSearchParams();
    params.set("shop", shopDomain);

    if (host) {
      params.set("host", host);
    }

    const separator = path.includes("?") ? "&" : "?";
    return `${path}${separator}${params.toString()}`;
  }

  const returnUrl = new URL(path, `${appUrl}/`);
  returnUrl.searchParams.set("shop", shopDomain);

  if (host) {
    // Embedded app redirects need the Shopify host so App Bridge can restore
    // the admin context after approval screens such as billing.
    returnUrl.searchParams.set("host", host);
  }

  return returnUrl.toString();
}

export function isBillingTestMode() {
  return true;
}

export function getDisplayPlanName(planName) {
  if (planName === "Scale") {
    return "Scale";
  }

  if (planName === "Core") {
    return "Core";
  }

  return "Starter";
}
