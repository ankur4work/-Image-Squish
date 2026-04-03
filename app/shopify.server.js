import "@shopify/shopify-app-remix/adapters/node";
import {
  AppDistribution,
  DeliveryMethod,
  shopifyApp,
  BillingInterval,
} from "@shopify/shopify-app-remix/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import { restResources } from "@shopify/shopify-api/rest/admin/2025-04";
import prisma from "./db.server";

export const FREE_PLAN = "Free plan";
export const MONTHLY_PLAN = "Monthly subscription";
export const PRO_MONTHLY_PLAN = "Pro Monthly subscription";
export const apiVersion = "2025-04";

function isWebhookRegistrationErrorBypassable(error) {
  const message = String(error?.message || "");
  return message.includes("403") || message.includes("Forbidden");
}

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  restResources,
  isEmbeddedApp: true,

  billing: {
    [FREE_PLAN]: {
      amount: 0,
      currencyCode: "USD",
      interval: BillingInterval.OneTime, // Free plan treated as one-time for 3 days usage
      trialDays: 3,
    },
    [MONTHLY_PLAN]: {
      lineItems: [
        {
          amount: 30,
          currencyCode: "USD",
          interval: BillingInterval.Every30Days,
        },
      ],
      trialDays: 3,
    },
    [PRO_MONTHLY_PLAN]: {
      lineItems: [
        {
          amount: 150,
          currencyCode: "USD",
          interval: BillingInterval.Every30Days,
        },
      ],
    },
  },

  webhooks: {
    APP_UNINSTALLED: {
      deliveryMethod: DeliveryMethod.Http,
      callbackUrl: "/webhooks",
    },
  },
  hooks: {
    afterAuth: async ({ session }) => {
      try {
        await shopify.registerWebhooks({ session });
      } catch (error) {
        if (process.env.NODE_ENV !== "production" && isWebhookRegistrationErrorBypassable(error)) {
          console.warn("Webhook registration failed during local auth; continuing without blocking dev.", error);
          return;
        }

        throw error;
      }
    },
  },
  future: {
    v3_webhookAdminContext: true,
    v3_authenticatePublic: true,
    unstable_newEmbeddedAuthStrategy: true,
    expiringOfflineAccessTokens: true,
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
