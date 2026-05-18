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
import { PersistentLink } from "./components/PersistentLink";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export async function loader({ request }) {
  const [{ authenticate, billingEnabled, PLAN_NAME, PLAN_AMOUNT }, { getUsageEntitlement }] =
    await Promise.all([import("../shopify.server"), import("../lib/billing.server")]);
  const { billing, session } = await authenticate.admin(request);

  const entitlement = billingEnabled
    ? await getUsageEntitlement({
        request,
        billing,
        session,
        plans: [PLAN_NAME],
      })
    : {
        hasPaidPlan: false,
        freeUsageCount: 0,
        freeUsageLimit: 0,
        freeUsageRemaining: 0,
        quotaExceeded: false,
        canProcess: true,
      };

  return json({
    apiKey: process.env.SHOPIFY_API_KEY,
    billingEnabled,
    planName: PLAN_NAME,
    planAmount: PLAN_AMOUNT,
    ...entitlement,
  });
}

export default function App() {
  const { apiKey } = useLoaderData();
  const navigation = useNavigation();
  const isLoading = navigation.state === "loading";

  if (!apiKey) {
    return (
      <div style={{ padding: "2rem", textAlign: "center" }}>
        <Spinner accessibilityLabel="Initializing..." size="large" />
      </div>
    );
  }

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
      ) : (
        <Suspense fallback={<Spinner accessibilityLabel="Loading..." size="large" />}>
          <Outlet />
        </Suspense>
      )}
    </AppProvider>
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
