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

export const apiVersion = "2025-04";
export const billingEnabled = process.env.BILLING_ENABLED === "true";
export const PLAN_NAME = process.env.BILLING_PLAN_NAME || "Pro";
export const PLAN_AMOUNT = Number(process.env.BILLING_AMOUNT) || 5;

function isWebhookRegistrationErrorBypassable(error) {
  const message = String(error?.message || "");
  return message.includes("403") || message.includes("Forbidden");
}

const billingConfig = billingEnabled
  ? {
      [PLAN_NAME]: {
        lineItems: [
          {
            amount: PLAN_AMOUNT,
            currencyCode: "USD",
            interval: BillingInterval.Every30Days,
          },
        ],
      },
    }
  : undefined;

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

  ...(billingConfig ? { billing: billingConfig } : {}),

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
