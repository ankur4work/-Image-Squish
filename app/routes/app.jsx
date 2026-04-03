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
import { authenticate } from "../shopify.server";
import { BRAND } from "../lib/brand";
import { PersistentLink } from "./components/PersistentLink";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export async function loader({ request }) {
  await authenticate.admin(request);

  return json({
    apiKey: process.env.SHOPIFY_API_KEY,
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
        <PersistentLink to="/app/intro">{BRAND.overviewLabel}</PersistentLink>
        <PersistentLink to="/app">{BRAND.plansLabel}</PersistentLink>
        <PersistentLink to="/app/html">{BRAND.studioLabel}</PersistentLink>
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
  return (
    <div style={{ padding: "2rem", textAlign: "center" }}>
      <Spinner accessibilityLabel="Loading..." size="large" />
    </div>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
