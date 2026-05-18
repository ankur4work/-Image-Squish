import { redirect } from "@remix-run/node";
import prisma from "../db.server";
import { sessionStorage, BILLING_TEST } from "../shopify.server";

export const FREE_USAGE_LIMIT = Number(process.env.FREE_USAGE_LIMIT) || 20;

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
    return await billing.check({ plans, isTest: BILLING_TEST });
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

export async function getOrCreateShopUsage(shop, accessToken = "") {
  return prisma.shop.upsert({
    where: { shop },
    update: accessToken ? { accessToken } : {},
    create: {
      shop,
      accessToken,
    },
  });
}

export async function getUsageEntitlement({ request, billing, session, plans }) {
  const billingCheck = await getBillingStatusOrFree({
    request,
    billing,
    session,
    plans,
  });

  const hasPaidPlan =
    billingCheck.hasActivePayment && billingCheck.appSubscriptions.length > 0;

  const usage = await getOrCreateShopUsage(session.shop, session.accessToken || "");
  const freeUsageCount = usage.freeUsageCount || 0;
  const freeUsageLimit = FREE_USAGE_LIMIT;
  const freeUsageRemaining = Math.max(0, freeUsageLimit - freeUsageCount);
  const quotaExceeded = !hasPaidPlan && freeUsageRemaining <= 0;

  return {
    hasPaidPlan,
    freeUsageCount,
    freeUsageLimit,
    freeUsageRemaining,
    quotaExceeded,
    canProcess: hasPaidPlan || freeUsageRemaining > 0,
  };
}

export async function incrementFreeUsage(shop) {
  return prisma.shop.update({
    where: { shop },
    data: {
      freeUsageCount: {
        increment: 1,
      },
    },
  });
}

export function getUpgradeMessage(freeUsageLimit = FREE_USAGE_LIMIT) {
  return `You have used all ${freeUsageLimit} free image operations. Upgrade to continue.`;
}
