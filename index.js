require("dotenv").config();
const express = require("express");
const admin = require("firebase-admin");
const PDFDocument = require("pdfkit");
const axios = require("axios");
const sharp = require("sharp");
const fs = require("fs");
const puppeteer = require("puppeteer");
const path = require("path");

const app = express();
const port = 3000;

// Middleware to parse JSON bodies
app.use(express.json());

let firebaseConfig;
if (
  process.env.FIREBASE_PROJECT_ID &&
  process.env.FIREBASE_CLIENT_EMAIL &&
  process.env.FIREBASE_PRIVATE_KEY
) {
  firebaseConfig = {
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    }),
  };
}

admin.initializeApp(firebaseConfig);
const db = admin.firestore();

// Initialize Firebase Storage
const bucket = admin.storage().bucket("masal-db-6cc78.appspot.com");

// Helper function to get signed URL
async function getSignedUrl(path) {
  try {
    console.log("Getting signed URL for path:", path);
    const file = bucket.file(path);
    const [url] = await file.getSignedUrl({
      action: "read",
      expires: Date.now() + 15 * 60 * 1000, // 15 minutes
    });
    console.log("Generated signed URL:", url);
    return url;
  } catch (error) {
    console.error("Error generating signed URL:", error);
    throw error;
  }
}

// Basic route
app.get("/", (req, res) => {
  res.send("Hello World!");
});

// Helper function to print nested objects and handle images
async function printObjectToPDF(doc, obj, indent = 0) {
  const indentStr = "  ".repeat(indent);
  for (const [key, value] of Object.entries(obj)) {
    if (key === "images" && Array.isArray(value)) {
      doc.fontSize(14).text(`${indentStr}Images:`);
      for (const imageUrl of value) {
        try {
          console.log("Processing image URL:", imageUrl);
          // Extract the path from the Firebase Storage URL
          const pathMatch = imageUrl.match(/\/o\/(.+?)\?/);
          if (!pathMatch) {
            throw new Error("Invalid Firebase Storage URL format");
          }
          const path = decodeURIComponent(pathMatch[1]);
          console.log("Extracted path:", path);

          // Get the file from Firebase Storage
          const file = bucket.file(path);
          const [fileContent] = await file.download();
          console.log("File downloaded successfully");

          // Convert WebP to JPEG using sharp
          const convertedBuffer = await sharp(fileContent)
            .jpeg() // Convert to JPEG
            .toBuffer();

          doc.image(convertedBuffer, { fit: [250, 250] });
          doc.moveDown();
          // Add page break after each image
          doc.addPage();
        } catch (err) {
          console.error("Detailed error loading image:", {
            error: err.message,
            stack: err.stack,
            url: imageUrl,
          });
          doc
            .fontSize(12)
            .fillColor("red")
            .text(`${indentStr}Failed to load image: ${imageUrl}`);
          doc.fillColor("black");
        }
      }
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      doc.fontSize(14).text(`${indentStr}${key}:`);
      await printObjectToPDF(doc, value, indent + 1);
    } else {
      doc.fontSize(14).text(`${indentStr}${key}: ${value}`);
    }
  }
}

// Utility to render HTML with injected project name
function renderHtmlTemplate(projectName) {
  const templatePath = path.join(__dirname, "templates", "cover.html");
  let html = fs.readFileSync(templatePath, "utf8");
  html = html.replace("{{PROJECT_NAME}}", projectName || "No Project Name");
  return html;
}

// Start server
// PDF download route with Investment Report title
app.get("/download-pdf", async (req, res) => {
  try {
    console.log("Received PDF request");
    const projectName = req.query.projectName || "MANYA Magna Ville";

    // Read and prepare both HTML pages
    const coverHtml = renderHtmlTemplate(projectName);
    const disclaimerHtml = fs.readFileSync(
      path.join(__dirname, "templates", "disclaimer.html"),
      "utf8"
    );

    // Combine with a page break
    const combinedHtml = `
      <html>
        <head>
          <style>
            .page-break { page-break-before: always; }
          </style>
        </head>
        <body style='margin:0;padding:0;'>
          ${disclaimerHtml}
          <div class="page-break"></div>
          ${coverHtml}
        </body>
      </html>
    `;

    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.setContent(combinedHtml, { waitUntil: "networkidle0" });

    await page.pdf({
      path: "output.pdf",
      format: "A4",
      landscape: true,
      printBackground: true,
    });
    await browser.close();
    res.download("output.pdf");
  } catch (err) {
    console.error("Error generating PDF:", err);
    res.status(500).send("Failed to generate PDF");
  }
});

// Start server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
