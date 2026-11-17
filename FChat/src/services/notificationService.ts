
import notifee, {
  AndroidImportance,
  EventType,
} from '@notifee/react-native';

import {auth} from './firebase';
import {sendMessage} from './chatService';

// ==========================================
// DISPLAY NEXtalk NOTIFICATION
// ==========================================

export const displayChatNotification = async (
  remoteMessage: any,
) => {
  try {
    const data = remoteMessage.data || {};

    // Get currently logged-in user
    const currentUser = auth.currentUser;

    console.log('Notification Sender UID:', data.senderId);
    console.log('Logged-in User UID:', currentUser?.uid);

    // Prevent displaying own message notification
    if (currentUser && data.senderId === currentUser.uid) {
      console.log('Ignoring own message notification');
      return;
    }

    // Notification title
    const title =
      remoteMessage.notification?.title ||
      data.title ||
      'NexTalk';

    // Notification message
    const body =
      remoteMessage.notification?.body ||
      data.body ||
      'You received a new message';

    // Android notification configuration
    const androidConfig: any = {
      channelId: 'default',

      // NexTalk app logo on the left side
      smallIcon: 'nextalk_notification_logo',

      importance: AndroidImportance.HIGH,
      sound: 'default',

      pressAction: {
        id: 'default',
        launchActivity: 'default',
      },

      // Reply action
      actions: [
        {
          title: 'Reply',
          pressAction: {
            id: 'reply',
          },
          input: {
            allowFreeFormInput: true,
            placeholder: 'Type a reply...',
          },
        },
      ],
    };

    // Display notification
    await notifee.displayNotification({
      title,
      body,
      data,
      android: androidConfig,
    });

    console.log('NexTalk notification displayed successfully');
  } catch (error) {
    console.log('Notification Display Error:', error);
  }
};

// ==========================================
// HANDLE NOTIFICATION REPLY
// ==========================================

export const handleNotificationEvent = async ({
  type,
  detail,
}: any) => {
  // Check Reply button press
  if (
    type !== EventType.ACTION_PRESS ||
    detail.pressAction?.id !== 'reply'
  ) {
    return;
  }

  try {
    // Get reply text
    const replyText =
      typeof detail.input === 'string'
        ? detail.input.trim()
        : '';

    if (!replyText) {
      console.log('Reply message is empty');
      return;
    }

    // Get logged-in user
    const currentUser = auth.currentUser;

    if (!currentUser) {
      console.log('User is not logged in');
      return;
    }

    // Get conversation ID
    const conversationId =
      detail.notification?.data?.conversationId;

    if (!conversationId) {
      console.log('Conversation ID missing');
      return;
    }

    // Send reply
    await sendMessage(
      String(conversationId),
      replyText,
      currentUser.uid,
    );

    console.log('Notification Reply Sent Successfully');

    // Close notification after successful reply
    if (detail.notification?.id) {
      await notifee.cancelNotification(
        detail.notification.id,
      );
    }
  } catch (error) {
    console.log('Notification Reply Error:', error);
  }
};
