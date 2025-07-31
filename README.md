# AI Visual Weather Forecasts via Vonage RCS

This project demonstrates how to combine AI-generated weather images with the Vonage Messages API to send rich card forecasts via RCS. The app fetches real-time weather for a city, generates a simple weather icon using an AI image model, and delivers it as a rich card to an RCS-capable phone.

## Features

- Fetches current weather for any city using the WeatherAPI.
- Generates a low-detail weather icon using an AI image model.
- Sends a rich card with image and weather details via RCS using Vonage.

## Prerequisites

- [Node.js](https://nodejs.org/en/download)
- [Vonage Developer Account](https://developer.vonage.com/sign-up)
- Registered RCS Business Messaging (RBM) Agent
- RCS-capable phone for testing
- API keys for WeatherAPI and your AI image model (e.g., Gemini/Imagen)
- Your Vonage application private key file (`private.key`)

## Setup

1. Clone this repository:

   ```sh
   git clone https://github.com/Vonage-Community/blog-messages-nodejs-google-rcs_weather_forecast.git
   cd blog-messages-nodejs-google-rcs_weather_forecast
   ```

2. Install dependencies:

   ```sh
   npm install
   ```

3. Configure environment variables:

   - Copy `.env.example` to `.env` and fill in all required values:
     ```
     VONAGE_APPLICATION_ID=
     VONAGE_PRIVATE_KEY=./private.key
     RCS_SENDER_ID=
     PHONE_NUMBER=
     PORT=3000
     VONAGE_API_SIGNATURE_SECRET=
     GEMINI_API_KEY=
     WEATHER_API_KEY=
     ```

4. Add your Vonage private key:

   - Place your `private.key` file in the project root.

5. Start the server:

   ```sh
   npm start
   ```

6. Send a weather forecast:
   - Use the `/send-rcs-card` endpoint, e.g.:
     ```
     http://localhost:3000/send-weather-image?city=Paris
     ```
