
import {
  getMessaging,
  onMessage,
} from '@react-native-firebase/messaging';

export const registerForegroundNotification = () => {
  const messaging = getMessaging();

  return onMessage(messaging, async remoteMessage => {
    console.log(
      'Foreground Notification:',
      remoteMessage.notification,
    );
    console.log('Notification Data:', remoteMessage.data);
  });
};
