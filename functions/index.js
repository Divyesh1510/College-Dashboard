const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require('firebase-admin');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const nodemailer = require('nodemailer');

admin.initializeApp();

// Read email credentials from environment variables 
// You must set these in your firebase project:
// firebase functions:secrets:set GMAIL_EMAIL
// firebase functions:secrets:set GMAIL_PASSWORD
function getTransporter() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_EMAIL || "YOUR_GMAIL_HERE@gmail.com", 
      pass: process.env.GMAIL_PASSWORD || "YOUR_APP_PASSWORD_HERE"
    }
  });
}

exports.sendWelcomeEmail = onDocumentCreated("loginLogs/{docId}", async (event) => {
  const snapshot = event.data;
  if (!snapshot) {
    return;
  }
  const data = snapshot.data();
  const userEmail = data.userEmail;
  const userName = data.userName || "Student";
  const userId = data.userId;

  if (!userEmail) return;

  // We only want to send an email the FIRST time they log in.
  // Let's check if there is an existing log for this user BEFORE this current document's timestamp
  const db = admin.firestore();
  
  // Find all previous logins by this user
  const userLoginsSnap = await db.collection("loginLogs")
    .where("userId", "==", userId)
    .get();

  // Filter in memory to see if they had any logins BEFORE this exact document's timestamp
  // (We do this in memory to avoid needing a Firestore Composite Index on userId + timestamp)
  const previousLogins = userLoginsSnap.docs.filter(doc => {
    const docData = doc.data();
    if (!docData.timestamp || !data.timestamp) return false;
    return docData.timestamp.toMillis() < data.timestamp.toMillis();
  });

  // If previous logins exist, they are not a new user, do not send email
  if (previousLogins.length > 0) {
    console.log(`User ${userEmail} already has previous logins. Skipping welcome email.`);
    return null;
  }

  // If we get here, it's their very first login!
  console.log(`Sending Welcome Email to NEW user: ${userEmail}`);

  const mailOptions = {
    from: `"Campus Nav Team" <${process.env.GMAIL_EMAIL}>`,
    to: userEmail,
    subject: "Welcome to Campus Nav! 🚀",
    html: `
      <div style="font-family: 'Inter', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #0F172A; color: #F8FAFC; border-radius: 16px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #4F46E5; margin: 0;">Campus Nav</h1>
        </div>
        
        <div style="background-color: #1E293B; padding: 30px; border-radius: 12px; border: 1px solid #334155;">
          <h2 style="margin-top: 0; color: #FFFFFF;">Welcome, ${userName}! 👋</h2>
          <p style="color: #CBD5E1; line-height: 1.6; font-size: 16px;">
            Thank you for logging into Campus Nav for the first time. You now have access to the smartest, most accurate way to navigate the GITAM campus.
          </p>
          <p style="color: #CBD5E1; line-height: 1.6; font-size: 16px;">
            Whether you are looking for your next class, the library, or the quickest route to the canteen, we've got you covered!
          </p>
          
          <div style="text-align: center; margin-top: 40px; margin-bottom: 20px;">
            <a href="https://campus-nav-gitam.web.app/" style="background-color: #D9252A; color: white; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: bold; font-size: 16px; display: inline-block;">
              Explore the Map
            </a>
          </div>
        </div>
        
        <div style="text-align: center; margin-top: 30px; color: #94A3B8; font-size: 12px;">
          <p>&copy; ${new Date().getFullYear()} Divyesh Reddy. All Rights Reserved.</p>
        </div>
      </div>
    `
  };

  try {
    await getTransporter().sendMail(mailOptions);
    console.log("Welcome email sent successfully.");
  } catch (error) {
    console.error("Error sending welcome email:", error);
  }

  return null;
});

exports.sendAdminReplyEmail = onDocumentCreated("emails/{docId}", async (event) => {
  const snapshot = event.data;
  if (!snapshot) return;

  const data = snapshot.data();
  const { to, userName, roomName, status, replyText } = data;

  if (!to) return;

  let statusHtml = '';
  if (status === 'approved') {
    statusHtml = `<span style="color: #10B981; font-weight: bold;">Approved & Added</span>`;
  } else if (status === 'rejected') {
    statusHtml = `<span style="color: #EF4444; font-weight: bold;">Rejected / Deleted</span>`;
  } else {
    statusHtml = `<span style="color: #3B82F6; font-weight: bold;">Reviewed</span>`;
  }

  const mailOptions = {
    from: `"Campus Nav Admin" <${process.env.GMAIL_EMAIL}>`,
    to: to,
    subject: `Update on your room request: ${roomName}`,
    html: `
      <div style="font-family: 'Inter', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #0F172A; color: #F8FAFC; border-radius: 16px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #4F46E5; margin: 0;">Campus Nav Admin</h1>
        </div>
        
        <div style="background-color: #1E293B; padding: 30px; border-radius: 12px; border: 1px solid #334155;">
          <h2 style="margin-top: 0; color: #FFFFFF;">Hello, ${userName || 'Student'}! 👋</h2>
          <p style="color: #CBD5E1; line-height: 1.6; font-size: 16px;">
            The administration has reviewed your request to add the room <strong>${roomName}</strong>.
          </p>
          <p style="color: #CBD5E1; line-height: 1.6; font-size: 16px;">
            Status: ${statusHtml}
          </p>
          
          ${replyText ? `
          <div style="background-color: rgba(59, 130, 246, 0.1); border-left: 4px solid #3B82F6; padding: 16px; border-radius: 4px; margin-top: 20px; margin-bottom: 20px;">
            <p style="color: #94A3B8; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin-top: 0; margin-bottom: 8px;">Message from Admin:</p>
            <p style="color: #F8FAFC; margin: 0; font-size: 16px; white-space: pre-wrap;">${replyText}</p>
          </div>
          ` : ''}
          
          <div style="text-align: center; margin-top: 40px; margin-bottom: 20px;">
            <a href="https://campus-nav-gitam.web.app/" style="background-color: #D9252A; color: white; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: bold; font-size: 16px; display: inline-block;">
              Open Campus Nav
            </a>
          </div>
        </div>
        
        <div style="text-align: center; margin-top: 30px; color: #94A3B8; font-size: 12px;">
          <p>&copy; ${new Date().getFullYear()} Divyesh Reddy. All Rights Reserved.</p>
        </div>
      </div>
    `
  };

  try {
    await getTransporter().sendMail(mailOptions);
    console.log(`Admin reply email sent successfully to ${to}`);
  } catch (error) {
    console.error("Error sending admin reply email:", error);
  }

  return null;
});

// OpenRouter API helper for Free Vision Models
async function callOpenRouterVision(prompt, base64Image, mimeType) {
  const apiKey = process.env.OPENROUTER_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new HttpsError("internal", "OPENROUTER_API_KEY is not set in environment.");
  }

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://campus-nav-gitam.web.app",
      "X-Title": "Campus Nav"
    },
    body: JSON.stringify({
      model: "inclusionai/ling-3.0-flash-vl:free",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${base64Image}`
              }
            }
          ]
        }
      ]
    })
  });

  const data = await response.json();
  if (data.error) {
    console.error("OpenRouter API error:", data.error);
    throw new Error(data.error.message || "OpenRouter vision request failed.");
  }

  const content = data.choices?.[0]?.message?.content || "{}";
  const cleaned = content.replace(/```json/g, "").replace(/```/g, "").trim();
  return JSON.parse(cleaned);
}

exports.parseTimetableImage = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be logged in to parse timetables.");
  }

  const { base64Image, mimeType } = request.data;
  if (!base64Image || !mimeType) {
    throw new HttpsError("invalid-argument", "Missing base64Image or mimeType in request.");
  }

  try {
    const prompt = `
      Analyze this timetable screenshot from a university app.
      There are two parts to the image:
      1. A schedule grid mapping Weekdays (Monday, Tuesday, etc.) and Slots (e.g., Slot-1 8-9 am) to a Course Code (e.g., 24CSEN2041).
      2. A course details table mapping Course code to Course name, Faculty name, and Room number.

      Your task is to merge this data and return ONLY a strict JSON object with a key "classes" containing an array of objects representing each scheduled class occurrence.
      Each object should have the following exact keys:
      - "subject": The full Course name (NOT just the code). (string)
      - "faculty": The Faculty name (string)
      - "room": The Room number (string)
      - "startTime": The start time extracted from the slot (e.g. "08:00 AM") in "HH:MM AM/PM" format (string)
      - "endTime": The end time extracted from the slot (e.g. "09:00 AM") in "HH:MM AM/PM" format (string)
      - "day": The day of the week, e.g., "Monday", "Tuesday", etc. (string)

      Make sure you map every course code in the schedule grid to its details in the bottom table.
      Return ONLY raw JSON. No markdown wrappers.
    `;

    const parsed = await callOpenRouterVision(prompt, base64Image, mimeType);
    let classes = Array.isArray(parsed) ? parsed : (parsed.classes || []);

    return { classes };
  } catch (error) {
    console.error("Error parsing timetable image with OpenRouter:", error);
    throw new HttpsError("internal", error.message || "Failed to parse timetable image with OpenRouter.");
  }
});

exports.parseAttendanceImage = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be logged in to parse attendance.");
  }

  const { base64Image, mimeType } = request.data;
  if (!base64Image || !mimeType) {
    throw new HttpsError("invalid-argument", "Missing base64Image or mimeType in request.");
  }

  try {
    const prompt = `
      Analyze this attendance screenshot from a university app.
      Your task is to extract the attendance data and return ONLY a strict JSON object with a key "attendance" containing an array of objects representing each subject.
      Each object should have the following exact keys:
      - "subject": The name of the subject (string)
      - "totalClasses": The total number of classes held (number)
      - "attendedClasses": The number of classes attended (number)

      Make sure you map every subject and extract numbers correctly.
      Return ONLY raw JSON. No markdown wrappers.
    `;

    const parsed = await callOpenRouterVision(prompt, base64Image, mimeType);
    let attendance = Array.isArray(parsed) ? parsed : (parsed.attendance || []);

    return { attendance };
  } catch (error) {
    console.error("Error parsing attendance image with OpenRouter:", error);
    throw new HttpsError("internal", error.message || "Failed to parse attendance image with OpenRouter.");
  }
});
