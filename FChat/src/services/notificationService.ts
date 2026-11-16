
import notifee, {
  AndroidImportance,
  EventType,
} from '@notifee/react-native';

import {auth} from './firebase';
import {sendMessage} from './chatService';

// Display notification with WhatsApp-like Reply action
export const displayChatNotification = async (
  remoteMessage: any,
) => {
  try {
    const data = remoteMessage.data || {};

    const title =
      remoteMessage.notification?.title ||
      data.title ||
      'New Message';

    const body =
      remoteMessage.notification?.body ||
      data.body ||
      'You received a new message';

    await notifee.displayNotification({
      title,
      body,
      data,
      android: {
        channelId: 'default',
        importance: AndroidImportance.HIGH,
        sound: 'default',

        pressAction: {
          id: 'default',
          launchActivity: 'default',
        },

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
      },
    });
  } catch (error) {
    console.log('Notification Display Error:', error);
  }
};

// Handle notification Reply action
export const handleNotificationEvent = async ({
  type,
  detail,
}: any) => {
  if (
    type !== EventType.ACTION_PRESS ||
    detail.pressAction?.id !== 'reply'
  ) {
    return;
  }

  try {
    const replyText =
  typeof detail.input === 'string'
    ? detail.input.trim()
    : '';

    if (!replyText) {
      console.log('Reply message is empty');
      return;
    }

    const currentUser = auth.currentUser;

    if (!currentUser) {
      console.log('User is not logged in');
      return;
    }

    const conversationId =
      detail.notification?.data?.conversationId;

    if (!conversationId) {
      console.log('Conversation ID missing');
      return;
    }

    // Send reply directly to Firestore
    await sendMessage(
      String(conversationId),
      replyText,
      currentUser.uid,
    );

    console.log('Notification Reply Sent Successfully');

    if (detail.notification?.id) {
      await notifee.cancelNotification(
        detail.notification.id,
      );
    }
  } catch (error) {
    console.log('Notification Reply Error:', error);
  }
};
