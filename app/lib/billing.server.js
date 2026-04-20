import { redirect } from "@remix-run/node";
import { sessionStorage } from "../shopify.server";

function isBillingStatusFallbackError(error) {
  const message = String(error?.message || "");
  return message.includes("403") || message.includes("Forbidden") || message.includes("502") || message.includes("Bad Gateway");
}

function hasRefreshAttempt(request) {
  const url = new URL(request.url);
  return url.searchParams.get("__session_refreshed") === "1";
}

async function invalidateStoredSession(session) {
  session.accessToken = undefined;
  session.expires = undefined;
  await sessionStorage.storeSession(session);
}

export async function refreshBillingSessionIfNeeded({ request, session, error }) {
  if (!request || !session || hasRefreshAttempt(request) || !isBillingStatusFallbackError(error)) {
    return false;
  }

  await invalidateStoredSession(session);

  const url = new URL(request.url);
  url.searchParams.set("__session_refreshed", "1");
  throw redirect(url.toString());
}

export async function requestBillingSafely({
  request,
  billing,
  session,
  plan,
  isTest,
  returnUrl,
}) {
  try {
    return await billing.request({
      plan,
      isTest,
      returnUrl,
    });
  } catch (error) {
    if (error instanceof Response) {
      throw error;
    }

    await refreshBillingSessionIfNeeded({ request, session, error });
    throw error;
  }
}

export async function getBillingStatusOrFree({ request, billing, session, plans }) {
  try {
    return await billing.check({ plans });
  } catch (error) {
    await refreshBillingSessionIfNeeded({ request, session, error });

    if (isBillingStatusFallbackError(error)) {
      console.warn("Billing status check failed; treating store as free.", error);
      return {
        hasActivePayment: false,
        oneTimePurchases: [],
        appSubscriptions: [],
      };
    }

    throw error;
  }
}
