import Express from "express";
import { RCSCustom } from "@vonage/messages";
import { Vonage } from "@vonage/server-sdk";
import { Auth } from "@vonage/auth";
import "dotenv/config";
import { verifySignature } from "@vonage/jwt";
import axios from "axios";
import fs from "fs";
import path from "path";


// Config/constants
const app = new Express();
const imagesDir = path.join(process.cwd(), "public", "images");
const port = process.env.PORT || 3000;

if (!fs.existsSync(imagesDir)) {
  fs.mkdirSync(imagesDir, { recursive: true });
}
app.use("/images", Express.static(imagesDir));

if (
  !process.env.PHONE_NUMBER ||
  !process.env.RCS_SENDER_ID ||
  !process.env.GEMINI_API_KEY ||
  !process.env.VONAGE_API_SIGNATURE_SECRET ||
  !process.env.VONAGE_PRIVATE_KEY ||
  !process.env.VONAGE_API_KEY ||
  !process.env.VONAGE_API_SECRET ||
  !process.env.VONAGE_APPLICATION_ID
) {
  console.error("Missing required environment variables. Please check your .env file.");
  process.exit(1);
}

// Vonage SDK setup (inlined)
const privateKey = fs.readFileSync(process.env.VONAGE_PRIVATE_KEY).toString();
const auth = new Auth({
  apiKey: process.env.VONAGE_API_KEY,
  apiSecret: process.env.VONAGE_API_SECRET,
  applicationId: process.env.VONAGE_APPLICATION_ID,
  privateKey,
});
const vonage = new Vonage(auth);

// Middleware
const catchAsync = (fn) => (req, res, next) => {
  fn(req, res, next).catch(next);
};
app.use(Express.json());

const verifyWebhookSignature = (req, res, next) => {
  try {
    const jwtToken = req.headers.authorization.split(" ")[1];
    if (!jwtToken) {
      return res.status(401).json({ status: 401, detail: "No JWT token provided." });
    }
    const isValid = verifySignature(jwtToken, process.env.VONAGE_API_SIGNATURE_SECRET);
    if (!isValid) {
      return res.status(401).json({ status: 401, detail: "Invalid JWT signature." });
    }
    next();
  } catch {
    return res.status(401).json({ status: 401, detail: "JWT verification failed." });
  }
};

async function generateWeatherImage(city) {
  if (!process.env.WEATHER_API_KEY || !process.env.GEMINI_API_KEY) {
    throw new Error("Missing required environment variables.");
  }
  try {
    const weatherApiUrl = `http://api.weatherapi.com/v1/current.json?key=${process.env.WEATHER_API_KEY}&q=${city}&aqi=no`;
    const weatherResponse = await axios.get(weatherApiUrl);
    const weatherData = weatherResponse.data;
    const weather = weatherData.current.condition.text;
    const temperature = weatherData.current.temp_c;
    const time = weatherData.location.localtime;
    const modelId = (process.env.IMAGEN_MODEL_ID || "models/imagen-3.0-generate-002").startsWith("models/")
      ? (process.env.IMAGEN_MODEL_ID || "models/imagen-3.0-generate-002")
      : `models/${process.env.IMAGEN_MODEL_ID}`;
    const imagenApiUrl = `https://generativelanguage.googleapis.com/v1beta/${modelId}:predict?key=${process.env.GEMINI_API_KEY}`;
    const prompt = `Generate a very simple, low-detail, low-quality digital painting of the city of ${city} as a weather icon. The current weather is ${weather}, the temperature is ${temperature}°C, and the local time is ${time}. Use minimal colors and a small size (e.g., 64x64 pixels).`;
    const requestBody = {
      instances: [{ prompt }],
      parameters: {
        outputMimeType: "image/jpeg",
        sampleCount: 1,
        personGeneration: "ALLOW_ADULT",
        aspectRatio: "1:1",
        jpegQuality: 10,
        width: 64,
        height: 64,
      },
    };
    const imageGenResponse = await axios.post(imagenApiUrl, requestBody, {
      headers: { "Content-Type": "application/json" },
    });
    const predictions = imageGenResponse.data.predictions;
    if (!predictions || predictions.length === 0) {
      throw new Error("API response did not contain predictions.");
    }
    const imageBase64 = predictions[0].bytesBase64Encoded;
    if (!imageBase64) {
      throw new Error("API response did not contain image data.");
    }
    const safeCity = city.toLowerCase().replace(/[^a-z0-9]+/g, "_");
    const filename = `${safeCity}_${Date.now()}.jpeg`;
    const filepath = path.join(imagesDir, filename);
    fs.writeFileSync(filepath, Buffer.from(imageBase64, "base64"));
    const imageUrl = `/images/${filename}`;
    return { city, weather, temperature, time, imageUrl };
  } catch (error) {
    if (error.response) {
      throw new Error(error.response.statusText);
    } else {
      throw error;
    }
  }
}

const sendWeatherImageRCS = async (number, result) => {
  const { city, weather, temperature, time, imageUrl, error } = result;
  let cardDescription = error
    ? `Could not fetch weather/image for ${city}: ${error}`
    : `Weather: ${weather}\nTemperature: ${temperature}°C\nLocal Time: ${time}`;
  let mediaUrl = imageUrl
    ? `${process.env.PUBLIC_URL || "http://localhost:" + port}${imageUrl}`
    : "https://cdn-icons-png.flaticon.com/512/2917/2917637.png";
  const message = new RCSCustom({
    to: number,
    from: process.env.RCS_SENDER_ID,
    custom: {
      contentMessage: {
        richCard: {
          standaloneCard: {
            cardOrientation: "VERTICAL",
            cardContent: {
              title: `Weather in ${city}`,
              description: cardDescription,
              media: {
                height: "MEDIUM",
                contentInfo: {
                  fileUrl: mediaUrl,
                },
              },
              suggestions: [],
            },
          },
        },
      },
    },
  });
  await vonage.messages.send(message);
};

// Route handlers
// Only keep /send-weather-image endpoint
app.get(
  "/send-weather-image",
  catchAsync(async (req, res) => {
    const city = req.query.city || "Paris";
    try {
      const result = await generateWeatherImage(city);
      await sendWeatherImageRCS(process.env.PHONE_NUMBER, result);
      res.status(200).json({ message: `Weather image sent for ${city}!` });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  })
);

app.post(
  "/webhooks/status",
  verifyWebhookSignature,
  catchAsync(async (req, res) => {
    res.status(200).json({ ok: true });
  })
);

app.post(
  "/webhooks/inbound",
  verifyWebhookSignature,
  catchAsync(async (req, res) => {
    const { channel, message_type, from, text } = req.body;
    if (channel === "rcs" && message_type === "text" && text) {
      const city = text.trim();
      try {
        const result = await generateWeatherImage(city);
        await sendWeatherImageRCS(from, result);
      } catch (err) {
        await sendWeatherImageRCS(from, {
          city,
          weather: "N/A",
          temperature: "N/A",
          time: "N/A",
          image: null,
          error: err.message,
        });
      }
    }
    res.status(200).json({ ok: true });
  })
);

app.all("*", (req, res) => {
  res.status(404).json({ status: 404 });
});

app.use((err, req, res, next) => {
  res.status(500).json({ status: 500, detail: err.message });
});

// Start server
app.listen(port, () => {
  console.log(`The server is currently running on port ${port}`);
});
