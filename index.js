require("dotenv").config();
const express = require("express");
const admin = require("firebase-admin");
const PDFDocument = require("pdfkit");
const axios = require("axios");
const sharp = require("sharp");
const fs = require("fs");
const puppeteer = require("puppeteer");
const path = require("path");
const Handlebars = require("handlebars");
const cors = require("cors");

const app = express();
const port = 3000;

// Configure CORS
app.use(
  cors({
    origin: "*", // Allow all origins
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

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

// Helper function to extract all images from nested objects
function extractImagesFromNestedObjects(obj, imageList = []) {
  if (!obj || typeof obj !== "object") return imageList;

  // Check if the current object is an array
  if (Array.isArray(obj)) {
    // If it's an images array, add all items to the image list
    if (
      obj.length > 0 &&
      typeof obj[0] === "string" &&
      (obj[0].includes("firebasestorage.googleapis.com") ||
        (obj[0].includes("http") &&
          (obj[0].endsWith(".jpg") ||
            obj[0].endsWith(".jpeg") ||
            obj[0].endsWith(".png") ||
            obj[0].endsWith(".webp"))))
    ) {
      imageList.push(...obj);
    } else {
      // If it's some other array, process each item recursively
      obj.forEach((item) => extractImagesFromNestedObjects(item, imageList));
    }
  } else {
    // Process each key in the object
    for (const key in obj) {
      const value = obj[key];

      // If the key is 'images' and the value is an array of strings, add them to the image list
      if (
        key === "images" &&
        Array.isArray(value) &&
        value.length > 0 &&
        typeof value[0] === "string"
      ) {
        imageList.push(...value);
      }
      // If the key contains 'image' or 'photo' and the value is a string URL, add it to the image list
      else if (
        (key.includes("image") ||
          key.includes("photo") ||
          key.includes("img")) &&
        typeof value === "string" &&
        (value.includes("http") || value.includes("firebasestorage"))
      ) {
        imageList.push(value);
      }
      // If the value is an object or array, process it recursively
      else if (value && typeof value === "object") {
        extractImagesFromNestedObjects(value, imageList);
      }
    }
  }

  return imageList;
}

// Load and compile templates
function loadTemplate(templateName) {
  const templatePath = path.join(
    __dirname,
    "templates",
    `${templateName}.html`
  );
  const templateSource = fs.readFileSync(templatePath, "utf8");
  return Handlebars.compile(templateSource);
}

// Process and render the cover page
function renderCoverPage(projectData) {
  const template = loadTemplate('cover');
  const currentDate = new Date();
  const formattedDate = currentDate.toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });

  return template({
    PROJECT_NAME: projectData.projectName || "Unnamed Project",
    UPDATED_DATE: projectData.lastUpdated || formattedDate 
  });
}

// Process and render the details page
function renderDetailsPage(projectData) {
  const template = loadTemplate("details");

  return template({
    PROJECT_NAME: projectData.projectName || "Unnamed Project",
    IS_RERA_APPROVED: projectData.isReraApproved === "Approved",
    STATUS: projectData.status || "N/A",
    ASSET_TYPE: projectData.assetType
      ? projectData.assetType.toUpperCase()
      : "N/A",
    AREA: projectData.area || "N/A",
    PROJECT_LAND_AREA: projectData.projectLandArea
      ? `${projectData.projectLandArea} sqft`
      : "N/A",
    LAUNCH_DATE: projectData.launchDate || "N/A",
    POSSESSION_DATE: projectData.possession || "N/A",
    TOTAL_UNITS: projectData.totalUnits || "N/A",
    CONFIGURATIONS: projectData.configurations || [],
    AMENITIES: projectData.amenities || [],
    LOCATION: projectData.location || "N/A",
    WATER_SOURCE: projectData.waterSource || "N/A",
    RERA_ID: projectData.reraId || "N/A",
    ACKNOWLEDGEMENT: projectData.acknowledgement || "N/A",
    APPROVAL_AUTHORITY: projectData.approvalAuthority || "N/A",
    HANDOVER_DATE: projectData.handOverDate || "N/A",
    HAS_COORDINATES: projectData.lat && projectData.long,
    LAT: projectData.lat,
    LONG: projectData.long,
    TITLE_CLEARED:
      projectData.isTitleCleared !== null ? projectData.isTitleCleared : "N/A",
    KHATA_TYPE: projectData.khataType !== null ? projectData.khataType : "N/A",
    LITIGATION:
      projectData.litigation !== null
        ? projectData.litigation
          ? "Yes"
          : "No"
        : "N/A",
    GENERATION_DATE: new Date().toLocaleDateString(),
    LAST_UPDATED: projectData.lastUpdated
      ? new Date(projectData.lastUpdated * 1000).toLocaleDateString()
      : "Unknown",
  });
}

// Process and render the specs page
function renderSpecsPage(projectData) {
  const template = loadTemplate("specifications");

  // Default values for construction specifications if not available
  const specs = {
    STRUCTURE_SPEC: "RCC framed structure with seismic considerations",
    WALLS_SPEC: "Concrete blocks with weather-resistant exterior finish",
    INTERNAL_WALLS_SPEC: "Solid concrete block partitions with smooth finish",
    FLOORING_SPEC:
      "Vitrified tiles in living areas, anti-skid ceramic in wet areas",
    WINDOWS_SPEC: "UPVC framed windows with appropriate glazing",
    DOORS_SPEC: "Engineered wooden doors with quality hardware",
    PAINTING_SPEC:
      "Premium emulsion paint for internal walls, exterior grade paint outside",
  };

  return template({
    PROJECT_NAME: projectData.projectName || "Unnamed Project",
    STRUCTURE_SPEC: projectData.structureSpec || specs.STRUCTURE_SPEC,
    WALLS_SPEC: projectData.wallsSpec || specs.WALLS_SPEC,
    INTERNAL_WALLS_SPEC:
      projectData.internalWallsSpec || specs.INTERNAL_WALLS_SPEC,
    FLOORING_SPEC: projectData.flooringSpec || specs.FLOORING_SPEC,
    WINDOWS_SPEC: projectData.windowsSpec || specs.WINDOWS_SPEC,
    DOORS_SPEC: projectData.doorsSpec || specs.DOORS_SPEC,
    PAINTING_SPEC: projectData.paintingSpec || specs.PAINTING_SPEC,
    TOTAL_UNITS: projectData.totalUnits || "N/A",
    TOWER_UNITS: projectData.towerUnits || "N/A",
    PROJECT_LAND_AREA: projectData.projectLandArea
      ? `${projectData.projectLandArea} sqft`
      : "N/A",
    UNIT_SIZES: projectData.unitSizes || "Various configurations available",
    APPROVAL_AUTHORITY: projectData.approvalAuthority || "N/A",
    HANDOVER_DATE: projectData.handOverDate || "N/A",
    AMENITIES: projectData.amenities || [],
  });
}

// Process and render the gallery page
function renderGalleryPage(projectName, images) {
  const template = loadTemplate("gallery");

  // Create image objects with captions
  const imageObjects = images.map((url, index) => ({
    URL: url,
    CAPTION: `Property View ${index + 1}`,
  }));

  return template({
    PROJECT_NAME: projectName,
    HAS_IMAGES: images.length > 0,
    IMAGES: imageObjects,
    CURRENT_YEAR: new Date().getFullYear(),
  });
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

  // Format current date as MM/DD/YYYY
  const currentDate = new Date();
  const formattedDate = currentDate.toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });

  html = html.replace("{{PROJECT_NAME}}", projectName || "No Project Name");
  html = html.replace("{{UPDATED_DATE}}", formattedDate);
  return html;
}

// Create a project details HTML template
function renderProjectDetailsTemplate(projectData) {
  // Extract images from all nested objects
  const allImages = extractImagesFromNestedObjects(projectData);
  console.log(`Found ${allImages.length} images in the project data`);

  let html = `
  <!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Property Details</title>
      <style>
        body {
          font-family: 'Arial', sans-serif;
          padding: 40px;
          color: #333;
          background-color: #f9f9f9;
        }
        h1 {
          color: #2c3e50;
          border-bottom: 2px solid #3498db;
          padding-bottom: 10px;
          font-size: 28px;
          text-transform: uppercase;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }
        .property-title {
          font-size: 24px;
          color: #2c3e50;
        }
        .rera-approval {
          color: #27ae60;
          font-weight: bold;
          padding: 5px 10px;
          border-radius: 4px;
          background-color: #e8f8f0;
          border: 1px solid #27ae60;
        }
        .section {
          background-color: white;
          border-radius: 8px;
          box-shadow: 0 2px 5px rgba(0,0,0,0.1);
          padding: 20px;
          margin-bottom: 30px;
        }
        .section-title {
          font-size: 18px;
          font-weight: bold;
          color: #2c3e50;
          margin-bottom: 15px;
          border-bottom: 1px solid #eee;
          padding-bottom: 10px;
        }
        .property-info {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 15px;
        }
        .property {
          margin-bottom: 10px;
        }
        .property-name {
          font-weight: bold;
          color: #7f8c8d;
          display: block;
          margin-bottom: 3px;
          font-size: 12px;
          text-transform: uppercase;
        }
        .property-value {
          font-size: 16px;
          color: #2c3e50;
        }
        .amenities-container {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-top: 10px;
        }
        .amenity {
          background-color: #edf2f7;
          padding: 8px 12px;
          border-radius: 20px;
          font-size: 14px;
          color: #4a5568;
        }
        .config-container {
          display: flex;
          flex-wrap: wrap;
          gap: 15px;
          margin-top: 10px;
        }
        .config {
          background-color: #e3f2fd;
          border: 1px solid #bbdefb;
          padding: 10px 15px;
          border-radius: 6px;
          font-size: 15px;
          color: #1565c0;
          font-weight: bold;
        }
        .location-map {
          width: 100%;
          height: 300px;
          background-color: #eee;
          border-radius: 8px;
          margin-top: 15px;
          border: 1px solid #ddd;
        }
        .status-tag {
          display: inline-block;
          background-color: #ff9800;
          color: white;
          padding: 5px 10px;
          border-radius: 4px;
          font-size: 14px;
          text-transform: uppercase;
        }
        .footer {
          text-align: center;
          margin-top: 40px;
          color: #95a5a6;
          font-size: 12px;
        }
        .image-gallery {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 20px;
          margin-top: 20px;
        }
        .image-container {
          width: 100%;
          background-color: #fff;
          border-radius: 8px;
          overflow: hidden;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .image-container img {
          width: 100%;
          height: auto;
          display: block;
        }
        @media print {
          .page-break {
            page-break-before: always;
          }
          body {
            padding: 20px;
          }
          .section {
            break-inside: avoid;
          }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>${projectData.projectName || "Property Details"}</h1>
        ${
          projectData.isReraApproved === "Approved"
            ? `<div class="rera-approval">RERA Approved</div>`
            : ""
        }
      </div>
      
      <div class="section">
        <div class="section-title">Project Overview</div>
        <div class="property-info">
          <div class="property">
            <span class="property-name">Project Status</span>
            <span class="property-value">
              <span class="status-tag">${projectData.status || "N/A"}</span>
            </span>
          </div>
          <div class="property">
            <span class="property-name">Asset Type</span>
            <span class="property-value">${
              projectData.assetType
                ? projectData.assetType.toUpperCase()
                : "N/A"
            }</span>
          </div>
          <div class="property">
            <span class="property-name">Area</span>
            <span class="property-value">${projectData.area || "N/A"}</span>
          </div>
          <div class="property">
            <span class="property-name">Project Land Area</span>
            <span class="property-value">${
              projectData.projectLandArea
                ? projectData.projectLandArea + " sqft"
                : "N/A"
            }</span>
          </div>
          <div class="property">
            <span class="property-name">Launch Date</span>
            <span class="property-value">${
              projectData.launchDate || "N/A"
            }</span>
          </div>
          <div class="property">
            <span class="property-name">Possession Date</span>
            <span class="property-value">${
              projectData.possession || "N/A"
            }</span>
          </div>
          <div class="property">
            <span class="property-name">Total Units</span>
            <span class="property-value">${
              projectData.totalUnits || "N/A"
            }</span>
          </div>
        </div>
      </div>
      
      <div class="section">
        <div class="section-title">Configurations</div>
        <div class="config-container">
          ${
            projectData.configurations && projectData.configurations.length > 0
              ? projectData.configurations
                  .map(
                    (config) => `
              <div class="config">${config}</div>
            `
                  )
                  .join("")
              : '<div class="property-value">No configurations available</div>'
          }
        </div>
      </div>
      
      <div class="section">
        <div class="section-title">Amenities</div>
        <div class="amenities-container">
          ${
            projectData.amenities && projectData.amenities.length > 0
              ? projectData.amenities
                  .map(
                    (amenity) => `
              <div class="amenity">${amenity}</div>
            `
                  )
                  .join("")
              : '<div class="property-value">No amenities available</div>'
          }
        </div>
      </div>
      
      <div class="section">
        <div class="section-title">Location & Details</div>
        <div class="property">
          <span class="property-name">Address</span>
          <span class="property-value">${projectData.location || "N/A"}</span>
        </div>
        <div class="property">
          <span class="property-name">Water Source</span>
          <span class="property-value">${
            projectData.waterSource || "N/A"
          }</span>
        </div>
        <div class="property">
          <span class="property-name">RERA ID</span>
          <span class="property-value">${projectData.reraId || "N/A"}</span>
        </div>
        <div class="property">
          <span class="property-name">Acknowledgement</span>
          <span class="property-value">${
            projectData.acknowledgement || "N/A"
          }</span>
        </div>
        <div class="property">
          <span class="property-name">Approval Authority</span>
          <span class="property-value">${
            projectData.approvalAuthority || "N/A"
          }</span>
        </div>
        <div class="property">
          <span class="property-name">Handover Date</span>
          <span class="property-value">${
            projectData.handOverDate || "N/A"
          }</span>
        </div>
        ${
          projectData.lat && projectData.long
            ? `
          <div class="property">
            <span class="property-name">Coordinates</span>
            <span class="property-value">Lat: ${projectData.lat}, Long: ${projectData.long}</span>
          </div>
          <div class="location-map">
            <img src="https://maps.googleapis.com/maps/api/staticmap?center=${projectData.lat},${projectData.long}&zoom=15&size=600x300&maptype=roadmap&markers=color:red%7C${projectData.lat},${projectData.long}&key=YOUR_API_KEY" width="100%" height="100%" alt="Property location map">
          </div>
        `
            : ""
        }
      </div>
      
      <div class="section">
        <div class="section-title">Legal Information</div>
        <div class="property-info">
          <div class="property">
            <span class="property-name">Title Cleared</span>
            <span class="property-value">${
              projectData.isTitleCleared !== null
                ? projectData.isTitleCleared
                : "N/A"
            }</span>
          </div>
          <div class="property">
            <span class="property-name">Khata Type</span>
            <span class="property-value">${
              projectData.khataType !== null ? projectData.khataType : "N/A"
            }</span>
          </div>
          <div class="property">
            <span class="property-name">Litigation</span>
            <span class="property-value">${
              projectData.litigation !== null
                ? projectData.litigation
                  ? "Yes"
                  : "No"
                : "N/A"
            }</span>
          </div>
        </div>
      </div>
      
      ${allImages.length > 0 ? createImageGalleryHTML(allImages) : ""}
      
      <div class="footer">
        This document was generated on ${new Date().toLocaleDateString()} and contains property information as recorded in our database. 
        Last Updated: ${
          projectData.lastUpdated
            ? new Date(projectData.lastUpdated * 1000).toLocaleDateString()
            : "Unknown"
        }
      </div>
    </body>
  </html>
  `;

  return html;
}

// PDF download route with Investment Report title
app.get("/download-pdf", async (req, res) => {
  try {
    console.log("Received PDF request");
    const projectId = req.query.projectId;
    const debugMode = req.query.debug === 'true';
    const viewOnly = req.query.view === "true"; // New parameter to control behavior

    if (!projectId) {
      return res.status(400).send("Project ID is required");
    }

    console.log("Fetching project data for ID:", projectId);

    // Fetch project data from Firestore
    const projectDoc = await db.collection("assetData").doc(projectId).get();

    if (!projectDoc.exists) {
      return res.status(404).send("Project not found");
    }

    const projectData = projectDoc.data();
    const projectName = projectData.projectName || "Unnamed Project";

    console.log("Found project:", projectName);

    // Extract all images from the project data
    const allImages = extractImagesFromNestedObjects(projectData);
    console.log(`Found ${allImages.length} total images in the project data`);

    // Process all images to get signed URLs if needed
    const processedImages = [];
    if (allImages.length > 0) {
      for (const imageUrl of allImages) {
        try {
          // Check if it's a Firebase Storage URL
          const pathMatch = imageUrl.match(/\/o\/(.+?)\?/);
          if (pathMatch) {
            const path = decodeURIComponent(pathMatch[1]);
            const signedUrl = await getSignedUrl(path);
            processedImages.push(signedUrl);
          } else {
            processedImages.push(imageUrl);
          }
        } catch (error) {
          console.error("Error processing image:", error);
          processedImages.push(imageUrl); // Use original URL if processing fails
        }
      }
    }

    // Render each page from the templates
    const coverHtml = renderCoverPage(projectData);
    const detailsHtml = renderDetailsPage(projectData);
    const specsHtml = renderSpecsPage(projectData);
    const galleryHtml = renderGalleryPage(projectName, processedImages);
    const disclaimerHtml = fs.readFileSync(
      path.join(__dirname, "templates", "disclaimer.html"),
      "utf8"
    );

    // Try a completely different approach - generate individual PDFs for each page and then merge them
    try {
      console.log('Attempting to generate PDF using multi-page approach...');
      
      // Generate individual HTML files for each page
      const coverPageHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8">
            <style>
              body, html {
                margin: 0;
                padding: 0;
                height: 100vh;
                width: 100%;
                overflow: hidden;
              }
              /* Landscape-specific styling */
              @page {
                size: A4 landscape;
                margin: 0;
              }
              .landscape-container {
                width: 100%;
                height: 100%;
                display: flex;
                flex-direction: row;
              }
            </style>
          </head>
          <body>${coverHtml}</body>
        </html>
      `;
      
      const detailsPageHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8">
            <style>
              body, html {
                margin: 0;
                padding: 0;
                height: 100vh;
                width: 100%;
                overflow: hidden;
                background-color: #f9f9f9;
              }
              /* Landscape-specific styling */
              @page {
                size: A4 landscape;
                margin: 0;
              }
              .content-wrapper {
                padding: 40px;
                max-width: 100%;
                overflow-x: hidden;
              }
            </style>
          </head>
          <body>
            <div class="content-wrapper">
              ${detailsHtml}
            </div>
          </body>
        </html>
      `;
      
      const specsPageHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8">
            <style>
              body, html {
                margin: 0;
                padding: 0;
                height: 100vh;
                width: 100%;
                overflow: hidden;
                background-color: #f9f9f9;
              }
              /* Landscape-specific styling */
              @page {
                size: A4 landscape;
                margin: 0;
              }
              .content-wrapper {
                padding: 40px;
                max-width: 100%;
                overflow-x: hidden;
              }
            </style>
          </head>
          <body>
            <div class="content-wrapper">
              ${specsHtml}
            </div>
          </body>
        </html>
      `;
      
      const galleryPageHtml = processedImages.length > 0 ? `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8">
            <style>
              body, html {
                margin: 0;
                padding: 0;
                height: 100vh;
                width: 100%;
                overflow: hidden;
                background-color: #f9f9f9;
              }
              /* Landscape-specific styling */
              @page {
                size: A4 landscape;
                margin: 0;
              }
              .content-wrapper {
                padding: 40px;
                max-width: 100%;
                overflow-x: hidden;
              }
              /* Make gallery grid better for landscape */
              .image-gallery {
                display: grid;
                grid-template-columns: repeat(3, 1fr) !important;
                gap: 20px;
              }
            </style>
          </head>
          <body>
            <div class="content-wrapper">
              ${galleryHtml}
            </div>
          </body>
        </html>
      ` : null;
      
      const disclaimerPageHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8">
            <style>
              body, html {
                margin: 0;
                padding: 0;
                height: 100vh;
                width: 100%;
                overflow: hidden;
                background-color: #f9f9f9;
              }
              /* Landscape-specific styling */
              @page {
                size: A4 landscape;
                margin: 0;
              }
              .content-wrapper {
                padding: 40px;
                max-width: 100%;
                overflow-x: hidden;
              }
            </style>
          </head>
          <body>
            <div class="content-wrapper">
              ${disclaimerHtml}
            </div>
          </body>
        </html>
      `;
      
      // Write the HTML files to disk
      const pagesDir = path.join(__dirname, 'pages');
      if (!fs.existsSync(pagesDir)) {
        fs.mkdirSync(pagesDir);
      }
      
      fs.writeFileSync(path.join(pagesDir, 'cover.html'), coverPageHtml);
      fs.writeFileSync(path.join(pagesDir, 'details.html'), detailsPageHtml);
      fs.writeFileSync(path.join(pagesDir, 'specs.html'), specsPageHtml);
      if (galleryPageHtml) {
        fs.writeFileSync(path.join(pagesDir, 'gallery.html'), galleryPageHtml);
      }
      fs.writeFileSync(path.join(pagesDir, 'disclaimer.html'), disclaimerPageHtml);
      
      // Generate PDFs for each page
      const browser = await puppeteer.launch({
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
      });
      
      try {
        const pdfFilenames = [];
        
        // Generate PDF for cover page
        const coverPdfPath = path.join(pagesDir, 'cover.pdf');
        const coverPage = await browser.newPage();
        await coverPage.goto(`file://${path.join(pagesDir, 'cover.html')}`, { waitUntil: 'networkidle0' });
        await coverPage.pdf({
          path: coverPdfPath,
          format: 'A4',
          landscape: true,
          printBackground: true,
          margin: {
            top: "0.2in",
            right: "0.2in",
            bottom: "0.2in",
            left: "0.2in"
          },
          preferCSSPageSize: true
        });
        pdfFilenames.push(coverPdfPath);
        await coverPage.close();
        
        // Generate PDF for details page
        const detailsPdfPath = path.join(pagesDir, 'details.pdf');
        const detailsPage = await browser.newPage();
        await detailsPage.goto(`file://${path.join(pagesDir, 'details.html')}`, { waitUntil: 'networkidle0' });
        await detailsPage.pdf({
          path: detailsPdfPath,
          format: 'A4',
          landscape: true,
          printBackground: true,
          margin: {
            top: "0.4in",
            right: "0.4in",
            bottom: "0.4in",
            left: "0.4in"
          },
          preferCSSPageSize: true
        });
        pdfFilenames.push(detailsPdfPath);
        await detailsPage.close();
        
        // Generate PDF for specs page
        const specsPdfPath = path.join(pagesDir, 'specs.pdf');
        const specsPage = await browser.newPage();
        await specsPage.goto(`file://${path.join(pagesDir, 'specs.html')}`, { waitUntil: 'networkidle0' });
        await specsPage.pdf({
          path: specsPdfPath,
          format: 'A4',
          landscape: true,
          printBackground: true,
          margin: {
            top: "0.4in",
            right: "0.4in",
            bottom: "0.4in",
            left: "0.4in"
          },
          preferCSSPageSize: true
        });
        pdfFilenames.push(specsPdfPath);
        await specsPage.close();
        
        // Generate PDF for gallery page (if exists)
        if (galleryPageHtml) {
          const galleryPdfPath = path.join(pagesDir, 'gallery.pdf');
          const galleryPage = await browser.newPage();
          await galleryPage.goto(`file://${path.join(pagesDir, 'gallery.html')}`, { waitUntil: 'networkidle0' });
          await galleryPage.pdf({
            path: galleryPdfPath,
            format: 'A4',
            landscape: true,
            printBackground: true,
            margin: {
              top: "0.4in",
              right: "0.4in",
              bottom: "0.4in",
              left: "0.4in"
            },
            preferCSSPageSize: true
          });
          pdfFilenames.push(galleryPdfPath);
          await galleryPage.close();
        }
        
        // Generate PDF for disclaimer page
        const disclaimerPdfPath = path.join(pagesDir, 'disclaimer.pdf');
        const disclaimerPage = await browser.newPage();
        await disclaimerPage.goto(`file://${path.join(pagesDir, 'disclaimer.html')}`, { waitUntil: 'networkidle0' });
        await disclaimerPage.pdf({
          path: disclaimerPdfPath,
          format: 'A4',
          landscape: true,
          printBackground: true,
          margin: {
            top: "0.4in",
            right: "0.4in",
            bottom: "0.4in",
            left: "0.4in"
          },
          preferCSSPageSize: true
        });
        pdfFilenames.push(disclaimerPdfPath);
        await disclaimerPage.close();
        
        // Merge all PDFs
        const { PDFDocument } = require('pdf-lib');
        
        async function mergePDFs(pdfPaths) {
          const mergedPdf = await PDFDocument.create();
          
          for (const pdfPath of pdfPaths) {
            const pdfBytes = fs.readFileSync(pdfPath);
            const pdf = await PDFDocument.load(pdfBytes);
            const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
            copiedPages.forEach(page => mergedPdf.addPage(page));
          }
          
          const mergedPdfBytes = await mergedPdf.save();
          return mergedPdfBytes;
        }
        
        const filename = `${projectName.replace(/\s+/g, '_')}_Report.pdf`;
        const filePath = path.join(__dirname, filename);
        
        const mergedPdfBytes = await mergePDFs(pdfFilenames);
        fs.writeFileSync(filePath, mergedPdfBytes);
        
        // Clean up the individual PDF files
        pdfFilenames.forEach(pdfPath => {
          try {
            fs.unlinkSync(pdfPath);
          } catch (err) {
            console.error(`Failed to delete temporary PDF: ${pdfPath}`, err);
          }
        });
        
        // Send the PDF as a download
        res.download(filePath, filename, (err) => {
          if (err) {
            console.error("Error sending file:", err);
          }
          // Delete the file after download attempt
          fs.unlink(filePath, (unlinkErr) => {
            if (unlinkErr) {
              console.error("Error deleting file:", unlinkErr);
            }
          });
          
          // Clean up the HTML files
          try {
            fs.unlinkSync(path.join(pagesDir, 'cover.html'));
            fs.unlinkSync(path.join(pagesDir, 'details.html'));
            fs.unlinkSync(path.join(pagesDir, 'specs.html'));
            if (galleryPageHtml) {
              fs.unlinkSync(path.join(pagesDir, 'gallery.html'));
            }
            fs.unlinkSync(path.join(pagesDir, 'disclaimer.html'));
          } catch (err) {
            console.error("Error cleaning up HTML files:", err);
          }
        });
      } finally {
        await browser.close();
      }
    } catch (pdfError) {
      console.error('Error generating PDF:', pdfError);
      res.status(500).send('Failed to generate PDF');
    }
  } catch (err) {
    console.error("Error generating PDF:", err);
    res.status(500).send("Failed to generate PDF");
  }
});

// Simple route to view just the cover template
app.get('/debug-cover', (req, res) => {
  try {
    const sampleData = {
      projectName: "Sample Test Project",
      status: "Under Construction"
    };
    
    const html = renderCoverPage(sampleData);
    res.send(html);
  } catch (err) {
    console.error('Error rendering debug cover:', err);
    res.status(500).send('Error rendering debug cover');
  }
});

// Start server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
