import {
  Outlet,
  useLoaderData,
  useNavigation,
  useRouteError,
} from "@remix-run/react";
import { json } from "@remix-run/node";
import { Suspense } from "react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu } from "@shopify/app-bridge-react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import { Spinner } from "@shopify/polaris";
import { authenticate, billingEnabled, PLAN_NAME, PLAN_AMOUNT } from "../shopify.server";
import { getBillingStatusOrFree } from "../lib/billing.server";
import { PersistentLink } from "./components/PersistentLink";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export async function loader({ request }) {
  const { billing, session } = await authenticate.admin(request);

  let hasPaidPlan = true;

  if (billingEnabled) {
    const billingCheck = await getBillingStatusOrFree({
      request,
      billing,
      session,
      plans: [PLAN_NAME],
    });
    hasPaidPlan = billingCheck.hasActivePayment && billingCheck.appSubscriptions.length > 0;
  }

  return json({
    apiKey: process.env.SHOPIFY_API_KEY,
    billingEnabled,
    hasPaidPlan,
    planName: PLAN_NAME,
    planAmount: PLAN_AMOUNT,
  });
}

export default function App() {
  const { apiKey, billingEnabled: showBilling, hasPaidPlan, planName, planAmount } = useLoaderData();
  const navigation = useNavigation();
  const isLoading = navigation.state === "loading";

  if (!apiKey) {
    return (
      <div style={{ padding: "2rem", textAlign: "center" }}>
        <Spinner accessibilityLabel="Initializing..." size="large" />
      </div>
    );
  }

  // If billing is enabled and user hasn't paid, show paywall instead of app
  const showPaywall = showBilling && !hasPaidPlan;

  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      <NavMenu>
        <PersistentLink to="/app">Overview</PersistentLink>
        <PersistentLink to="/app/html">Studio</PersistentLink>
      </NavMenu>

      {isLoading ? (
        <div style={{ padding: "2rem", textAlign: "center" }}>
          <Spinner accessibilityLabel="Loading" size="large" />
        </div>
      ) : showPaywall ? (
        <PaywallScreen planName={planName} planAmount={planAmount} />
      ) : (
        <Suspense fallback={<Spinner accessibilityLabel="Loading..." size="large" />}>
          <Outlet />
        </Suspense>
      )}
    </AppProvider>
  );
}

function PaywallScreen({ planName, planAmount }) {
  return (
    <div style={{ padding: "40px 24px", maxWidth: "480px", margin: "0 auto", textAlign: "center" }}>
      <div
        style={{
          borderRadius: "16px",
          padding: "40px 32px",
          background: "linear-gradient(135deg, #312E81 0%, #4F46E5 50%, #6366F1 100%)",
          color: "#fff",
        }}
      >
        <p
          style={{
            margin: "0 0 8px",
            fontSize: "12px",
            fontWeight: 600,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            opacity: 0.7,
          }}
        >
          {planName} plan
        </p>
        <p style={{ margin: "0 0 4px", fontSize: "48px", fontWeight: 700, lineHeight: 1 }}>
          ${planAmount}
        </p>
        <p style={{ margin: "0 0 28px", fontSize: "15px", opacity: 0.8 }}>per month</p>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            maxWidth: "280px",
            margin: "0 auto 28px",
            textAlign: "left",
          }}
        >
          {[
            "One-click image compression",
            "Custom watermark uploads",
            "Unlimited product processing",
            "Works inside Shopify admin",
          ].map((f) => (
            <div key={f} style={{ display: "flex", gap: "8px", fontSize: "15px" }}>
              <span style={{ flexShrink: 0 }}>&#10003;</span>
              {f}
            </div>
          ))}
        </div>

        <PersistentLink to="/app/upgrade">
          <button
            type="button"
            style={{
              border: "none",
              borderRadius: "10px",
              padding: "14px 32px",
              fontSize: "15px",
              fontWeight: 700,
              background: "#fff",
              color: "#4F46E5",
              cursor: "pointer",
              width: "100%",
            }}
          >
            Subscribe — ${planAmount}/mo
          </button>
        </PersistentLink>
      </div>
    </div>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  console.error("Route error:", error);
  return boundary.error(error);
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
