
const express = require('express');
const cors = require('cors');

const {initializeApp, cert} = require('firebase-admin/app');
const {getFirestore} = require('firebase-admin/firestore');
const {getAuth} = require('firebase-admin/auth');
const {getMessaging} = require('firebase-admin/messaging');

// ---------------------------------------------
// FIREBASE ADMIN INITIALIZATION
// ---------------------------------------------

const serviceAccount = require('./serviceAccountKey.json');

const firebaseApp = initializeApp({
  credential: cert(serviceAccount),
});

const db = getFirestore(firebaseApp);
const auth = getAuth(firebaseApp);
const messaging = getMessaging(firebaseApp);

// ---------------------------------------------
// EXPRESS INITIALIZATION
// ---------------------------------------------

const app = express();

app.use(cors());
app.use(express.json());

// Test API
app.get('/', (req, res) => {
  res.status(200).send('FChat Notification Backend Running');
});

// ---------------------------------------------
// SEND SINGLE / GROUP NOTIFICATION
// ---------------------------------------------

app.post('/send-notification', async (req, res) => {
  try {
    // 1. Verify Firebase Authentication
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

    // 2. Get request data
    const {
      conversationId,
      messageId,
      notificationType,
    } = req.body;

    if (!conversationId || !messageId || !notificationType) {
      return res.status(400).json({
        success: false,
        message:
          'conversationId, messageId and notificationType are required',
      });
    }

    if (!['single', 'group'].includes(notificationType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid notification type',
      });
    }

    // 3. Get conversation
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

    // 4. Validate conversation members
    if (!Array.isArray(members) || !members.includes(senderId)) {
      return res.status(403).json({
        success: false,
        message: 'Invalid conversation access',
      });
    }

    // 5. Identify conversation type
    const actualType =
      conversation.type === 'group' || members.length > 2
        ? 'group'
        : 'single';

    if (
      (actualType === 'single' && members.length !== 2) ||
      (actualType === 'group' && members.length < 3)
    ) {
      return res.status(400).json({
        success: false,
        message: 'Invalid conversation members',
      });
    }

    if (notificationType !== actualType) {
      return res.status(400).json({
        success: false,
        message: 'Notification type does not match conversation',
      });
    }

    // 6. Get message
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

    // 7. Verify message sender
    if (message.senderId !== senderId) {
      return res.status(403).json({
        success: false,
        message: 'Sender does not match',
      });
    }

    // 8. Prevent duplicate notification
    if (message.notificationSent === true) {
      return res.status(200).json({
        success: true,
        message: 'Notification already sent',
      });
    }

    // 9. Get sender details
    const senderSnap = await db
      .collection('users')
      .doc(senderId)
      .get();

    const senderName = senderSnap.exists
      ? senderSnap.data()?.name || 'New Message'
      : 'New Message';

    // 10. Notification body
    const notificationBody =
      message.messageType === 'text'
        ? message.text
        : `New ${message.messageType || 'message'}`;

    // 11. Find recipients
    // Sender will not receive their own notification
    const recipientIds = members.filter(
      uid => uid !== senderId,
    );

    if (recipientIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No recipients found',
      });
    }

    // 12. Get recipient FCM tokens
    const recipientSnapshots = await Promise.all(
      recipientIds.map(uid =>
        db.collection('users').doc(uid).get(),
      ),
    );

    const tokens = [];
    const tokenOwners = [];

    recipientSnapshots.forEach((snapshot, index) => {
      if (!snapshot.exists) {
        return;
      }

      const token = snapshot.data()?.fcmToken;

      if (token) {
        tokens.push(token);
        tokenOwners.push(recipientIds[index]);
      }
    });

    if (tokens.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No recipient FCM tokens found',
      });
    }

    // Firebase multicast supports up to 500 tokens per request
    if (tokens.length > 500) {
      return res.status(400).json({
        success: false,
        message: 'Maximum 500 recipients allowed per request',
      });
    }

    // 13. Prepare notification data
    const notificationData = {
      type: notificationType,
      notificationType,
      conversationId: String(conversationId),
      senderId: String(senderId),
      senderName: String(senderName),
      messageId: String(messageId),
    };

    if (actualType === 'group') {
      notificationData.groupName = String(
        conversation.groupName || 'Group Chat',
      );
    }

    // 14. Prepare title
    const notificationTitle =
      actualType === 'group'
        ? `${senderName} in ${conversation.groupName || 'Group'}`
        : senderName;

    // 15. Send notification to recipients
    const multicastResult =
      await messaging.sendEachForMulticast({
        tokens,

        notification: {
          title: notificationTitle,
          body:
            notificationBody ||
            'You received a new message',
        },

        data: notificationData,

        android: {
          priority: 'high',
          notification: {
            channelId: 'default',
            sound: 'default',
          },
        },
      });

    // 16. Handle invalid FCM tokens
    const invalidTokenOwners = [];

    multicastResult.responses.forEach((result, index) => {
      if (!result.success) {
        console.log(
          'Notification failed:',
          tokenOwners[index],
          result.error?.message,
        );

        const errorCode = result.error?.code;

        if (
          errorCode ===
            'messaging/invalid-registration-token' ||
          errorCode ===
            'messaging/registration-token-not-registered'
        ) {
          invalidTokenOwners.push(tokenOwners[index]);
        }
      }
    });

    // Remove invalid tokens
    if (invalidTokenOwners.length > 0) {
      await Promise.all(
        invalidTokenOwners.map(uid =>
          db.collection('users').doc(uid).update({
            fcmToken: null,
          }).catch(error => {
            console.log('Token cleanup error:', error);
          }),
        ),
      );
    }

    // 17. Mark notification status
    if (multicastResult.successCount > 0) {
      await messageRef.update({
        notificationSent: true,
        notificationType,
      });
    }

    // 18. Server logs
    console.log('------------------------------');
    console.log('Notification Type:', notificationType);
    console.log('Sender:', senderName);
    console.log('Total Tokens:', tokens.length);
    console.log('Successful:', multicastResult.successCount);
    console.log('Failed:', multicastResult.failureCount);
    console.log('------------------------------');

    // 19. API response
    return res.status(200).json({
      success: multicastResult.successCount > 0,
      notificationType,
      senderName,
      totalRecipients: tokens.length,
      successCount: multicastResult.successCount,
      failureCount: multicastResult.failureCount,
      message: 'Notification processing completed',
    });

  } catch (error) {
    console.error('Notification API Error:', error);

    return res.status(500).json({
      success: false,
      message:
        error.message || 'Unable to send notification',
    });
  }
});

// ---------------------------------------------
// START SERVER
// ---------------------------------------------

const PORT = 5000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`FChat Notification Server running on port ${PORT}`);
});