// Load environment variables from .env.local (development)
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { GoogleGenerativeAI } = require('@google/generative-ai');

admin.initializeApp();

// ─── Gemini Proxy Function ───────────────────────────────────────────────────
// This function proxies requests to Google Gemini API, keeping the API key secure
// on the backend instead of exposing it in the frontend code.

exports.callGemini = functions
  .runWith({ secrets: ['GEMINI_API_KEY'] })
  .https.onCall(async (data, context) => {
    // Verify user is authenticated
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated to call this function'
      );
    }

    const { messages, systemPrompt } = data;

    // Validate input
    if (!Array.isArray(messages) || !systemPrompt || typeof systemPrompt !== 'string') {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Missing or invalid messages/systemPrompt'
      );
    }

    // Limit message history to prevent abuse
    if (messages.length > 50) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Message history too long (max 50 messages)'
      );
    }

    // Verify all messages have role and content
    if (!messages.every(m => m.role && m.content && typeof m.content === 'string')) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Invalid message format'
      );
    }

    try {
      // API Key is loaded from Secret Manager via secrets parameter
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        console.error('GEMINI_API_KEY not available');
        throw new functions.https.HttpsError(
          'internal',
          'API configuration error'
        );
      }

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({
        model: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
        systemInstruction: systemPrompt,
      });

      const conversationHistory = messages.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }],
      }));

      let historyToUse = conversationHistory.filter((msg, idx) => {
        if (idx === 0 && msg.role === 'model') return false;
        return true;
      });

      if (historyToUse.length > 0 && historyToUse[0].role === 'model') {
        historyToUse = historyToUse.slice(1);
      }

      const chat = model.startChat({
        history: historyToUse.slice(0, -1),
      });

      const lastMessage = historyToUse[historyToUse.length - 1];
      if (!lastMessage || lastMessage.role !== 'user') {
        throw new Error('Last message must be from user');
      }

      const result = await chat.sendMessage(lastMessage.parts[0].text);
      const responseText = result.response.text();

      if (!responseText) {
        throw new Error('Empty response from Gemini');
      }

      return { reply: responseText };
    } catch (err) {
      console.error('Gemini API error:', err);
      throw new functions.https.HttpsError(
        'internal',
        err.message || 'Failed to get response from Gemini API'
      );
    }
  }
);

// ─── Invite User Function ─────────────────────────────────────────────────────
// Only admins can invite users, runs with Admin SDK for secure role assignment

exports.inviteUser = functions.https.onCall(async (data, context) => {
  // Verify user is authenticated
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'User must be authenticated'
    );
  }

  // Check if user is admin
  const adminRef = await admin.firestore().collection('users').doc(context.auth.uid).get();
  if (!adminRef.exists || adminRef.data().role !== 'admin') {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Only admins can invite users'
    );
  }

  const { email, role } = data;

  // Validate input
  if (!email || !['user', 'admin'].includes(role)) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Invalid email or role'
    );
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Invalid email format'
    );
  }

  try {
    // Store user document with role (secure because this runs on backend with Admin SDK)
    const cleanEmail = email.toLowerCase().trim();
    await admin.firestore().collection('users').doc(cleanEmail).set({
      email: cleanEmail,
      role: role,
      status: 'invited',
      invitedAt: admin.firestore.FieldValue.serverTimestamp(),
      invitedBy: context.auth.uid,
    }, { merge: true });

    return { success: true, message: `User ${email} invited with role ${role}` };
  } catch (err) {
    console.error('Invite user error:', err);
    throw new functions.https.HttpsError(
      'internal',
      err.message || 'Failed to invite user'
    );
  }
});
