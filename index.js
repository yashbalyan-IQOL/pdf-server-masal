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
      expires: Date.now() + 7 * 24 * 60 * 60 * 1000, 
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
  const template = loadTemplate("cover");
  const currentDate = new Date();
  const formattedDate = currentDate.toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });
  const formatTimestampDate = (timestamp) => {
    // If timestamp is too large, assume it's in milliseconds
    if (timestamp > 1e10) {
      timestamp = Math.floor(timestamp / 1000); // Convert to seconds
    }
  
    const date = new Date(timestamp * 1000); // Ensure timestamp is in milliseconds
  
    const day = date.getUTCDate();
    const month = date.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
    const year = date.getUTCFullYear();
  
    return `${day} ${month} ${year}`;
  }
  const formattedDate1 = formatTimestampDate(projectData.lastUpdated);
  console.log("Date aaj ki",formattedDate1);
  return template({
    PROJECT_NAME: projectData.projectName || "Unnamed Project",
    UPDATED_DATE: formattedDate1 || formattedDate,
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

// Process and render the supplyAndDemand page
function renderSupplyAndDemandPage(projectData) {
  const template = loadTemplate("supplyAndDemand");

  return template({
    PROJECT_NAME: projectData.projectName || "Unnamed Project",
    CITY: projectData.area || "Bengaluru",
    DEMAND: "16%",
    SUPPLY: "16%",
  });
}

// Process and render the pricing page
function renderPricingPage(projectData) {
  const template = loadTemplate("pricing");

  return template({
    PROJECT_NAME: projectData.projectName || "Unnamed Project",
    CITY: projectData.area || "Bengaluru",
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

// Process and render the overview page
function renderOverviewPage(projectData, firstImage) {
  const template = loadTemplate("overview");

  // Determine configurations text
  const configurationsText =
    projectData.configurations && projectData.configurations.length > 0
      ? projectData.configurations.join(", ")
      : "N/A";

  // Determine first image URL if available
  const imageUrl = firstImage || "placeholder-image.jpg";

  return template({
    PROJECT_NAME: projectData.projectName || "---",
    DEVELOPER: projectData.developerName || "---", // Replace with actual data if available
    STAGE: projectData.status || "--",
    CURRENT_PRICE: projectData.currentPrice || "--", // Replace with actual data if available
    CONFIGURATIONS: configurationsText,
    LAUNCH_DATE: projectData.launchDate || "---",
    HANDOVER_DATE: projectData.handOverDate || "---",
    ASSET_TYPE: projectData.assetType || "--",
    WATER_SOURCE: projectData.waterSource || "--",
    MICROMARKET: projectData.mircomarket || "--",
    ZONE: projectData.area || "--", // Replace with actual data if available
    PROPERTY_IMAGE: imageUrl,
  });
}

// Process and render the recommended strategy page
function renderRecommendedStrategyPage(projectData) {
  const template = loadTemplate("recommendedStrategy");
  return template({
    PROJECT_NAME: projectData.projectName || "Unnamed Project",
  });
}

// Process and render the investment highlight page
function renderInvestmentHighlightPage(projectData) {
  const template = loadTemplate("investmentHighlight");
  return template({
    PROJECT_NAME: projectData.projectName || "Unnamed Project",
  });
}

// Process and render the yearly cashflow page
function renderYearlyCashflowPage(projectData) {
  const template = loadTemplate("yearlyCashflow");
  return template({
    PROJECT_NAME: projectData.projectName || "Unnamed Project",
  });
}

// Process and render the P&E development page
function renderPEDevelopmentPage(projectData) {
  const template = loadTemplate("P&Edevelopment");
  return template({
    PROJECT_NAME: projectData.projectName || "Unnamed Project",
  });
}

// Process and render the about page
function renderAboutPage(projectData) {
  const template = loadTemplate("about");
  return template({
    PROJECT_NAME: projectData.projectName || "Unnamed Project",
  });
}

// Process and render the contact us page
function renderContactUsPage(projectData) {
  const template = loadTemplate("contactUs");
  return template({
    PROJECT_NAME: projectData.projectName || "Unnamed Project",
  });
}

// Process and render the master plan page
function renderMasterPlanPage(projectData, masterPlanImage) {
  const template = loadTemplate("masterPlan");
  return template({
    PROJECT_NAME: projectData.projectName || "---",
    LOADING: projectData.loading || "---",
    UDS_DATE: projectData.udsDate || "---",
    TOTAL_UNITS: projectData.totalUnits || "---",
    PROJECT_SIZE: projectData.projectSize || "---",
    OPEN_AREA: projectData.openArea || "---",
    CONSTRUCTION_QUALITY: projectData.constructionQuality || "---",
    ROAD_WIDTH: projectData.roadWidth || "---",
    CONSTRUCTION_PARTNER: projectData.constructionPartner || "---",
    PROJECT_DENSITY: projectData.projectDensity || "---",
    MASTER_PLAN_IMAGE: masterPlanImage || "../assets/images/master-plan.png"
  });
}

// Process and render the unit level page
function renderUnitLevelPage(projectData, unitLevelImage) {
  const template = loadTemplate("unitLevel");
  return template({
    PROJECT_NAME: projectData.projectName || "---",
    UNIT_LEVEL_IMAGE: unitLevelImage || "../assets/images/unitLevel.png",
    UNIT_CONFIGS: projectData.unitConfigs || [
      {
        type: "1BHK",
        saleableArea: "2120 Sqft",
        carpetArea: "1800 Sqft",
        loading: "56%",
        pricePerSqftSBU: "₹2,500 /Sq ft",
        pricePerSqftCA: "₹2,500 /Sq ft"
      },
      {
        type: "2BHK",
        saleableArea: "2120 Sqft",
        carpetArea: "1800 Sqft",
        loading: "56%",
        pricePerSqftSBU: "₹2,500 /Sq ft",
        pricePerSqftCA: "₹2,500 /Sq ft"
      },
      {
        type: "3BHK",
        saleableArea: "2120 Sqft",
        carpetArea: "1800 Sqft",
        loading: "56%",
        pricePerSqftSBU: "₹2,500 /Sq ft",
        pricePerSqftCA: "₹2,500 /Sq ft"
      }
    ]
  });
}

// Process and render the project comparison page
function renderProjectComparisonPage(projectData) {
  const template = loadTemplate("projectComparison");
  return template({
    PROJECT_NAME: projectData.projectName || "Unnamed Project",
    COMPARISON_DATA: projectData.comparisonData || {
      projects: [
        {
          name: "Birla Trimaya",
          config: "2, 3 & 4 BHKs",
          price: "₹1.25 Crs",
          value: "Undervalued",
          currentPrice: "₹12,500",
          futurePrice: "₹14,500",
          risk: "Low",
          cagr: "9.8%",
          irr: "18.25%",
          cashOutflow: "₹87 Lac",
          profit: "28 mn Sqft"
        },
        {
          name: "Tata Caranctic",
          config: "2, 3 & 4 BHKs",
          price: "₹1.25 Crs",
          value: "Undervalued",
          currentPrice: "₹12,500",
          futurePrice: "₹14,500",
          risk: "Low",
          cagr: "9.8%",
          irr: "18.25%",
          cashOutflow: "₹87 Lac",
          profit: "28 mn Sqft"
        },
        {
          name: "Assetz Ragam",
          config: "2, 3 & 4 BHKs",
          price: "₹1.25 Crs",
          value: "Undervalued",
          currentPrice: "₹12,500",
          futurePrice: "₹14,500",
          risk: "High",
          cagr: "9.8%",
          irr: "18.25%",
          cashOutflow: "₹87 Lac",
          profit: "28 mn Sqft"
        },
        {
          name: "Prestige Rain Tree",
          config: "2, 3 & 4 BHKs",
          price: "₹1.25 Crs",
          value: "Undervalued",
          currentPrice: "₹12,500",
          futurePrice: "₹14,500",
          risk: "Low",
          cagr: "9.8%",
          irr: "18.25%",
          cashOutflow: "₹87 Lac",
          profit: "28 mn Sqft"
        }
      ]
    }
  });
}

// Process and render the performance page
function renderPerformancePage(projectData) {
  const template = loadTemplate("performance");
  return template({
    PROJECT_NAME: projectData.projectName || "Unnamed Project",
    PERFORMANCE_DATA: projectData.performanceData || {
      metrics: [
        {
          name: "IRR",
          value: "18.25%",
          description: "Internal Rate of Return"
        },
        {
          name: "CAGR",
          value: "9.8%",
          description: "Compound Annual Growth Rate"
        },
        {
          name: "ROI",
          value: "12.5%",
          description: "Return on Investment"
        },
        {
          name: "Payback Period",
          value: "4.2 years",
          description: "Time to recover investment"
        }
      ],
      charts: {
        monthlyReturns: "chart1.png",
        yearlyGrowth: "chart2.png",
        marketComparison: "chart3.png"
      }
    }
  });
}

// Process and render the evaluation page
function renderEvaluationPage(projectData) {
  const template = loadTemplate("evalution");
  return template({
    PROJECT_NAME: projectData.projectName || "Unnamed Project",
    EVALUATION_DATA: projectData.evaluationData || {
      factors: [
        {
          name: "Nearest Metro",
          currentStatus: "Yes, 8 km",
          referenceAvg: "5 km",
          evaluation: "Good"
        },
        {
          name: "Traffic Density",
          currentStatus: "No",
          referenceAvg: "No",
          evaluation: "Good"
        },
        {
          name: "Air Quality Index",
          currentStatus: "80",
          referenceAvg: "95-100",
          evaluation: "Good"
        },
        {
          name: "Noise Levels",
          currentStatus: "<75 db",
          referenceAvg: "~85-90 dB",
          evaluation: "Good"
        },
        {
          name: "Informal Settlements",
          currentStatus: "Yes",
          referenceAvg: "No",
          evaluation: "Good"
        },
        {
          name: "Waterlogging Risk",
          currentStatus: "Yes",
          referenceAvg: "No",
          evaluation: "Good"
        },
        {
          name: "High Tension Line",
          currentStatus: "at 16 km, 440 kv",
          referenceAvg: "32 km",
          evaluation: "Good"
        }
      ]
    }
  });
}

// Process and render the project risk page
function renderProjectRiskPage(projectData) {
  const template = loadTemplate("projectRisk");
  return template({
    PROJECT_NAME: projectData.projectName || "Unnamed Project",
    RISK_DATA: projectData.riskData || {
      risks: [
        {
          title: "Builder Risk",
          value: "Medium",
          level: "medium"
        },
        {
          title: "Delay Risk",
          value: "Low",
          level: "low"
        },
        {
          title: "Legal Risk",
          value: "NA",
          level: "na"
        },
        {
          title: "Exit Risk",
          value: "High",
          level: "high"
        },
        {
          title: "Market Risk",
          value: "Medium",
          level: "medium"
        },
        {
          title: "Environmental Risk",
          value: "Low",
          level: "low"
        }
      ]
    }
  });
}

// Process and render the Google Reviews page
async function renderGoogleReviewsPage(projectData) {
  const template = await loadTemplate('GoogleReviews');
  return template({
    projectName: projectData?.projectName || 'Sample Project',
    reviews: {
      overallRating: projectData?.googleReviews?.overallRating || 4.25,
      totalReviews: projectData?.googleReviews?.totalReviews || 52,
      ratingDistribution: {
        5: { 
          count: projectData?.googleReviews?.ratingDistribution?.[5]?.count || 125,
          percentage: projectData?.googleReviews?.ratingDistribution?.[5]?.percentage || 27
        },
        4: { 
          count: projectData?.googleReviews?.ratingDistribution?.[4]?.count || 125,
          percentage: projectData?.googleReviews?.ratingDistribution?.[4]?.percentage || 40
        },
        3: { 
          count: projectData?.googleReviews?.ratingDistribution?.[3]?.count || 125,
          percentage: projectData?.googleReviews?.ratingDistribution?.[3]?.percentage || 25
        },
        2: { 
          count: projectData?.googleReviews?.ratingDistribution?.[2]?.count || 125,
          percentage: projectData?.googleReviews?.ratingDistribution?.[2]?.percentage || 5
        },
        1: { 
          count: projectData?.googleReviews?.ratingDistribution?.[1]?.count || 125,
          percentage: projectData?.googleReviews?.ratingDistribution?.[1]?.percentage || 10
        }
      },
      positiveReviews: projectData?.googleReviews?.positiveReviews || [
        { category: 'Sales', rating: 5 },
        { category: 'Project Name', rating: 5 },
        { category: 'Sales', rating: 5 },
        { category: 'Project Name', rating: 5 },
        { category: 'Sales', rating: 5 }
      ],
      negativeReviews: projectData?.googleReviews?.negativeReviews || [
        { category: 'Sales', rating: 5 },
        { category: 'Project Name', rating: 5 },
        { category: 'Sales', rating: 5 },
        { category: 'Project Name', rating: 5 },
        { category: 'Sales', rating: 5 },
        { category: 'Sales', rating: 5 }
      ],
      recentReviews: projectData?.googleReviews?.recentReviews || [
        {
          rating: 5,
          content: 'Absolute gold mine to invest in.. Really liked the integrated township plan by Tata and Birla.. They would be launching super luxurious Villaments in July - August 2024.',
          author: 'Rajan Yadav',
          date: '9th May'
        },
        {
          rating: 4,
          content: 'Absolute gold mine to invest in.. Really liked the integrated township plan by Tata and Birla.. They would be launching super luxurious Villaments in July - August 2024.',
          author: 'Rajan Yadav',
          date: '9th May'
        },
        {
          rating: 3,
          content: 'Absolute gold mine to invest in.. Really liked the integrated township plan by Tata and Birla.. They would be launching super luxurious Villaments in July - August 2024.',
          author: 'Rajan Yadav',
          date: '9th May'
        },
        {
          rating: 1,
          content: 'Absolute gold mine to invest in.. Really liked the integrated township plan by Tata and Birla.. They would be launching super luxurious Villaments in July - August 2024.',
          author: 'Rajan Yadav',
          date: '9th May'
        }
      ]
    }
  });
}

// Process and render the micromarket demand analysis page
async function renderMicromarketDemandAnalysisPage(projectData) {
  const template = await loadTemplate('MicromarketDemandAnalysis');
  return template({
    projectName: projectData?.projectName || 'Sample Project',
    micromarketData: projectData?.micromarketData || {
      demandAnalysis: {
        currentDemand: '16%',
        futureDemand: '24%',
        supplyGap: '8%',
        marketTrend: 'Growing'
      },
      keyMetrics: {
        populationGrowth: '12%',
        incomeGrowth: '15%',
        employmentRate: '85%',
        infrastructureDevelopment: 'High'
      },
      marketSegments: [
        {
          segment: 'Residential',
          demand: 'High',
          supply: 'Medium',
          gap: 'Positive'
        },
        {
          segment: 'Commercial',
          demand: 'Medium',
          supply: 'High',
          gap: 'Negative'
        },
        {
          segment: 'Industrial',
          demand: 'Low',
          supply: 'Low',
          gap: 'Neutral'
        }
      ],
      futureOutlook: {
        shortTerm: 'Positive',
        mediumTerm: 'Very Positive',
        longTerm: 'Excellent'
      }
    }
  });
}

// Process and render the micromarket supply analysis page 1
async function renderMicromarketSupplyAnalysis1Page(projectData) {
  const template = await loadTemplate('MircomarketSupplyAnalysis1');
  return template({
    projectName: projectData?.projectName || 'Sample Project',
    supplyData: projectData?.supplyData || {
      parameters: [
        {
          name: 'Devanahalli Business Park',
          distance: '5 kms',
          area: '28 mn Sqft'
        },
        {
          name: 'Airport Township',
          distance: '5 kms',
          area: '28 mn Sqft'
        },
        {
          name: 'KIADB Hardware Tech Park',
          distance: '5 kms',
          area: '28 mn Sqft'
        },
        {
          name: 'KIADB Aerospace Industry',
          distance: '5 kms',
          area: '28 mn Sqft'
        },
        {
          name: 'Prestige Tech cloud',
          distance: '5 kms',
          area: '28 mn Sqft'
        }
      ],
      totalArea: '221 mn Sqft',
      bubbleData: {
        expectedDemand: '26.52 Lac',
        readyToMove: '26.52 Lac',
        underConstruction: '26.52 Lac',
        delta: '26.52 Lac'
      }
    }
  });
}

// Process and render the micromarket supply analysis page 2
async function renderMicromarketSupplyAnalysis2Page(projectData) {
  const template = await loadTemplate('MicromarketSupplyAnalysis2');
  return template({
    projectName: projectData?.projectName || 'Sample Project',
    supplyData2: projectData?.supplyData2 || {
      parameters: [
        {
          name: 'Devanahalli Business Park',
          distance: '5 kms',
          area: '28 mn Sqft'
        },
        {
          name: 'Airport Township',
          distance: '5 kms',
          area: '28 mn Sqft'
        },
        {
          name: 'KIADB Hardware Tech Park',
          distance: '5 kms',
          area: '28 mn Sqft'
        },
        {
          name: 'KIADB Aerospace Industry',
          distance: '5 kms',
          area: '28 mn Sqft'
        },
        {
          name: 'Prestige Tech cloud',
          distance: '5 kms',
          area: '28 mn Sqft'
        }
      ],
      totalArea: '221 mn Sqft',
      bubbleData: {
        expectedDemand: '26.52 Lac',
        readyToMove: '26.52 Lac',
        underConstruction: '26.52 Lac',
        delta: '26.52 Lac'
      }
    }
  });
}

// Process and render the micromarket rental analysis page
async function renderMicromarketRentalAnalysisPage(projectData) {
  const template = await loadTemplate('MicromarketRentalAnalysis');
  return template({
    projectName: projectData?.projectName || 'Sample Project',
    rentalAnalysisData: projectData?.rentalAnalysisData || {
      rentalDemand: '10%',
      rentalSupply: '10%',
      rentalGap: '0%',
      rentalTrend: 'Stable'
    }
  });
}

// Process and render the micromarket resale analysis page
async function renderMicromarketResaleAnalysisPage(projectData) {
  const template = await loadTemplate('MicromarketResaleAnalysis');
  return template({
    projectName: projectData?.projectName || 'Sample Project',
    resaleAnalysisData: projectData?.resaleAnalysisData || {
      resaleDemand: '10%',
      resaleSupply: '10%',
      resaleGap: '0%',
      resaleTrend: 'Stable'
    }
  });
}

// Process and render the impact scores page
async function renderImpactScoresPage(projectData) {
  const template = await loadTemplate('ImpactScores');
  return template({
    projectName: projectData?.projectName || 'Sample Project',
    impactScores: projectData?.impactScores || {
      overallScore: 8,
      categories: [
        {
          name: 'Location',
          score: 8,
          description: 'Prime location with good connectivity'
        },
        {
          name: 'Developer',
          score: 7,
          description: 'Reputed developer with good track record'
        },
        {
          name: 'Price',
          score: 9,
          description: 'Competitive pricing in the market'
        },
        {
          name: 'Amenities',
          score: 8,
          description: 'Comprehensive amenities package'
        }
      ]
    }
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
    const debugMode = req.query.debug === "true";
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
    const disclaimerHtml = fs.readFileSync(
      path.join(__dirname, "templates", "disclaimer.html"),
      "utf8"
    );

    // Extract first image for overview page if available
    let firstImageUrl = null;
    if (processedImages.length > 0) {
      firstImageUrl = processedImages[0];
    }

    const overviewHtml = renderOverviewPage(projectData, firstImageUrl);
   // const detailsHtml = renderDetailsPage(projectData);
    //const specsHtml = renderSpecsPage(projectData);
    const supplyAndDemandHtml = renderSupplyAndDemandPage(projectData);
    const pricingHtml = renderPricingPage(projectData);
    //const galleryHtml = renderGalleryPage(projectName, processedImages);
    const recommendedStrategyHtml = renderRecommendedStrategyPage(projectData);
    const investmentHighlightHtml = renderInvestmentHighlightPage(projectData);
    const yearlyCashflowHtml = renderYearlyCashflowPage(projectData);
    const pEDevelopmentHtml = renderPEDevelopmentPage(projectData);
    const aboutHtml = renderAboutPage(projectData);
    const contactUsHtml = renderContactUsPage(projectData);
    const masterPlanHtml = renderMasterPlanPage(projectData, firstImageUrl);
    const unitLevelHtml = renderUnitLevelPage(projectData, firstImageUrl);
    const projectComparisonHtml = renderProjectComparisonPage(projectData);
    const performanceHtml = renderPerformancePage(projectData);
    const evaluationHtml = renderEvaluationPage(projectData);
    const projectRiskHtml = renderProjectRiskPage(projectData);
    const googleReviewsHtml = await renderGoogleReviewsPage(projectData);
    const micromarketDemandAnalysisHtml = await renderMicromarketDemandAnalysisPage(projectData);
    const micromarketSupplyAnalysis1Html = await renderMicromarketSupplyAnalysis1Page(projectData);
    const micromarketSupplyAnalysis2Html = await renderMicromarketSupplyAnalysis2Page(projectData);
    //const micromarketRentalAnalysisHtml = await renderMicromarketRentalAnalysisPage(projectData);
    const micromarketResaleAnalysisHtml = await renderMicromarketResaleAnalysisPage(projectData);
    //const impactScoresHtml = await renderImpactScoresPage(projectData);

    // Try a completely different approach - generate individual PDFs for each page and then merge them
    try {
      console.log("Attempting to generate PDF using multi-page approach...");

      // Create pages directory if it doesn't exist
      const pagesDir = path.join(__dirname, "pages");
      if (!fs.existsSync(pagesDir)) {
        fs.mkdirSync(pagesDir, { recursive: true });
      }

      // Clean up any existing PDF files in the pages directory
      const existingFiles = fs.readdirSync(pagesDir);
      for (const file of existingFiles) {
        if (file.endsWith('.pdf') || file.endsWith('.html')) {
          try {
            fs.unlinkSync(path.join(pagesDir, file));
          } catch (err) {
            console.warn(`Warning: Could not delete existing file ${file}:`, err);
          }
        }
      }

      // Write the HTML files to disk
      fs.writeFileSync(path.join(pagesDir, "cover.html"), coverHtml);
      fs.writeFileSync(path.join(pagesDir, "disclaimer.html"), disclaimerHtml);
      fs.writeFileSync(path.join(pagesDir, "overview.html"), overviewHtml);
      // fs.writeFileSync(path.join(pagesDir, "details.html"), detailsHtml);
      // fs.writeFileSync(path.join(pagesDir, "specs.html"), specsHtml);
      fs.writeFileSync(path.join(pagesDir, "supplyAndDemand.html"), supplyAndDemandHtml);
      fs.writeFileSync(path.join(pagesDir, "pricing.html"), pricingHtml);
      // if (galleryHtml) {
      //   fs.writeFileSync(path.join(pagesDir, "gallery.html"), galleryHtml);
      // }
      fs.writeFileSync(path.join(pagesDir, "recommendedStrategy.html"), recommendedStrategyHtml);
      fs.writeFileSync(path.join(pagesDir, "investmentHighlight.html"), investmentHighlightHtml);
      fs.writeFileSync(path.join(pagesDir, "yearlyCashflow.html"), yearlyCashflowHtml);
      fs.writeFileSync(path.join(pagesDir, "P&Edevelopment.html"), pEDevelopmentHtml);
      fs.writeFileSync(path.join(pagesDir, "about.html"), aboutHtml);
      fs.writeFileSync(path.join(pagesDir, "contactUs.html"), contactUsHtml);
      fs.writeFileSync(path.join(pagesDir, 'masterPlan.html'), masterPlanHtml);
      fs.writeFileSync(path.join(pagesDir, 'unitLevel.html'), unitLevelHtml);
      fs.writeFileSync(path.join(pagesDir, 'projectComparison.html'), projectComparisonHtml);
      fs.writeFileSync(path.join(pagesDir, 'performance.html'), performanceHtml);
      fs.writeFileSync(path.join(pagesDir, 'evalution.html'), evaluationHtml);
      fs.writeFileSync(path.join(pagesDir, 'projectRisk.html'), projectRiskHtml);
      fs.writeFileSync(path.join(pagesDir, 'googleReviews.html'), googleReviewsHtml);
      fs.writeFileSync(path.join(pagesDir, 'micromarketDemandAnalysis.html'), micromarketDemandAnalysisHtml);
      fs.writeFileSync(path.join(pagesDir, 'micromarketSupplyAnalysis1.html'), micromarketSupplyAnalysis1Html);
      fs.writeFileSync(path.join(pagesDir, 'micromarketSupplyAnalysis2.html'), micromarketSupplyAnalysis2Html);
      //fs.writeFileSync(path.join(pagesDir, 'micromarketRentalAnalysis.html'), micromarketRentalAnalysisHtml);
      fs.writeFileSync(path.join(pagesDir, 'micromarketResaleAnalysis.html'), micromarketResaleAnalysisHtml);
     // fs.writeFileSync(path.join(pagesDir, 'impactScores.html'), impactScoresHtml);

      // Generate PDFs for each page
      const browser = await puppeteer.launch({
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
        headless: "new"
      });

      try {
        const pdfFilenames = [];
        const page = await browser.newPage();
        
        // Set viewport to match the page size
        await page.setViewport({
          width: 1920,
          height: 1080,
          deviceScaleFactor: 1
        });

        // Helper function to generate PDF for a page
        async function generatePDF(htmlFile, pdfFile) {
          try {
            const page = await browser.newPage();
            await page.setViewport({
              width: 1920,
              height: 1080,
              deviceScaleFactor: 1
            });
            
            // Wait for fonts to load
            await page.evaluateOnNewDocument(() => {
              document.fonts.ready.then(() => {
                console.log('Fonts loaded');
              });
            });

            await page.goto(`file://${path.join(pagesDir, htmlFile)}`, {
              waitUntil: ['networkidle0', 'domcontentloaded'],
              timeout: 30000
            });

            // Wait for fonts to be loaded
            await page.evaluate(() => {
              return document.fonts.ready;
            });

            // Create a temporary file path
            const tempPdfPath = path.join(pagesDir, `temp_${pdfFile}`);
            
            await page.pdf({
              path: tempPdfPath,
              width: '1920px',
              height: '1080px',
              printBackground: true,
              margin: {
                top: "0.4in",
                right: "0.4in",
                bottom: "0.4in",
                left: "0.4in",
              },
              preferCSSPageSize: true,
            });
            
            // Move the temporary file to the final location
            const finalPdfPath = path.join(pagesDir, pdfFile);
            try {
              // Remove existing file if it exists
              if (fs.existsSync(finalPdfPath)) {
                fs.unlinkSync(finalPdfPath);
              }
              fs.renameSync(tempPdfPath, finalPdfPath);
            } catch (moveError) {
              console.error(`Error moving PDF file: ${moveError.message}`);
              // If rename fails, try copy and delete
              fs.copyFileSync(tempPdfPath, finalPdfPath);
              fs.unlinkSync(tempPdfPath);
            }
            
            pdfFilenames.push(finalPdfPath);
            await page.close();
          } catch (err) {
            console.error(`Error generating PDF for ${htmlFile}:`, err);
            throw err;
          }
        }

        // Generate PDFs for each page
        await generatePDF("cover.html", "cover.pdf");
        await generatePDF("disclaimer.html", "disclaimer.pdf");
        await generatePDF("overview.html", "overview.pdf");
        // await generatePDF("details.html", "details.pdf");
        // await generatePDF("specs.html", "specs.pdf");
        await generatePDF("supplyAndDemand.html", "supplyAndDemand.pdf");
        await generatePDF("pricing.html", "pricing.pdf");
        // if (galleryHtml) {
        //   await generatePDF("gallery.html", "gallery.pdf");
        // }
        await generatePDF("recommendedStrategy.html", "recommendedStrategy.pdf");
        await generatePDF("investmentHighlight.html", "investmentHighlight.pdf");
        await generatePDF("yearlyCashflow.html", "yearlyCashflow.pdf");
        await generatePDF("P&Edevelopment.html", "P&Edevelopment.pdf");
        await generatePDF("about.html", "about.pdf");
        await generatePDF("contactUs.html", "contactUs.pdf");
        await generatePDF("masterPlan.html", "masterPlan.pdf");
        await generatePDF("unitLevel.html", "unitLevel.pdf");
        await generatePDF("projectComparison.html", "projectComparison.pdf");
        await generatePDF("performance.html", "performance.pdf");
        await generatePDF("evalution.html", "evalution.pdf");
        await generatePDF("projectRisk.html", "projectRisk.pdf");
        await generatePDF("googleReviews.html", "googleReviews.pdf");
        await generatePDF("micromarketDemandAnalysis.html", "micromarketDemandAnalysis.pdf");
        await generatePDF("micromarketSupplyAnalysis1.html", "micromarketSupplyAnalysis1.pdf");
        await generatePDF("micromarketSupplyAnalysis2.html", "micromarketSupplyAnalysis2.pdf");
        //await generatePDF("micromarketRentalAnalysis.html", "micromarketRentalAnalysis.pdf");
        await generatePDF("micromarketResaleAnalysis.html", "micromarketResaleAnalysis.pdf");
        //await generatePDF("impactScores.html", "impactScores.pdf");

        // Merge all PDF
        const { PDFDocument } = require("pdf-lib");

        async function mergePDFs(pdfPaths) {
          const mergedPdf = await PDFDocument.create();

          for (const pdfPath of pdfPaths) {
            const pdfBytes = fs.readFileSync(pdfPath);
            const pdf = await PDFDocument.load(pdfBytes);
            const copiedPages = await mergedPdf.copyPages(
              pdf,
              pdf.getPageIndices()
            );
            copiedPages.forEach((page) => mergedPdf.addPage(page));
          }

          const mergedPdfBytes = await mergedPdf.save();
          return mergedPdfBytes;
        }

        // Create a unique filename with timestamp
        const timestamp = new Date().getTime();
        const filename = `${projectName.replace(/\s+/g, "_")}_Report.pdf`;
        const filePath = path.join(__dirname, filename);

        // Ensure the directory exists and is writable
        try {
          if (!fs.existsSync(__dirname)) {
            fs.mkdirSync(__dirname, { recursive: true });
          }
        } catch (dirError) {
          console.error("Error creating directory:", dirError);
          return res.status(500).send("Failed to create directory for PDF generation");
        }

        const mergedPdfBytes = await mergePDFs(pdfFilenames);
        
        // Write to a temporary file first
        const tempFilePath = path.join(__dirname, `temp_${filename}`);
        try {
          fs.writeFileSync(tempFilePath, mergedPdfBytes);
          // Move the temporary file to the final location
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
          fs.renameSync(tempFilePath, filePath);
        } catch (writeError) {
          console.error("Error writing PDF file:", writeError);
          return res.status(500).send("Failed to write PDF file");
        }

        // Send the PDF as a download
        res.download(filePath, filename, (err) => {
          if (err) {
            console.error("Error sending file:", err);
          }
          // Clean up files after sending
          try {
            // Clean up the HTML files
            const filesToClean = [
              "cover.html", "disclaimer.html","supplyAndDemand.html", "pricing.html", "performance.html", 
              "overview.html", "masterPlan.html", "unitLevel.html","evalution.html",
              "projectRisk.html","googleReviews.html", "investmentHighlight.html",
              "yearlyCashflow.html", "P&Edevelopment.html","micromarketDemandAnalysis.html",
              "micromarketSupplyAnalysis1.html", "micromarketSupplyAnalysis2.html",
              //"micromarketRentalAnalysis.html", 
              "micromarketResaleAnalysis.html",
               //"impactScores.html",
               "recommendedStrategy.html", "projectComparison.html",
               "about.html", "contactUs.html", 
            ];
            
            filesToClean.forEach(file => {
              const filePath = path.join(pagesDir, file);
              if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
              }
            });

            // Clean up the PDF files
            pdfFilenames.forEach(pdfPath => {
              if (fs.existsSync(pdfPath)) {
                fs.unlinkSync(pdfPath);
              }
            });

            // Clean up the final merged PDF
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
            }
          } catch (cleanupError) {
            console.error("Error cleaning up files:", cleanupError);
          }
        });

        // Save to Firebase after sending the file
        try {
          const result = await savePDFToFirebase(
            mergedPdfBytes,
            filename,
            projectId
          );
          console.log("PDF saved to Firebase:", result);
        } catch (saveErr) {
          console.error("Error saving to Firebase:", saveErr);
        }
      } finally {
        await browser.close();
      }
    } catch (pdfError) {
      console.error("Error generating PDF:", pdfError);
      res.status(500).send("Failed to generate PDF");
    }
  } catch (err) {
    console.error("Error generating PDF:", err);
    res.status(500).send("Failed to generate PDF");
  }
});

// Simple route to view just the cover template
app.get("/debug-cover", (req, res) => {
  try {
    const sampleData = {
      projectName: "Sample Test Project",
      status: "Under Construction",
    };

    const html = renderCoverPage(sampleData);
    res.send(html);
  } catch (err) {
    console.error("Error rendering debug cover:", err);
    res.status(500).send("Error rendering debug cover");
  }
});

// Helper function to save PDF to Firebase Storage
async function savePDFToFirebase(pdfBuffer, filename, projectId) {
  try {
    if (!projectId) {
      return res.status(400).send("Project ID is required");
    }

    console.log("Fetching project data for ID:", projectId);

    // Fetch project data from Firestore
    const projectDoc = await db.collection("assetData").doc(projectId).get();

    if (!projectDoc.exists) {
      return res.status(404).send("Project not found");
    }
    // Create a unique path for the PDF in Firebase Storage
    const pdfPath = `project-pdfs/${projectId}/${filename}`;
    const file = bucket.file(pdfPath);

    // Upload the PDF buffer to Firebase Storage
    await file.save(pdfBuffer, {
      metadata: {
        contentType: "application/pdf",
        metadata: {
          projectId: projectId,
          generatedAt: new Date().toISOString(),
        },
      },
    });

    // Get a signed URL for the uploaded PDF
    const [signedUrl] = await file.getSignedUrl({
      action: "read",
      expires: Date.now() + 7 * 24 * 60 * 60 * 1000, // URL expires in 7 days
    });

    // Save the PDF metadata to Firestore
    const docRef = db.collection("assetData").doc(projectId);
    await docRef.update({
      pdfs: admin.firestore.FieldValue.arrayUnion({
        filename: filename,
        storagePath: pdfPath,
        pdfURL: signedUrl,
      }),
    });

    return {
      url: signedUrl,
      path: pdfPath,
    };
  } catch (error) {
    console.error("Error saving PDF to Firebase:", error);
    throw error;
  }
}

// Test route to generate and save PDF to Firebase
app.get("/test-save-pdf", async (req, res) => {
  try {
    const projectId = req.query.projectId;

    if (!projectId) {
      return res.status(400).send("Project ID is required");
    }

    // Fetch project data from Firestore
    const projectDoc = await db.collection("assetData").doc(projectId).get();

    if (!projectDoc.exists) {
      return res.status(404).send("Project not found");
    }

    const projectData = projectDoc.data();
    const projectName = projectData.projectName || "Unnamed Project";

    // Generate PDF (using your existing PDF generation logic)
    const browser = await puppeteer.launch({
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
    });

    try {
      const page = await browser.newPage();

      await page.setViewport({
        width: 1200,
        height: 1600,
        deviceScaleFactor: 1,
      });

      const testContent = `
        <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; padding: 20px; }
              h1 { color: #333; }
            </style>
          </head>
          <body>
            <h1>${projectName}</h1>
            <p>Test PDF generated at: ${new Date().toLocaleString()}</p>
            <p>Project ID: ${projectId}</p>
            <p>Status: ${projectData.status || "N/A"}</p>
            <p>Location: ${projectData.location || "N/A"}</p>
          </body>
        </html>
      `;

      await page.setContent(testContent);

      // Generate PDF buffer
      const pdfBuffer = await page.pdf({
        format: "A4",
        printBackground: true,
        margin: {
          top: "0.4in",
          right: "0.4in",
          bottom: "0.4in",
          left: "0.4in",
        },
      });

      // Generate filename
      const timestamp = new Date().getTime();
      const filename = `${projectName.replace(/\s+/g, "_")}_${timestamp}.pdf`;

      // Save PDF to Firebase
      const result = await savePDFToFirebase(pdfBuffer, filename, projectId);

      res.json({
        message: "PDF generated and saved successfully",
        url: result.url,
        path: result.path,
      });
    } finally {
      await browser.close();
    }
  } catch (error) {
    console.error("Error in test-save-pdf route:", error);
    res.status(500).json({
      error: "Failed to generate and save PDF",
      details: error.message,
    });
  }
});

// Start server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
