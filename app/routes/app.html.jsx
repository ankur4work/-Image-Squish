import { json } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import { useEffect, useState } from "react";
import { TitleBar } from "@shopify/app-bridge-react";
import sharp from "sharp";
import FormData from "form-data";
import path from "path";
import fs from "fs";
import { apiVersion, authenticate } from "../shopify.server";
import { BRAND, getDisplayPlanName } from "../lib/brand";
import { getBillingStatusOrFree } from "../lib/billing.server";

const productQuery = `
{
  products(first: 200) {
    edges {
      node {
        id
        title
        media(first: 1) {
          edges {
            node {
              ... on MediaImage {
                id
                image {
                  url
                  altText
                }
              }
            }
          }
        }
      }
    }
  }
}`;

const deleteMediaMutation = `
mutation productDeleteMedia($mediaIds: [ID!]!, $productId: ID!) {
  productDeleteMedia(mediaIds: $mediaIds, productId: $productId) {
    deletedMediaIds
    mediaUserErrors {
      message
    }
  }
}`;

const uploadMediaMutation = `
mutation productCreateMedia($media: [CreateMediaInput!]!, $productId: ID!) {
  productCreateMedia(media: $media, productId: $productId) {
    media {
      id
      alt
      mediaContentType
      status
    }
    mediaUserErrors {
      message
    }
  }
}`;

const stagedUploadsCreateMutation = `
mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
  stagedUploadsCreate(input: $input) {
    stagedTargets {
      url
      resourceUrl
      parameters {
        name
        value
      }
    }
    userErrors {
      field
      message
    }
  }
}`;

export const loader = async ({ request }) => {
  const { billing, session } = await authenticate.admin(request);
  const { shop, accessToken } = session;

  const billingCheck = await getBillingStatusOrFree({
    request,
    billing,
    session,
    plans: ["Core", "Scale"],
  });

  let activePlan = "Free";

  if (billingCheck.hasActivePayment && billingCheck.appSubscriptions.length > 0) {
    activePlan = billingCheck.appSubscriptions[0].name;
  }

  if (!accessToken) {
    return json({
      products: [],
      shop,
      activePlan,
      activeDisplayPlan: getDisplayPlanName(activePlan),
      canCompress: activePlan === "Core" || activePlan === "Scale",
      canWatermark: activePlan === "Scale",
    });
  }

  const response = await fetch(`https://${shop}/admin/api/${apiVersion}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken,
    },
    body: JSON.stringify({ query: productQuery }),
  });

  const result = await response.json();
  const products = result?.data?.products?.edges || [];

  return json({
    products,
    shop,
    activePlan,
    activeDisplayPlan: getDisplayPlanName(activePlan),
    canCompress: activePlan === "Core" || activePlan === "Scale",
    canWatermark: activePlan === "Scale",
  });
};

export const action = async ({ request }) => {
  try {
    const { billing, session } = await authenticate.admin(request);
    const requestFormData = await request.formData();
    const { mediaId, imageSrc, type, productId } = Object.fromEntries(
      requestFormData.entries(),
    );
    const watermarkFile = requestFormData.get("watermark");

    if (!mediaId || !imageSrc || !type || !productId) {
      throw new Error("Missing required fields.");
    }

    const billingCheck = await getBillingStatusOrFree({
      request,
      billing,
      session,
      plans: ["Core", "Scale"],
    });

    let activePlan = "Free";

    if (billingCheck.hasActivePayment && billingCheck.appSubscriptions.length > 0) {
      activePlan = billingCheck.appSubscriptions[0].name;
    }

    if (type === "compress" && activePlan !== "Core" && activePlan !== "Scale") {
      return json(
        {
          success: false,
          message: "Image optimization is available on the Core and Scale plans.",
        },
        { status: 403 },
      );
    }

    if (type === "watermark" && activePlan !== "Scale") {
      return json(
        {
          success: false,
          message: "Watermarking is available on the Scale plan.",
        },
        { status: 403 },
      );
    }

    const { shop, accessToken } = session;

    if (!accessToken) {
      throw new Error("Access token not found.");
    }

    const imageUrl = imageSrc.split("?")[0];
    const imageResponse = await fetch(imageUrl);
    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
    const originalSizeKB = (imageBuffer.length / 1024).toFixed(2);

    let processedBuffer;
    let mimeType = "image/jpeg";
    let fileExtension = "jpg";

    if (type === "compress") {
      processedBuffer = await sharp(imageBuffer)
        .jpeg({ quality: 50, progressive: true })
        .toBuffer();
    } else if (type === "watermark") {
      let watermarkBuffer;

      if (watermarkFile && typeof watermarkFile === "object") {
        watermarkBuffer = Buffer.from(await watermarkFile.arrayBuffer());
      } else {
        const defaultPath = path.resolve("public/watermark.png");
        if (!fs.existsSync(defaultPath)) {
          throw new Error("Default watermark missing.");
        }
        watermarkBuffer = await sharp(defaultPath).resize(100).png().toBuffer();
      }

      processedBuffer = await sharp(imageBuffer)
        .composite([{ input: watermarkBuffer, top: 14, left: 14 }])
        .png()
        .toBuffer();
      mimeType = "image/png";
      fileExtension = "png";
    } else {
      throw new Error("Unknown processing type.");
    }

    const processedSizeKB = (processedBuffer.length / 1024).toFixed(2);
    const filename = `pixelmint-${Date.now()}.${fileExtension}`;

    const stagedUploadResponse = await fetch(
      `https://${shop}/admin/api/${apiVersion}/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": accessToken,
        },
        body: JSON.stringify({
          query: stagedUploadsCreateMutation,
          variables: {
            input: [
              {
                resource: "PRODUCT_IMAGE",
                filename,
                mimeType,
                httpMethod: "POST",
              },
            ],
          },
        }),
      },
    );

    const stagedUploadResult = await stagedUploadResponse.json();
    const stagedUploadErrors = stagedUploadResult?.data?.stagedUploadsCreate?.userErrors;

    if (stagedUploadErrors?.length) {
      throw new Error(
        `Staged upload failed: ${stagedUploadErrors.map((error) => error.message).join(", ")}`,
      );
    }

    const stagedTarget = stagedUploadResult?.data?.stagedUploadsCreate?.stagedTargets?.[0];

    if (!stagedTarget) {
      throw new Error("Failed to receive a staged upload target.");
    }

    const uploadFormData = new FormData();
    stagedTarget.parameters.forEach(({ name, value }) => {
      uploadFormData.append(name, value);
    });
    uploadFormData.append("file", processedBuffer, {
      filename,
      contentType: mimeType,
    });

    const cdnUploadResponse = await fetch(stagedTarget.url, {
      method: "POST",
      body: uploadFormData,
      headers: uploadFormData.getHeaders(),
    });

    if (!cdnUploadResponse.ok) {
      throw new Error(`CDN upload failed with status ${cdnUploadResponse.status}.`);
    }

    const deleteResponse = await fetch(`https://${shop}/admin/api/${apiVersion}/graphql.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body: JSON.stringify({
        query: deleteMediaMutation,
        variables: { mediaIds: [mediaId], productId },
      }),
    });

    const deleteResult = await deleteResponse.json();
    const deleteErrors = deleteResult?.data?.productDeleteMedia?.mediaUserErrors;

    if (deleteErrors?.length) {
      throw new Error(`Delete failed: ${deleteErrors.map((error) => error.message).join(", ")}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));

    const uploadResponse = await fetch(`https://${shop}/admin/api/${apiVersion}/graphql.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body: JSON.stringify({
        query: uploadMediaMutation,
        variables: {
          productId,
          media: [
            {
              originalSource: stagedTarget.resourceUrl,
              mediaContentType: "IMAGE",
              alt: type === "compress" ? "PixelMint optimized image" : "PixelMint watermarked image",
            },
          ],
        },
      }),
    });

    const uploadResult = await uploadResponse.json();
    const uploadErrors = uploadResult?.data?.productCreateMedia?.mediaUserErrors;

    if (uploadErrors?.length) {
      throw new Error(`Upload failed: ${uploadErrors.map((error) => error.message).join(", ")}`);
    }

    const newMediaId = uploadResult?.data?.productCreateMedia?.media?.[0]?.id;

    return json({
      success: true,
      message:
        type === "compress"
          ? "Image optimized successfully."
          : "Watermark applied successfully.",
      originalSizeKB,
      processedSizeKB,
      productId,
      newImageUrl: stagedTarget.resourceUrl,
      newMediaId,
    });
  } catch (error) {
    return json(
      {
        success: false,
        message: error.message || "An unexpected error occurred.",
      },
      { status: 500 },
    );
  }
};

const styles = {
  page: {
    minHeight: "100vh",
    padding: "32px",
    background:
      "radial-gradient(circle at top left, rgba(226, 161, 70, 0.16), transparent 22%), radial-gradient(circle at top right, rgba(20, 91, 92, 0.16), transparent 24%), linear-gradient(180deg, #fbf6ee 0%, #f5efe4 42%, #edf5f1 100%)",
    fontFamily: "'Trebuchet MS', 'Avenir Next', sans-serif",
    color: "#163233",
  },
  shell: {
    maxWidth: "1440px",
    margin: "0 auto",
  },
  hero: {
    borderRadius: "28px",
    padding: "36px",
    background: "linear-gradient(135deg, #0f3d3e 0%, #145b5c 55%, #d18a36 100%)",
    color: "#f8f0e3",
    boxShadow: "0 28px 60px rgba(15, 61, 62, 0.22)",
  },
  heroGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.5fr) minmax(280px, 0.9fr)",
    gap: "28px",
    alignItems: "stretch",
  },
  badge: {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    borderRadius: "999px",
    padding: "8px 14px",
    fontSize: "12px",
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    background: "rgba(255, 255, 255, 0.14)",
    color: "#f8f0e3",
  },
  heroTitle: {
    margin: "0 0 12px",
    fontSize: "clamp(32px, 5vw, 52px)",
    lineHeight: 1.02,
    letterSpacing: "-0.04em",
  },
  heroBody: {
    margin: 0,
    maxWidth: "720px",
    fontSize: "17px",
    lineHeight: 1.6,
    color: "rgba(248, 240, 227, 0.86)",
  },
  heroStats: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: "14px",
    marginTop: "28px",
  },
  statCard: {
    padding: "16px",
    borderRadius: "18px",
    background: "rgba(255, 255, 255, 0.12)",
    border: "1px solid rgba(255, 255, 255, 0.12)",
  },
  statNumber: {
    margin: 0,
    fontSize: "26px",
    fontWeight: 700,
    color: "#fff7ee",
  },
  statLabel: {
    margin: "6px 0 0",
    fontSize: "13px",
    color: "rgba(248, 240, 227, 0.78)",
  },
  sidePanel: {
    borderRadius: "24px",
    padding: "24px",
    background: "rgba(255, 255, 255, 0.14)",
    border: "1px solid rgba(255, 255, 255, 0.14)",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    gap: "18px",
  },
  sideLabel: {
    margin: 0,
    fontSize: "12px",
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "rgba(248, 240, 227, 0.7)",
  },
  sideValue: {
    margin: "8px 0 0",
    fontSize: "28px",
    lineHeight: 1.1,
    color: "#fff7ee",
  },
  sectionGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 340px) minmax(0, 1fr)",
    gap: "24px",
    marginTop: "28px",
  },
  panel: {
    borderRadius: "24px",
    padding: "24px",
    background: "rgba(255, 252, 247, 0.9)",
    border: "1px solid rgba(20, 91, 92, 0.08)",
    boxShadow: "0 20px 50px rgba(20, 91, 92, 0.08)",
  },
  panelTitle: {
    margin: 0,
    fontSize: "22px",
    lineHeight: 1.15,
    color: "#163233",
  },
  panelBody: {
    margin: "10px 0 0",
    fontSize: "14px",
    lineHeight: 1.6,
    color: "#4d6666",
  },
  uploadField: {
    marginTop: "22px",
    padding: "20px",
    borderRadius: "18px",
    border: "1.5px dashed rgba(20, 91, 92, 0.22)",
    background: "#f7f1e7",
    cursor: "pointer",
    display: "block",
  },
  uploadName: {
    marginTop: "14px",
    padding: "12px 14px",
    borderRadius: "14px",
    background: "#e9f4ef",
    color: "#145b5c",
    fontSize: "14px",
    fontWeight: 600,
  },
  noteList: {
    display: "grid",
    gap: "12px",
    marginTop: "18px",
  },
  noteItem: {
    padding: "14px 16px",
    borderRadius: "16px",
    background: "#fff8ef",
    border: "1px solid rgba(209, 138, 54, 0.14)",
    fontSize: "14px",
    lineHeight: 1.55,
    color: "#5a5750",
  },
  banner: {
    marginBottom: "20px",
    borderRadius: "20px",
    padding: "18px 20px",
    boxShadow: "0 18px 44px rgba(15, 61, 62, 0.12)",
  },
  productGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
    gap: "20px",
  },
  productCard: {
    overflow: "hidden",
    borderRadius: "22px",
    background: "#fffdf9",
    border: "1px solid rgba(20, 91, 92, 0.08)",
    boxShadow: "0 20px 44px rgba(22, 50, 51, 0.08)",
  },
  mediaFrame: {
    height: "240px",
    background: "linear-gradient(180deg, #f1ebdf 0%, #ece8e0 100%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "16px",
  },
  mediaImage: {
    maxWidth: "100%",
    maxHeight: "100%",
    objectFit: "contain",
    borderRadius: "14px",
  },
  cardBody: {
    padding: "20px",
  },
  cardTopRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: "12px",
    alignItems: "flex-start",
  },
  productTitle: {
    margin: 0,
    fontSize: "18px",
    lineHeight: 1.2,
    color: "#163233",
  },
  statusPill: {
    flexShrink: 0,
    borderRadius: "999px",
    padding: "8px 12px",
    fontSize: "12px",
    fontWeight: 700,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
  },
  actionRow: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "10px",
    marginTop: "18px",
  },
  button: {
    border: "none",
    borderRadius: "14px",
    padding: "13px 14px",
    fontSize: "14px",
    fontWeight: 700,
    cursor: "pointer",
    transition: "transform 140ms ease, opacity 140ms ease",
  },
  emptyState: {
    borderRadius: "24px",
    padding: "48px",
    textAlign: "center",
    background: "#fffaf2",
    border: "1px solid rgba(20, 91, 92, 0.08)",
    color: "#5a5750",
  },
};

function SummaryStat({ number, label }) {
  return (
    <div style={styles.statCard}>
      <p style={styles.statNumber}>{number}</p>
      <p style={styles.statLabel}>{label}</p>
    </div>
  );
}

function NotificationBanner({ notification }) {
  if (!notification) {
    return null;
  }

  const isSuccess = notification.type === "success";

  return (
    <div
      style={{
        ...styles.banner,
        background: isSuccess
          ? "linear-gradient(135deg, #dff3ea 0%, #edf8f1 100%)"
          : "linear-gradient(135deg, #fde5e0 0%, #fff0ed 100%)",
        border: isSuccess
          ? "1px solid rgba(20, 91, 92, 0.12)"
          : "1px solid rgba(167, 58, 40, 0.14)",
      }}
    >
      <div style={{ display: "grid", gap: "8px" }}>
        <p
          style={{
            margin: 0,
            fontSize: "15px",
            fontWeight: 700,
            color: isSuccess ? "#145b5c" : "#9a3e30",
          }}
        >
          {notification.message}
        </p>
        {notification.details ? (
          <p style={{ margin: 0, fontSize: "14px", color: "#5b6768" }}>
            Before {notification.details.original} KB, after {notification.details.processed} KB, savings{" "}
            {notification.details.savings}%.
          </p>
        ) : null}
      </div>
    </div>
  );
}

export default function StudioPage() {
  const { products, shop, activeDisplayPlan, canCompress, canWatermark } = useLoaderData();
  const fetcher = useFetcher();
  const [loadingId, setLoadingId] = useState(null);
  const [watermark, setWatermark] = useState(null);
  const [processedImages, setProcessedImages] = useState({});
  const [notification, setNotification] = useState(null);

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) {
      return;
    }

    if (fetcher.data.success) {
      const { message, originalSizeKB, processedSizeKB, productId, newImageUrl, newMediaId } =
        fetcher.data;

      const savings =
        originalSizeKB && processedSizeKB
          ? (((originalSizeKB - processedSizeKB) / originalSizeKB) * 100).toFixed(1)
          : 0;

      setNotification({
        type: "success",
        message,
        details:
          originalSizeKB && processedSizeKB
            ? {
                original: originalSizeKB,
                processed: processedSizeKB,
                savings,
              }
            : null,
      });

      if (newImageUrl && productId) {
        setProcessedImages((previous) => ({
          ...previous,
          [productId]: {
            url: `${newImageUrl}?t=${Date.now()}`,
            mediaId: newMediaId || previous[productId]?.mediaId,
          },
        }));
      }
    } else {
      setNotification({
        type: "error",
        message: fetcher.data.message || "Something went wrong while updating the image.",
      });
    }

    setLoadingId(null);
    const timer = setTimeout(() => setNotification(null), 5000);
    return () => clearTimeout(timer);
  }, [fetcher.state, fetcher.data]);

  const handleClick = (mediaId, imageSrc, type, productId) => {
    setLoadingId(mediaId);
    setNotification(null);

    const formData = new FormData();
    formData.append("mediaId", mediaId);
    formData.append("imageSrc", imageSrc);
    formData.append("type", type);
    formData.append("shop", shop);
    formData.append("productId", productId);

    if (type === "watermark" && watermark) {
      formData.append("watermark", watermark);
    }

    fetcher.submit(formData, { method: "post", encType: "multipart/form-data" });
  };

  const processedCount = Object.keys(processedImages).length;
  const watermarkState = watermark ? "Custom asset loaded" : "Using fallback mark";

  return (
    <div style={styles.page}>
      <TitleBar title={`${BRAND.shortName} Studio`} />
      <div style={styles.shell}>
        <section style={styles.hero}>
          <div style={styles.heroGrid}>
            <div>
              <div style={styles.badge}>Premium image workflow</div>
              <h1 style={styles.heroTitle}>A sharper editing surface for product media.</h1>
              <p style={styles.heroBody}>
                {BRAND.name} gives merchants a single workspace for image optimization and
                watermarking inside Shopify admin.
              </p>

              <div style={styles.heroStats}>
                <SummaryStat number={products.length} label="Catalog items loaded" />
                <SummaryStat number={processedCount} label="Updated this session" />
                <SummaryStat number={activeDisplayPlan} label="Current plan" />
              </div>
            </div>

            <div style={styles.sidePanel}>
              <div>
                <p style={styles.sideLabel}>Workspace</p>
                <p style={styles.sideValue}>{BRAND.shortName} Studio</p>
              </div>
              <div>
                <p style={styles.sideLabel}>Current mode</p>
                <p style={{ ...styles.sideValue, fontSize: "22px" }}>{watermarkState}</p>
              </div>
              <div>
                <p style={styles.sideLabel}>Use case</p>
                <p style={{ margin: "8px 0 0", fontSize: "14px", lineHeight: 1.6 }}>
                  Compress large assets for faster storefront delivery, then add a watermark when the
                  imagery needs light protection outside Shopify.
                </p>
              </div>
            </div>
          </div>
        </section>

        <div style={styles.sectionGrid}>
          <aside style={styles.panel}>
            <h2 style={styles.panelTitle}>Watermark source</h2>
            <p style={styles.panelBody}>
              Upload a PNG or image file to apply your own mark. If you skip this step, the app falls back
              to the default watermark asset in the project.
            </p>

            {!canCompress || !canWatermark ? (
              <div style={{ ...styles.noteItem, marginTop: "18px" }}>
                {canCompress
                  ? "Watermarking unlocks on the Scale plan."
                  : "Starter includes a studio preview. Upgrade to Core for optimization or Scale for watermarking."}
              </div>
            ) : null}

            <input
              id="watermark-upload"
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(event) => setWatermark(event.target.files[0])}
            />

            <label htmlFor="watermark-upload" style={styles.uploadField}>
              <strong style={{ display: "block", marginBottom: "6px", color: "#163233" }}>
                Upload custom watermark
              </strong>
              <span style={{ fontSize: "14px", color: "#5a5750" }}>
                Choose an image that should sit in the corner of processed media.
              </span>
            </label>

            {watermark ? <div style={styles.uploadName}>{watermark.name}</div> : null}

            <div style={styles.noteList}>
              <div style={styles.noteItem}>Compression outputs a lighter JPG for faster storefront delivery.</div>
              <div style={styles.noteItem}>Watermarking outputs a PNG and keeps the new image attached to the product.</div>
              <div style={styles.noteItem}>Every update replaces the old media entry, so the catalog stays tidy.</div>
            </div>
          </aside>

          <section>
            <NotificationBanner notification={notification} />

            {products.length === 0 ? (
              <div style={styles.emptyState}>
                <h2 style={{ margin: "0 0 10px", fontSize: "26px", color: "#163233" }}>
                  No products are available yet.
                </h2>
                <p style={{ margin: 0, fontSize: "15px", lineHeight: 1.6 }}>
                  Once the store has product media, PixelMint Studio will surface those items here for
                  compression and watermarking.
                </p>
              </div>
            ) : (
              <div style={styles.productGrid}>
                {products.map(({ node }) => {
                  const media = node.media.edges[0]?.node;
                  const originalImage = media?.image;
                  const processedData = processedImages[node.id];
                  const currentImage = processedData?.url || originalImage?.url;
                  const currentMediaId = processedData?.mediaId || media?.id;
                  const isBusy = loadingId === currentMediaId;
                  const requestedType = fetcher.submission?.formData.get("type");

                  return (
                    <article key={node.id} style={styles.productCard}>
                      {currentImage ? (
                        <>
                          <div style={styles.mediaFrame}>
                            <img
                              key={currentImage}
                              src={currentImage}
                              alt={originalImage?.altText || "Product image"}
                              style={styles.mediaImage}
                            />
                          </div>
                          <div style={styles.cardBody}>
                            <div style={styles.cardTopRow}>
                              <h3 style={styles.productTitle}>{node.title}</h3>
                              <span
                                style={{
                                  ...styles.statusPill,
                                  color: processedData ? "#145b5c" : "#8a5b1e",
                                  background: processedData ? "#e5f3ee" : "#f9ecd9",
                                }}
                              >
                                {processedData ? "Updated" : "Original"}
                              </span>
                            </div>

                            <div style={styles.actionRow}>
                              <button
                                type="button"
                                disabled={isBusy || !canCompress}
                                onClick={() =>
                                  handleClick(currentMediaId, currentImage, "compress", node.id)
                                }
                                style={{
                                  ...styles.button,
                                  background: isBusy || !canCompress ? "#85adb0" : "#145b5c",
                                  color: "#f8f0e3",
                                  opacity:
                                    (isBusy && requestedType !== "compress") || !canCompress ? 0.72 : 1,
                                }}
                              >
                                {!canCompress
                                  ? "Core required"
                                  : isBusy && requestedType === "compress"
                                  ? "Optimizing..."
                                  : "Optimize image"}
                              </button>
                              <button
                                type="button"
                                disabled={isBusy || !canWatermark}
                                onClick={() =>
                                  handleClick(currentMediaId, currentImage, "watermark", node.id)
                                }
                                style={{
                                  ...styles.button,
                                  background: isBusy || !canWatermark ? "#d9b37d" : "#d18a36",
                                  color: "#fffaf2",
                                  opacity:
                                    (isBusy && requestedType !== "watermark") || !canWatermark ? 0.72 : 1,
                                }}
                              >
                                {!canWatermark
                                  ? "Scale required"
                                  : isBusy && requestedType === "watermark"
                                  ? "Applying..."
                                  : "Apply mark"}
                              </button>
                            </div>
                          </div>
                        </>
                      ) : (
                        <div style={{ ...styles.cardBody, padding: "44px 24px" }}>
                          <h3 style={{ ...styles.productTitle, marginBottom: "10px" }}>{node.title}</h3>
                          <p style={{ margin: 0, fontSize: "14px", color: "#5a5750", lineHeight: 1.6 }}>
                            This product does not have a primary image yet, so there is nothing to process in
                            the studio.
                          </p>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
