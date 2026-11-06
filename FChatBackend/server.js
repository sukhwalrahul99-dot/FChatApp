
const express = require('express');
const cors = require('cors');

const {initializeApp, cert} = require('firebase-admin/app');
const {getFirestore} = require('firebase-admin/firestore');
const {getAuth} = require('firebase-admin/auth');
const {getMessaging} = require('firebase-admin/messaging');

// Firebase Service Account
const serviceAccount = require('./serviceAccountKey.json');

// Initialize Firebase Admin
const firebaseApp = initializeApp({
  credential: cert(serviceAccount),
});

const db = getFirestore(firebaseApp);
const auth = getAuth(firebaseApp);
const messaging = getMessaging(firebaseApp);

// Initialize Express
const app = express();

app.use(cors());
app.use(express.json());

// Test API
app.get('/', (req, res) => {
  res.status(200).send('FChat Notification Backend Running');
});

// Send notification to a single recipient
app.post('/send-notification', async (req, res) => {
  try {
    // Verify Firebase Authentication
    const authHeader = req.headers.authorization || '';

    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Authentication token required',
      });
    }

    const idToken = authHeader.substring(7);
    const decodedToken = await auth.verifyIdToken(idToken);
    const senderId = decodedToken.uid;

    const {conversationId, messageId} = req.body;

    if (!conversationId || !messageId) {
      return res.status(400).json({
        success: false,
        message: 'conversationId and messageId are required',
      });
    }

    // Get conversation
    const conversationRef = db
      .collection('conversations')
      .doc(conversationId);

    const conversationSnap = await conversationRef.get();

    if (!conversationSnap.exists) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found',
      });
    }

    const conversation = conversationSnap.data();
    const members = conversation.members || [];

    // Verify sender belongs to conversation
    if (
      !members.includes(senderId) ||
      members.length !== 2
    ) {
      return res.status(403).json({
        success: false,
        message: 'Invalid conversation access',
      });
    }

    // Get message
    const messageRef = conversationRef
      .collection('messages')
      .doc(messageId);

    const messageSnap = await messageRef.get();

    if (!messageSnap.exists) {
      return res.status(404).json({
        success: false,
        message: 'Message not found',
      });
    }

    const message = messageSnap.data();

    // Verify message sender
    if (message.senderId !== senderId) {
      return res.status(403).json({
        success: false,
        message: 'Sender does not match',
      });
    }

    // Prevent duplicate notification
    if (message.notificationSent === true) {
      return res.status(200).json({
        success: true,
        message: 'Notification already sent',
      });
    }

    // Find recipient
    const recipientId = members.find(
      uid => uid !== senderId,
    );

    if (!recipientId) {
      return res.status(400).json({
        success: false,
        message: 'Recipient not found',
      });
    }

    // Get recipient FCM token
    const recipientSnap = await db
      .collection('users')
      .doc(recipientId)
      .get();

    if (!recipientSnap.exists) {
      return res.status(404).json({
        success: false,
        message: 'Recipient user not found',
      });
    }

    const fcmToken = recipientSnap.data()?.fcmToken;

    if (!fcmToken) {
      return res.status(404).json({
        success: false,
        message: 'Recipient FCM token not found',
      });
    }

    // Notification content
    const notificationBody =
      message.messageType === 'text'
        ? message.text
        : `New ${message.messageType}`;

    // Send FCM notification
    const result = await messaging.send({
      token: fcmToken,

      notification: {
        title: 'New Message',
        body: notificationBody || 'You received a new message',
      },

      data: {
        type: 'single',
        conversationId: String(conversationId),
        senderId: String(senderId),
        messageId: String(messageId),
      },

      android: {
        priority: 'high',
        notification: {
          channelId: 'default',
          sound: 'default',
        },
      },
    });

    // Mark notification as sent
    await messageRef.update({
      notificationSent: true,
    });

    return res.status(200).json({
      success: true,
      message: 'Notification sent successfully',
      fcmMessageId: result,
    });

  } catch (error) {
    console.error('Notification API Error:', error);

    return res.status(500).json({
      success: false,
      message: error.message || 'Unable to send notification',
    });
  }
});

// Start server
const PORT = 5000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
