# Privacy Policy for Image Squish

**Last updated: April 20, 2026**

Image Squish ("we", "our", "the app") is operated by VISION AIR LTD. This privacy policy explains how we collect, use, and protect information when you install and use Image Squish on your Shopify store.

## 1. Information We Collect

When you install Image Squish, Shopify provides us with the following information through its standard authentication process:

- **Store information**: Your store domain name (e.g., yourstore.myshopify.com)
- **Product data**: Product titles and product image URLs (accessed via the Shopify Admin API with `read_products` and `write_products` scopes)
- **Session data**: Authentication tokens required to operate the app within your Shopify admin

We do **not** collect:
- Customer personal information
- Payment or financial information
- Email addresses or contact details of your customers
- Browsing or tracking data

## 2. How We Use Your Information

We use the information listed above solely to:

- Authenticate your access to the app within Shopify admin
- Retrieve your product images for compression and watermarking
- Upload processed images back to your Shopify product catalog
- Store your custom watermark file on our server so it persists between sessions

## 3. Data Storage

- **Session data** is stored in a PostgreSQL database hosted on our infrastructure and is used only for Shopify authentication.
- **Custom watermark files** you upload are stored on our server and associated with your store domain. These are deleted automatically when you uninstall the app.
- **Product images** are processed in memory during compression or watermarking and are not stored on our servers. Processed images are uploaded directly to Shopify's CDN.

## 4. Data Sharing

We do **not** sell, rent, or share your data with any third parties. Your information is only transmitted between your browser, our server, and the Shopify Admin API as required to provide the app's functionality.

## 5. Data Retention

- Session data is retained while the app is installed and is deleted upon uninstallation.
- Custom watermark files are deleted upon uninstallation.
- We do not retain copies of your product images.

## 6. Data Protection

We use industry-standard security measures to protect your data:

- All communication is encrypted via HTTPS/TLS
- Database credentials are stored securely as environment variables
- Access tokens are managed by Shopify's session storage framework

## 7. GDPR and Data Rights

We comply with applicable data protection regulations including GDPR. The app handles the following Shopify compliance webhooks:

- **Customer data request**: We report what data (if any) we hold related to a specific customer.
- **Customer data erasure**: We delete any data associated with a specific customer upon request.
- **Shop data erasure**: We delete all data associated with your store when you uninstall the app.

If you are located in the EU or EEA, you have the right to:
- Access the data we hold about your store
- Request deletion of your data
- Request correction of inaccurate data

To exercise these rights, contact us at the email below.

## 8. Changes to This Policy

We may update this privacy policy from time to time. Any changes will be reflected on this page with an updated "Last updated" date.

## 9. Contact Us

If you have questions about this privacy policy or how we handle your data, please contact us at:

**Email**: ankur4codershive@outlook.com
**Company**: VISION AIR LTD
