import {
  BlockStack,
  Button,
  Card,
  InlineGrid,
  List,
  Page,
  Text,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { BRAND } from "../lib/brand";
import { PersistentLink } from "./components/PersistentLink";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return json({});
};

const workflowPoints = [
  "Compress product images to speed up collection and product pages.",
  "Apply custom watermarks to protect visuals used outside your store.",
  "Manage image updates directly inside Shopify admin.",
];

const detailCards = [
  {
    icon: "1",
    title: "Connect your catalog",
    body: "Image Squish pulls in your existing products automatically — no manual uploads needed.",
  },
  {
    icon: "2",
    title: "Optimize in one click",
    body: "Compress or watermark any product image directly from the studio workspace.",
  },
  {
    icon: "3",
    title: "Stay in control",
    body: "Every change stays inside Shopify admin. No external tools, no broken workflows.",
  },
];

export default function OverviewPage() {
  return (
    <Page>
      <TitleBar title={BRAND.name} />
      <BlockStack gap="500">
        {/* Hero */}
        <div
          style={{
            borderRadius: "16px",
            padding: "40px 36px",
            background: "linear-gradient(135deg, #312E81 0%, #4F46E5 50%, #6366F1 100%)",
            color: "#fff",
          }}
        >
          <div>
            <div
              style={{
                display: "inline-block",
                padding: "4px 12px",
                borderRadius: "6px",
                background: "rgba(255,255,255,0.15)",
                fontSize: "12px",
                fontWeight: 600,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                marginBottom: "16px",
              }}
            >
              Overview
            </div>

            <h1
              style={{
                margin: "0 0 12px",
                fontSize: "32px",
                fontWeight: 700,
                lineHeight: 1.15,
                letterSpacing: "-0.02em",
              }}
            >
              Smaller images. Faster pages. Less hassle.
            </h1>
            <p
              style={{
                margin: "0 0 24px",
                fontSize: "16px",
                lineHeight: 1.6,
                opacity: 0.85,
                maxWidth: "560px",
              }}
            >
              {BRAND.name} compresses and watermarks your product images right inside
              Shopify admin — no exports, no extra tools.
            </p>

            <PersistentLink to="/app/html">
              <Button variant="primary">Open studio</Button>
            </PersistentLink>
          </div>
        </div>

        {/* How it works */}
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingLg">
              How it works
            </Text>
            <InlineGrid columns={{ xs: 1, md: 3 }} gap="400">
              {detailCards.map((card) => (
                <div
                  key={card.title}
                  style={{
                    padding: "20px",
                    borderRadius: "12px",
                    background: "#F8FAFC",
                    border: "1px solid #E2E8F0",
                  }}
                >
                  <div
                    style={{
                      width: "32px",
                      height: "32px",
                      borderRadius: "8px",
                      background: "#EEF2FF",
                      color: "#4F46E5",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 700,
                      fontSize: "14px",
                      marginBottom: "12px",
                    }}
                  >
                    {card.icon}
                  </div>
                  <Text as="h3" variant="headingMd">
                    {card.title}
                  </Text>
                  <div style={{ marginTop: "6px" }}>
                    <Text as="p" variant="bodyMd" tone="subdued">
                      {card.body}
                    </Text>
                  </div>
                </div>
              ))}
            </InlineGrid>
          </BlockStack>
        </Card>

        {/* Details */}
        <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                What you can do
              </Text>
              <List type="bullet">
                {workflowPoints.map((point) => (
                  <List.Item key={point}>{point}</List.Item>
                ))}
              </List>
            </BlockStack>
          </Card>

          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Built for Shopify
              </Text>
              <Text as="p" variant="bodyMd">
                Image Squish runs as an embedded app inside your Shopify admin.
                Compress and watermark images without leaving your workflow.
              </Text>
              <Text as="p" variant="bodyMd">
                Every change writes back to your product catalog directly — no
                manual re-uploads.
              </Text>
            </BlockStack>
          </Card>
        </InlineGrid>
      </BlockStack>
    </Page>
  );
}
